package com.plantplatform.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 泥石流对桥隧的影响评估：环境参数获取 + 强度指标合成。
 *
 * 说明本模块的定位：冻结研究库只有地震易损性曲线，没有泥石流模型。这里给出一套
 * 参数化、可替换的简化模型，目标是"按固定格式先给出可比对的相对结果"，不是专业结论：
 * <pre>
 *   清水峰值流量   Qb = 0.278 · ψ · i · A          （推理公式，i 为雨强 mm/h，A 为流域面积 km²）
 *   泥石流峰值流量 Qc = Qb · (1 + Cv) · 沟道系数 · 含水系数
 *   沟宽概化       B  = 6 + 3·√A                    （m）
 *   流速与流深     由曼宁公式 v = (1/n)·h^(2/3)·√S 与 Qc = B·h·v 迭代求解，n = 0.05
 *   强度指标       I = 0.5·(v²h/30) + 0.3·(淤埋/2) + 0.2·冲刷比   （桥梁）
 *                  I = 0.3·(v²h/30) + 0.6·(淤埋/2) + 0.1·冲刷比   （隧道，以洞口淤埋为主）
 * </pre>
 * 强度指标落在 fragility_model 表中 hazard_type=DEBRIS_FLOW 的默认曲线上，
 * 该曲线的 θ/β 为平台预设值，标注"待标定"，接入正式模型后整体替换。
 *
 * 环境参数（降雨、地形、物源）可由大模型按固定 JSON 结构给出，解析失败时回退到
 * 保守默认值，并在结果中如实标注数据来源，避免把估计值包装成实测值。
 */
@Service
public class DebrisFlowService {

    private static final Logger log = LoggerFactory.getLogger(DebrisFlowService.class);
    private final LlmClient llm;

    /** 缺失值回退：偏保守的重庆山区常见量级，仅用于跑通链路。 */
    private static final Map<String,Object> FALLBACK = buildFallback();

    private static Map<String,Object> buildFallback() {
        Map<String,Object> map = new LinkedHashMap<>();
        map.put("last6hMm", 15.0);
        map.put("last24hMm", 40.0);
        map.put("intensityMmH", 8.0);
        map.put("antecedentMm", 60.0);
        map.put("catchmentAreaKm2", 5.0);
        map.put("averageSlopeDegree", 25.0);
        map.put("channelLengthKm", 3.0);
        map.put("reliefM", 400.0);
        map.put("looseMaterialLevel", "中等");
        map.put("soilMoistureLevel", "潮湿");
        map.put("channelCondition", "沟道一般");
        return Map.copyOf(map);
    }

    private static final String SYSTEM_PROMPT = """
            你是交通灾害风险评估的数据助手。用户会给出中国重庆市的某个区县和位置，
            你需要给出该地用于泥石流危险性估算的环境参数。

            严格要求：
            1. 只输出一个 JSON 对象，不要任何解释文字，不要 markdown 代码围栏；
            2. 数值必须是数字（不是字符串）；无法获取的字段填 null；
            3. 枚举字段只能取给定取值之一；
            4. 单位固定：降雨 mm、雨强 mm/h、面积 km²、坡度 度、长度 km、高差 m；
            5. confidence 是 0~1 的自评置信度；sources 列出你参考的信息类型（如"公开气象预报""区域地形常识"）。

            输出结构：
            {
              "rainfall": { "last6hMm": 0, "last24hMm": 0, "intensityMmH": 0, "antecedentMm": 0 },
              "terrain":  { "catchmentAreaKm2": 0, "averageSlopeDegree": 0, "channelLengthKm": 0, "reliefM": 0 },
              "material": { "looseMaterialLevel": "较少|中等|丰富", "soilMoistureLevel": "干燥|潮湿|饱和", "channelCondition": "沟道不发育|沟道一般|沟道发育" },
              "confidence": 0.0,
              "sources": ["..."],
              "notes": "..."
            }
            """;

    public DebrisFlowService(LlmClient llm) { this.llm = llm; }

    /**
     * 获取泥石流环境参数。
     *
     * @param regionName 区县名，可为空
     * @param longitude  经度，可为空
     * @param latitude   纬度，可为空
     * @param hours      关注的最近小时数
     * @return 含 data（归一化后的参数）、source（LLM/FALLBACK）、raw（模型原始输出）与提示信息
     */
    public Map<String,Object> context(String regionName, Double longitude, Double latitude, int hours) {
        Map<String,Object> out = new LinkedHashMap<>();
        String where = (regionName == null || regionName.isBlank()) ? "指定位置" : regionName;
        String userPrompt = "请给出重庆市" + where
                + (longitude != null && latitude != null ? String.format("（约 %.4f, %.4f）", longitude, latitude) : "")
                + " 用于泥石流危险性估算的环境参数：最近 " + (hours > 0 ? hours : 6) + " 小时降雨量、最近 24 小时累计降雨量、"
                + "短历时雨强、前期降雨量，以及地形（流域面积、平均坡度、沟道长度、相对高差）与松散物源、土体含水、沟道条件。"
                + "无法确切获取时给出该区域该季节的合理估计值，并把 confidence 调低、在 notes 中说明。";

        if (!llm.configured()) {
            out.put("source", "FALLBACK");
            out.put("message", "未配置大模型密钥，使用默认环境参数（非实测值）");
            out.put("data", fallbackData());
            out.put("raw", null);
            return out;
        }
        try {
            // 温度必须用服务商可接受的值（Kimi 只允许 1），否则会被直接拒绝
            String raw = llm.complete(SYSTEM_PROMPT, userPrompt, llm.defaultTemperature(), 2048);
            Map<String,Object> data = parse(raw);
            out.put("source", "LLM");
            out.put("message", "已由大模型按固定结构给出环境参数，请核对后使用");
            out.put("data", data);
            out.put("raw", raw);
            return out;
        } catch (Exception e) {
            log.warn("泥石流环境参数获取失败，回退默认值：{}", e.getMessage());
            out.put("source", "FALLBACK");
            out.put("message", "大模型获取失败（" + e.getMessage() + "），已使用默认环境参数");
            out.put("data", fallbackData());
            out.put("raw", null);
            return out;
        }
    }

    /** 解析模型输出：剥离代码围栏、宽松定位 JSON、逐字段归一化与范围钳制。 */
    public Map<String,Object> parse(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.startsWith("```")) {
            int start = text.indexOf('{');
            int end = text.lastIndexOf('}');
            if (start >= 0 && end > start) text = text.substring(start, end + 1);
        }
        Map<String,Object> data = fallbackData();
        try {
            JsonNode root = llm.mapper().readTree(text);
            data.put("last6hMm", clamp(node(root, "rainfall", "last6hMm"), 0, 800, fallback("last6hMm")));
            data.put("last24hMm", clamp(node(root, "rainfall", "last24hMm"), 0, 1500, fallback("last24hMm")));
            data.put("intensityMmH", clamp(node(root, "rainfall", "intensityMmH"), 0, 300, fallback("intensityMmH")));
            data.put("antecedentMm", clamp(node(root, "rainfall", "antecedentMm"), 0, 1000, fallback("antecedentMm")));
            data.put("catchmentAreaKm2", clamp(node(root, "terrain", "catchmentAreaKm2"), 0.1, 500, fallback("catchmentAreaKm2")));
            data.put("averageSlopeDegree", clamp(node(root, "terrain", "averageSlopeDegree"), 1, 60, fallback("averageSlopeDegree")));
            data.put("channelLengthKm", clamp(node(root, "terrain", "channelLengthKm"), 0.1, 100, fallback("channelLengthKm")));
            data.put("reliefM", clamp(node(root, "terrain", "reliefM"), 10, 3000, fallback("reliefM")));
            data.put("looseMaterialLevel", pick(nodeText(root, "material", "looseMaterialLevel"),
                    List.of("较少", "中等", "丰富"), fallback("looseMaterialLevel").toString()));
            data.put("soilMoistureLevel", pick(nodeText(root, "material", "soilMoistureLevel"),
                    List.of("干燥", "潮湿", "饱和"), fallback("soilMoistureLevel").toString()));
            data.put("channelCondition", pick(nodeText(root, "material", "channelCondition"),
                    List.of("沟道不发育", "沟道一般", "沟道发育"), fallback("channelCondition").toString()));
            data.put("confidence", clamp(node(root, "confidence"), 0, 1, 0.0));
            data.put("notes", nodeText(root, "notes"));
            data.put("sources", sources(root));
        } catch (Exception e) {
            log.warn("泥石流参数 JSON 解析失败，回退默认值：{}", e.getMessage());
        }
        return data;
    }

    /**
     * 由环境参数合成泥石流强度指标与过程量。
     *
     * @return 含峰值流量、流速、流深、淤埋、冲刷、强度指标与发生概率的过程结果
     */
    public Map<String,Object> intensity(Map<String,Object> p) {
        double intensity = num(p.get("intensityMmH"), fallback("intensityMmH"));
        double area = num(p.get("catchmentAreaKm2"), fallback("catchmentAreaKm2"));
        double slopeDeg = num(p.get("averageSlopeDegree"), fallback("averageSlopeDegree"));
        String material = str(p.get("looseMaterialLevel"), fallback("looseMaterialLevel").toString());
        String moisture = str(p.get("soilMoistureLevel"), fallback("soilMoistureLevel").toString());
        String channel = str(p.get("channelCondition"), fallback("channelCondition").toString());

        double psi = 0.30 + ("饱和".equals(moisture) ? 0.20 : "潮湿".equals(moisture) ? 0.10 : 0.0)
                + ("丰富".equals(material) ? 0.05 : 0.0);
        double qb = 0.278 * psi * intensity * area;
        double cv = "丰富".equals(material) ? 2.5 : "中等".equals(material) ? 1.2 : 0.5;
        double channelFactor = "沟道发育".equals(channel) ? 1.2 : "沟道一般".equals(channel) ? 1.0 : 0.8;
        double moistureFactor = "饱和".equals(moisture) ? 1.35 : "潮湿".equals(moisture) ? 1.15 : 1.0;
        double qc = qb * (1 + cv) * channelFactor * moistureFactor;

        double width = 6 + 3 * Math.sqrt(area);
        double slope = Math.tan(Math.toRadians(slopeDeg));
        double manning = 0.05;
        double depth = Math.max(0.05, qc / (width * 3.0));
        double velocity = 3.0;
        for (int i = 0; i < 40; i++) {
            double nextV = (1.0 / manning) * Math.pow(depth, 2.0 / 3.0) * Math.sqrt(Math.max(slope, 1e-4));
            double nextH = Math.max(0.02, qc / (width * Math.max(nextV, 0.1)));
            if (Math.abs(nextV - velocity) < 1e-4 && Math.abs(nextH - depth) < 1e-4) { velocity = nextV; depth = nextH; break; }
            velocity = velocity * 0.5 + nextV * 0.5;
            depth = depth * 0.5 + nextH * 0.5;
        }
        double burial = Math.min(depth, 3.0);
        double scour = Math.min(3.0, 0.35 * depth * (velocity / 3.0));
        double scourRatio = Math.min(1.0, scour / 2.0);
        double impact = velocity * velocity * depth / 30.0;

        double bridgeIndex = 0.5 * impact + 0.3 * (burial / 2.0) + 0.2 * scourRatio;
        double tunnelIndex = 0.3 * impact + 0.6 * (burial / 2.0) + 0.1 * scourRatio;

        // 雨强-历时阈值：Ic = 15·D^(-0.4) mm/h，D 取 6 h；超过阈值越多，发生概率越高
        double threshold = 15 * Math.pow(6.0, -0.4);
        double occurrence = FragilityMath.normalCdf((intensity - threshold) / Math.max(0.35 * threshold, 1e-6));

        Map<String,Object> out = new LinkedHashMap<>();
        out.put("runoffCoefficient", r3(psi));
        out.put("clearWaterPeakFlowM3s", r3(qb));
        out.put("debrisPeakFlowM3s", r3(qc));
        out.put("channelWidthM", r2(width));
        out.put("flowVelocityMs", r2(velocity));
        out.put("flowDepthM", r2(depth));
        out.put("burialDepthM", r2(burial));
        out.put("scourDepthM", r2(scour));
        out.put("scourRatio", r3(scourRatio));
        out.put("impactIndex", r3(impact));
        out.put("intensityBridge", r3(bridgeIndex));
        out.put("intensityTunnel", r3(tunnelIndex));
        out.put("rainfallThresholdMmH", r2(threshold));
        out.put("occurrenceProbability", r3(Math.max(0.0, Math.min(1.0, occurrence))));
        return out;
    }

    /** 按到沟口/灾害源的距离衰减强度：影响半径内 40%~100%，超出则取 40%。 */
    public double decay(double intensity, double distanceKm, double influenceRadiusKm) {
        if (influenceRadiusKm <= 0) return intensity;
        double proximity = Math.max(0.0, Math.min(1.0, 1.0 - distanceKm / influenceRadiusKm));
        return intensity * (0.4 + 0.6 * proximity);
    }

    private static Map<String,Object> fallbackData() { return new LinkedHashMap<>(FALLBACK); }

    private static Object fallback(String key) { return FALLBACK.get(key); }

    private static JsonNode node(JsonNode root, String... path) {
        JsonNode current = root;
        for (String key : path) {
            if (current == null) return null;
            current = current.path(key);
        }
        return current == null || current.isMissingNode() || !current.isNumber() ? null : current;
    }

    private static String nodeText(JsonNode root, String... path) {
        JsonNode current = root;
        for (String key : path) {
            if (current == null) return null;
            current = current.path(key);
        }
        return current == null || current.isMissingNode() ? null : current.asText(null);
    }

    private static List<String> sources(JsonNode root) {
        JsonNode node = root.path("sources");
        List<String> out = new java.util.ArrayList<>();
        if (node.isArray()) for (JsonNode item : node) if (item.isTextual()) out.add(item.asText());
        return out;
    }

    private static double clamp(JsonNode node, double min, double max, Object fallbackValue) {
        double v = node == null ? num(fallbackValue, 0) : node.asDouble();
        if (Double.isNaN(v) || Double.isInfinite(v)) v = num(fallbackValue, 0);
        return Math.max(min, Math.min(max, v));
    }

    private static String pick(String value, List<String> allowed, String fallbackValue) {
        if (value == null || value.isBlank()) return fallbackValue;
        for (String item : allowed) if (item.equals(value.trim())) return item;
        for (String item : allowed) if (value.contains(item)) return item;
        return fallbackValue;
    }

    private static double num(Object v, Object fallbackValue) {
        try {
            double d = Double.parseDouble(String.valueOf(v));
            return Double.isFinite(d) ? d : Double.parseDouble(String.valueOf(fallbackValue));
        } catch (Exception e) {
            return Double.parseDouble(String.valueOf(fallbackValue));
        }
    }

    private static String str(Object v, String fallbackValue) {
        return v == null || String.valueOf(v).isBlank() ? fallbackValue : String.valueOf(v);
    }

    private static double r2(double v) { return Math.round(v * 100.0) / 100.0; }
    private static double r3(double v) { return Math.round(v * 1000.0) / 1000.0; }
}
