package com.plantplatform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;

/**
 * 大模型 HTTP 客户端：封装服务商配置、鉴权、超时与错误提示，供数字人助手与
 * 灾害模块的结构化取数共用，避免两处各写一套调用代码。
 *
 * 目前支持智谱 GLM（zhipu）与 Kimi（moonshot），两者都是 OpenAI 兼容的
 * /chat/completions 接口，差异只在地址、模型名与部分参数取值限制。
 */
@Service
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);
    private static final String PLACEHOLDER_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxx";
    private static final String ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4";
    private static final String MOONSHOT_BASE = "https://api.moonshot.cn/v1";

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final String apiKey;
    private final String baseUrl;
    private final String model;
    private final String provider;

    public LlmClient(@Value("${app.llm.api-key:}") String apiKey,
                     @Value("${app.llm.base-url:https://open.bigmodel.cn/api/paas/v4}") String baseUrl,
                     @Value("${app.llm.model:glm-4-flash}") String model,
                     @Value("${app.llm.provider:zhipu}") String provider) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.baseUrl = baseUrl == null || baseUrl.isBlank() ? ZHIPU_BASE : baseUrl.trim();
        this.model = model == null || model.isBlank() ? "glm-4-flash" : model.trim();
        this.provider = provider == null || provider.isBlank() ? "zhipu" : provider.trim().toLowerCase(Locale.ROOT);
        log.info("大模型客户端：provider={}, base-url={}, model={}, Key 已配置={}",
                this.provider, this.baseUrl, this.model, configured());
    }

    public boolean configured() { return !apiKey.isEmpty() && !PLACEHOLDER_KEY.equals(apiKey); }

    public String model() { return model; }

    public String provider() { return provider; }

    public String baseUrl() { return baseUrl; }

    /**
     * 服务商可接受的温度默认值：Kimi k2.6/k2.7 只接受 temperature=1，
     * 传其它值会直接报 invalid_request_error；智谱常用 0.7。
     */
    public double defaultTemperature() { return "moonshot".equals(provider) ? 1.0 : 0.7; }

    public ObjectMapper mapper() { return mapper; }

    /** 未配置密钥时抛出的统一提示。 */
    public IllegalStateException notConfigured() {
        return new IllegalStateException("未配置大模型 API Key，请设置环境变量 PLANT_LLM_API_KEY 后重启后端。");
    }

    /**
     * 发送 /chat/completions 请求。
     *
     * @param payload 已组装好的完整请求体（含 model、messages 等）
     * @return 响应状态码与原始响应体
     */
    public LlmResponse chatCompletions(ObjectNode payload) throws Exception {
        if (!configured()) throw notConfigured();
        String body = mapper.writeValueAsString(payload);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl.replaceAll("/+$", "") + "/chat/completions"))
                .timeout(Duration.ofSeconds(90))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        return new LlmResponse(response.statusCode(), response.body());
    }

    /**
     * 取回模型返回的文本内容（非流式、不带工具）。
     *
     * @param system 系统提示词
     * @param user   用户提示词
     * @return 模型输出的文本，可能带 markdown 代码围栏，调用方需自行清洗
     */
    public String complete(String system, String user, double temperature, int maxTokens) throws Exception {
        ObjectNode payload = mapper.createObjectNode();
        payload.put("model", model);
        payload.put("temperature", temperature);
        payload.put("max_tokens", maxTokens > 0 ? maxTokens : 2048);
        payload.put("stream", false);
        ArrayNode messages = payload.putArray("messages");
        messages.addObject().put("role", "system").put("content", system);
        messages.addObject().put("role", "user").put("content", user);
        LlmResponse response = chatCompletions(payload);
        if (response.status() != 200) {
            throw new IllegalStateException("大模型接口返回 " + response.status() + "：" + truncate(response.body()));
        }
        JsonNode message = mapper.readTree(response.body()).path("choices").path(0).path("message");
        String content = message.path("content").asText("");
        if (content.isBlank()) throw new IllegalStateException("大模型未返回有效内容");
        return content;
    }

    /** 将状态码非 200 的响应转成带排查提示的异常。 */
    public IllegalStateException failure(LlmResponse response) {
        if (response.status() == 404) {
            return new IllegalStateException("大模型接口返回 404：" + truncate(response.body())
                    + "（模型 ID 可能已下线或当前账号无权使用；可用模型见 " + baseUrl + "/models）");
        }
        return new IllegalStateException("大模型接口返回 " + response.status() + "：" + truncate(response.body()));
    }

    private String truncate(String text) {
        return text == null ? "" : (text.length() > 300 ? text.substring(0, 300) + "…" : text);
    }

    /** 原始响应：状态码 + 响应体。 */
    public record LlmResponse(int status, String body) { }
}
