package com.plantplatform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 数字人助手：调用大模型生成回答（OpenAI 兼容接口，支持智谱 GLM 与 Kimi/Moonshot，按配置切换）。
 *
 * 系统提示词由通用人设、知识库语料（kb/assistant-kb.md）、实时数据摘要组成；
 * 通过 function calling 支持数据库只读工具，并按服务商注入联网搜索工具。
 * 密钥、地址与模型由 {@link LlmClient} 统一管理，本类只负责提示词与工具循环。
 */
@Service
public class AssistantService {

    private static final Logger log = LoggerFactory.getLogger(AssistantService.class);
    private static final int MAX_TOOL_ROUNDS = 4;

    private final DashboardDataService dashboard;
    private final AssistantToolService toolService;
    private final LlmClient llm;
    private final ObjectMapper mapper;
    /** 是否启用服务商自带联网搜索（两家均支持）。 */
    private final boolean webSearch;
    /** 采样温度：服务商限制不同（Kimi k2.6/k2.7 只接受 1，智谱常用 0.7），未配置时按 provider 取值。 */
    private final double temperature;
    /** 单次回答最大 token；思考型模型会把推理 token 计入上限。 */
    private final int maxTokens;
    /** 知识库语料：classpath 下 kb/assistant-kb.md，启动时加载一次，随时可编辑扩充。 */
    private final String knowledgeBase;

    public AssistantService(DashboardDataService dashboard,
                            AssistantToolService toolService,
                            LlmClient llm,
                            @Value("${app.llm.web-search:true}") boolean webSearch,
                            @Value("${app.llm.temperature:}") String temperature,
                            @Value("${app.llm.max-tokens:2048}") int maxTokens) {
        this.dashboard = dashboard;
        this.toolService = toolService;
        this.llm = llm;
        this.mapper = llm.mapper();
        this.webSearch = webSearch;
        this.temperature = resolveTemperature(temperature, llm);
        this.maxTokens = maxTokens > 0 ? maxTokens : 2048;
        this.knowledgeBase = loadKnowledgeBase();
        log.info("数字人助手：temperature={}, max-tokens={}, 联网搜索={}, 知识库 {} 字符",
                this.temperature, this.maxTokens, this.webSearch, this.knowledgeBase.length());
        if (!configured()) {
            log.warn("未检测到 PLANT_LLM_API_KEY，数字人助手将不可用，前端快捷问题会回退预置答案");
        }
    }

    /**
     * 解析温度：显式配置优先；留空时按服务商取安全默认值。
     * Kimi k2.6/k2.7 对 temperature 做了严格校验（仅允许 1），沿用智谱的 0.7 会直接报 invalid_request_error。
     */
    private static double resolveTemperature(String configured, LlmClient llm) {
        if (configured != null && !configured.isBlank()) {
            try {
                return Double.parseDouble(configured.trim());
            } catch (NumberFormatException ignored) { /* 配置非法时回退到默认值 */ }
        }
        return llm.defaultTemperature();
    }

    /** 是否已配置真实 API Key；未配置时接口直接报错，前端回退预置问答。 */
    public boolean configured() { return llm.configured(); }

    public String model() { return llm.model(); }

    /**
     * 对话主流程：系统提示词 + 最近历史 + 当前问题 → 调用大模型。
     * 支持工具调用循环：模型可通过 function calling 调用平台数据库只读工具，
     * 最多执行 {@value #MAX_TOOL_ROUNDS} 轮，拿到工具结果后继续生成最终回答。
     * history 每项形如 {role:'user'|'assistant', text:'...'}，最多携带最近 10 条。
     */
    public String chat(String question, List<Map<String,Object>> history) throws Exception {
        if (!configured()) throw llm.notConfigured();

        ArrayNode messages = mapper.createArrayNode();
        messages.addObject().put("role", "system").put("content", systemPrompt());
        if (history != null && history.size() > 0) {
            int from = Math.max(0, history.size() - 10);
            for (Map<String,Object> item : history.subList(from, history.size())) {
                String role = "assistant".equals(item.get("role")) ? "assistant" : "user";
                Object rawText = item.get("text");
                String text = rawText == null ? "" : String.valueOf(rawText);
                if (!text.isBlank()) messages.addObject().put("role", role).put("content", text);
            }
        }
        messages.addObject().put("role", "user").put("content", question);

        for (int round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            ObjectNode payload = mapper.createObjectNode();
            payload.put("model", llm.model());
            payload.set("messages", messages);
            payload.put("temperature", temperature);
            payload.put("max_tokens", maxTokens);
            payload.put("stream", false);
            payload.set("tools", toolPayload());

            LlmClient.LlmResponse response = llm.chatCompletions(payload);
            if (response.status() != 200) throw llm.failure(response);

            JsonNode message = mapper.readTree(response.body()).path("choices").path(0).path("message");
            JsonNode toolCalls = message.path("tool_calls");

            if (!toolCalls.isArray() || toolCalls.isEmpty()) {
                String content = message.path("content").asText("");
                if (content.isBlank()) throw new IllegalStateException("大模型未返回有效回答");
                return content;
            }
            if (round == MAX_TOOL_ROUNDS) throw new IllegalStateException("工具调用轮次超限，请简化问题后重试。");

            // 回显带 tool_calls 的助手消息，再逐个补工具结果
            messages.add(message.deepCopy());
            for (JsonNode call : toolCalls) {
                String callId = call.path("id").asText();
                String name = call.path("function").path("name").asText();
                String argsJson = call.path("function").path("arguments").asText("");
                Object result = toolService.execute(name, argsJson);
                ObjectNode toolMessage = messages.addObject();
                toolMessage.put("role", "tool");
                toolMessage.put("tool_call_id", callId);
                toolMessage.put("content", mapper.writeValueAsString(result));
            }
        }
        throw new IllegalStateException("对话处理异常，请稍后重试。");
    }

    /** 组装 tools：数据库只读工具 + 服务商自带联网搜索（按 provider 注入对应格式）。 */
    private ArrayNode toolPayload() {
        ArrayNode tools = toolService.toolDefinitions();
        String provider = llm.provider();
        if (webSearch && "zhipu".equals(provider)) {
            ObjectNode webSearchTool = tools.addObject();
            webSearchTool.put("type", "web_search");
            ObjectNode option = webSearchTool.putObject("web_search");
            option.put("enable", true);
            option.put("search_result", true);
        } else if (webSearch && "moonshot".equals(provider)) {
            ObjectNode webSearchTool = tools.addObject();
            webSearchTool.put("type", "builtin_function");
            webSearchTool.putObject("function").put("name", "$web_search");
        }
        return tools;
    }

    /**
     * 系统提示词 = 通用助手人设 + 联网能力说明 + 数据库工具说明 + 知识库语料 + 实时数据摘要。
     * 助手定位：通用智能对话 + 平台领域专家，不限定只能聊平台。
     */
    private String systemPrompt() {
        String model = llm.model();
        StringBuilder prompt = new StringBuilder();
        prompt.append("你是\"韧安助手\"，交通网络多灾韧性评价可视化平台的数字人助手，底层由平台接入的大模型驱动（当前模型：")
              .append(model).append("）。\n\n");
        prompt.append("""
                你的定位是一个通用智能助手：任何领域的问题都正常、完整地回答——写代码、查概念、闲聊、翻译都可以，不必把话题拉回平台；被问到"你是什么模型/底层模型"时如实说明（""")
              .append(model).append("，平台通过官方 API 接入）。\n");
        if (webSearch && ("zhipu".equals(llm.provider()) || "moonshot".equals(llm.provider()))) {
            prompt.append("你具备联网搜索能力：天气、新闻、时事等实时信息应先联网搜索再回答，并注明信息来源与时效。\n");
        } else {
            prompt.append("当前你暂无联网与实时数据能力，遇到天气、新闻、股价等实时信息需求时明确说明\"无法获取实时数据\"，绝不编造具体数值。\n");
        }
        prompt.append("""

                平台是你最擅长的领域（回答要具体、准确、不编造功能），以下是平台知识库：
                """);
        if (knowledgeBase != null && !knowledgeBase.isBlank()) {
            prompt.append(knowledgeBase.trim()).append("\n\n");
        }
        prompt.append("""
                你可以通过 function calling 调用以下平台数据库只读查询工具获取实时业务数据：
                - list_assets：桥隧设施清单（名称/类型/状态/绑定道路/行政区）
                - region_resilience：各区县与重庆市总体的最新韧性指标
                - heavy_pass_results：每处桥隧最近一次重车通行结论
                - damage_results：每处桥隧最近一次灾害受损结果
                - analysis_tasks：历史分析任务记录
                回答涉及具体平台数据（某设施、某区县、统计数字）时，优先调用工具核实后再回答，不要凭记忆编造。\n
                """);
        try {
            Map<String,Object> overview = dashboard.overview();
            prompt.append("当前平台实时数据摘要（回答平台数据类问题时可直接引用其中的数字）：\n").append(mapper.writeValueAsString(overview)).append("\n");
        } catch (Exception ignored) { /* 数据库不可用时跳过实时数据 */ }
        return prompt.toString();
    }

    /** 启动时从 classpath 读取知识库文件；文件不存在时返回空串，助手仍可正常工作。 */
    private String loadKnowledgeBase() {
        try (var in = getClass().getResourceAsStream("/kb/assistant-kb.md")) {
            return in == null ? "" : new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }
}
