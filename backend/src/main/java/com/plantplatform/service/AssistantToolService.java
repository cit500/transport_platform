package com.plantplatform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 助手数据库只读工具集：预定义安全查询，模型通过 function calling 按需调用。
 *
 * 只暴露只读查询，不提供任何写操作；条数有上限，防止响应过大。
 * 工具定义采用 OpenAI function calling 格式，智谱 GLM / Kimi 等 OpenAI 兼容接口通用。
 */
@Service
public class AssistantToolService {
    private final AdminService admin;
    private final DashboardDataService dashboard;
    private final ObjectMapper mapper = new ObjectMapper();

    public AssistantToolService(AdminService admin, DashboardDataService dashboard) {
        this.admin = admin;
        this.dashboard = dashboard;
    }

    /** 工具定义（OpenAI tools 格式）。 */
    public ArrayNode toolDefinitions() {
        ArrayNode tools = mapper.createArrayNode();

        ObjectNode assets = function("list_assets", "查询平台桥隧设施清单（名称、类型、运营状态、绑定道路、所属行政区）。适合回答“有多少座桥/隧道”“某个设施的现状”类问题。");
        ObjectNode assetsParams = parameters(
                str("keyword", "设施名称关键词，可选"),
                enumeration("asset_type", "设施类型筛选，可选", "BRIDGE", "TUNNEL"),
                num("limit", "返回条数，默认10，最大50，可选"));
        assets.set("parameters", assetsParams);
        tools.add(assets);

        ObjectNode regions = function("region_resilience", "查询全部行政区与重庆市总体的最新韧性评估指标（韧性指数、路网连通度、灾害恢复能力）。适合“哪个区县韧性最高”“某区指标多少”类问题。");
        regions.set("parameters", parameters());
        tools.add(regions);

        ObjectNode heavy = function("heavy_pass_results", "查询每处桥隧最近一次重车通行评估结论（可通行/条件通行/禁止通行及原因）。");
        heavy.set("parameters", parameters());
        tools.add(heavy);

        ObjectNode damage = function("damage_results", "查询每处桥隧最近一次灾害受损评估结果（受损概率与 DS0–DS4 分级）。");
        damage.set("parameters", parameters());
        tools.add(damage);

        ObjectNode tasks = function("analysis_tasks", "查询历史分析任务记录（重车/灾害/韧性三类，含输入快照与完成时间）。");
        ObjectNode tasksParams = parameters(
                enumeration("task_type", "任务类型筛选，可选", "HEAVY", "DISASTER", "RESILIENCE"),
                str("keyword", "任务名称关键词，可选"),
                num("limit", "返回条数，默认10，最大20，可选"));
        tasks.set("parameters", tasksParams);
        tools.add(tasks);

        return tools;
    }

    /** 按工具名执行查询；argsJson 为模型生成的 JSON 字符串参数。 */
    public Object execute(String name, String argsJson) {
        JsonNode args = parseArgs(argsJson);
        String keyword = optionalText(args, "keyword");
        String type = optionalText(args, "asset_type") != null ? optionalText(args, "asset_type") : optionalText(args, "task_type");
        int limit = Math.max(1, Math.min(args.path("limit").asInt(10), name.equals("analysis_tasks") ? 20 : 50));
        try {
            return switch (name) {
                case "list_assets" -> admin.assets(0, limit, keyword, type);
                case "region_resilience" -> Map.of("regions", dashboard.regions(), "overall", dashboard.resilienceOverall());
                case "heavy_pass_results" -> dashboard.heavyResults();
                case "damage_results" -> dashboard.damageResults();
                case "analysis_tasks" -> admin.analysisTasks(0, limit, keyword, type);
                default -> Map.of("error", "未知工具：" + name);
            };
        } catch (Exception e) {
            return Map.of("error", "工具执行失败：" + e.getMessage());
        }
    }

    private JsonNode parseArgs(String argsJson) {
        if (argsJson == null || argsJson.isBlank()) return mapper.createObjectNode();
        try {
            return mapper.readTree(argsJson);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }

    private String optionalText(JsonNode args, String field) {
        JsonNode value = args.path(field);
        return value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
    }

    /** 组装 OpenAI function 工具节点。 */
    private ObjectNode function(String name, String description) {
        ObjectNode fn = mapper.createObjectNode();
        fn.put("type", "function");
        ObjectNode body = fn.putObject("function");
        body.put("name", name);
        body.put("description", description);
        return fn;
    }

    /** parameters 节点：properties + 空的 required（全部参数可选）。 */
    private ObjectNode parameters(ObjectNode... properties) {
        ObjectNode params = mapper.createObjectNode();
        params.put("type", "object");
        ObjectNode props = params.putObject("properties");
        for (ObjectNode property : properties) {
            String key = property.get("name").asText();
            property.remove("name");
            props.set(key, property);
        }
        params.putArray("required");
        return params;
    }

    private ObjectNode str(String name, String description) {
        ObjectNode node = mapper.createObjectNode();
        node.put("name", name);
        node.put("type", "string");
        node.put("description", description);
        return node;
    }

    private ObjectNode num(String name, String description) {
        ObjectNode node = mapper.createObjectNode();
        node.put("name", name);
        node.put("type", "integer");
        node.put("description", description);
        return node;
    }

    private ObjectNode enumeration(String name, String description, String... values) {
        ObjectNode node = str(name, description);
        ArrayNode enumValues = node.putArray("enum");
        for (String value : values) enumValues.add(value);
        return node;
    }
}
