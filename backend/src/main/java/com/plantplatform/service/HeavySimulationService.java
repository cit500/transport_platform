package com.plantplatform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/** 仅供交互演示：真实参数快照 + 随机结论，与正式 HEAVY_PASS 结果隔离。 */
@Service
public class HeavySimulationService {
    public static final String METHOD = "RANDOM_SIMULATION_V1";
    public static final List<String> STATUSES = List.of("PASS", "CONDITIONAL", "BLOCKED", "PENDING_DATA");
    private static final List<String> VEHICLE_FIELDS = List.of("grossWeightTon", "vehicleLengthM", "vehicleWidthM",
            "vehicleHeightM", "axleCount", "plannedSpeedKmh");
    private final AdminService admin;
    private final AnalysisStore store;
    private final ObjectMapper mapper;
    private final byte[] signingKey = new byte[32];

    public HeavySimulationService(AdminService admin, AnalysisStore store, ObjectMapper mapper) {
        this.admin = admin; this.store = store;
        this.mapper = mapper.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
        new SecureRandom().nextBytes(signingKey);
    }

    public Map<String, Object> context(long assetId) {
        var asset = admin.asset(assetId);
        return Map.of("asset", asset, "assetVersion", fingerprint(asset));
    }

    public Map<String, Object> assess(long assetId, Map<String, Object> input) {
        var asset = admin.asset(assetId);
        Map<String, Object> vehicle = normalizeVehicle(input.get("vehicle"));
        String scenarioId = scenario(input.get("scenarioId"));
        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("draftId", UUID.randomUUID().toString());
        draft.put("scenarioId", scenarioId); draft.put("assetId", assetId);
        draft.put("asset", asset); draft.put("assetVersion", fingerprint(asset));
        draft.put("vehicle", vehicle); draft.put("algorithmStatus", evaluateParameters(asset, vehicle));
        draft.put("method", METHOD); draft.put("simulated", true);
        draft.put("evaluatedAt", Instant.now().toString()); draft.put("issuedAt", System.currentTimeMillis());
        draft.put("explanation", "随机模拟结论，仅用于验证界面与保存流程；不依据荷载、净空或结构安全计算。");
        String json = json(draft);
        draft.put("draftToken", Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8))
                + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sign(json)));
        return draft;
    }

    /** 后续专业评估的唯一替换入口；当前明确忽略参数的物理含义，均匀随机返回四种状态。 */
    public String evaluateParameters(Map<String, Object> assetParameters, Map<String, Object> vehicleParameters) {
        Objects.requireNonNull(assetParameters); Objects.requireNonNull(vehicleParameters);
        return STATUSES.get(ThreadLocalRandom.current().nextInt(STATUSES.size()));
    }

    /** 重新规划时只复用同一情景、同一车辆且设施数据未变化的已保存结果。 */
    public Map<String, Object> validateSaved(Map<String, Object> input) {
        String scenarioId = scenario(input.get("scenarioId"));
        var vehicle = normalizeVehicle(input.get("vehicle"));
        if (!(input.get("savedAssessmentIds") instanceof List<?> ids) || ids.size() > 200)
            throw new IllegalArgumentException("待核对评估记录应为不超过200项的数组");
        List<Long> valid = new ArrayList<>();
        for (Object raw : ids) {
            try {
                long id = positiveId(raw);
                var result = store.result(id, "OTHER");
                if (METHOD.equals(result.get("method")) && scenarioId.equals(result.get("scenarioId"))
                        && vehicle.equals(result.get("vehicle"))
                        && fingerprint(admin.asset(positiveId(result.get("assetId")))).equals(result.get("assetVersion")))
                    valid.add(id);
            } catch (RuntimeException ignored) { /* 记录或设施已删除时不复用 */ }
        }
        return Map.of("validAssessmentIds", valid);
    }

    @Transactional("platformTransactionManager")
    public Map<String, Object> save(Map<String, Object> input) {
        String scenarioId = scenario(input.get("scenarioId"));
        Map<String, Object> result;
        Long parentId = null;
        if (input.get("savedAssessmentId") != null) {
            parentId = positiveId(input.get("savedAssessmentId"));
            result = new LinkedHashMap<>(store.result(parentId, "OTHER"));
            if (!METHOD.equals(result.get("method"))) throw new IllegalArgumentException("不是模拟通行评估记录");
        } else {
            result = readDraft(String.valueOf(input.getOrDefault("draftToken", "")));
        }
        if (!scenarioId.equals(result.get("scenarioId"))) throw new IllegalArgumentException("评估所属任务情景已变化，请重新评估");
        if (!normalizeVehicle(input.get("vehicle")).equals(result.get("vehicle")))
            throw new IllegalArgumentException("车辆参数已变化，请重新评估");
        long assetId = positiveId(result.get("assetId"));
        if (!fingerprint(admin.asset(assetId)).equals(result.get("assetVersion")))
            throw new IllegalArgumentException("设施档案已变化，请重新评估");
        String algorithm = String.valueOf(result.get("algorithmStatus"));
        String effective = input.get("overrideStatus") == null ? algorithm : String.valueOf(input.get("overrideStatus"));
        if (!STATUSES.contains(effective)) throw new IllegalArgumentException("通行状态不合法");
        boolean manual = !effective.equals(algorithm);
        String reason = String.valueOf(input.getOrDefault("overrideReason", "")).trim();
        if (manual && (reason.isBlank() || reason.length() > 500)) throw new IllegalArgumentException("人工调整请填写1至500字理由");
        result.remove("draftToken");
        result.put("effectiveStatus", effective); result.put("source", manual ? "MANUAL_SIMULATION" : "RANDOM_SIMULATION");
        result.put("overrideReason", manual ? reason : ""); result.put("savedAt", Instant.now().toString());
        result.put("parentAssessmentId", parentId);
        var asset = (Map<?, ?>) result.get("asset");
        Map<String, Object> taskInput = new LinkedHashMap<>();
        taskInput.put("purpose", METHOD); taskInput.put("scenarioId", scenarioId); taskInput.put("assetId", assetId);
        taskInput.put("vehicle", result.get("vehicle")); taskInput.put("parentAssessmentId", parentId);
        String taskName = "[模拟通行] " + asset.get("assetName");
        long id = store.start("OTHER", taskName.substring(0, Math.min(150, taskName.length())), taskInput);
        result.put("savedAssessmentId", id);
        store.addResult(id, "ASSET", "HEAVY_SIMULATION", String.valueOf(assetId), effective, null, result);
        store.complete(id, result);
        return result;
    }

    private Map<String, Object> readDraft(String token) {
        try {
            if (token.length() > 150000) throw new IllegalArgumentException();
            String[] parts = token.split("\\.");
            if (parts.length != 2) throw new IllegalArgumentException();
            String json = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
            if (!MessageDigest.isEqual(sign(json), Base64.getUrlDecoder().decode(parts[1]))) throw new IllegalArgumentException();
            Map<String, Object> value = mapper.readValue(json, new TypeReference<>() {});
            long issued = ((Number) value.get("issuedAt")).longValue();
            if (!METHOD.equals(value.get("method")) || System.currentTimeMillis() - issued > 30 * 60 * 1000L)
                throw new IllegalArgumentException();
            return value;
        } catch (Exception e) { throw new IllegalArgumentException("评估草稿已过期或无效，请重新评估（后端重启后草稿失效）"); }
    }
    private byte[] sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { throw new IllegalStateException("无法生成模拟评估草稿"); }
    }
    private String fingerprint(Object value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json(value).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException("无法读取设施数据版本"); }
    }
    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalArgumentException("评估参数无法序列化"); }
    }
    private static long positiveId(Object value) {
        try { long id = Long.parseLong(String.valueOf(value)); if (id > 0) return id; }
        catch (Exception ignored) { }
        throw new IllegalArgumentException("评估或设施编号不合法");
    }
    private static String scenario(Object value) {
        String id = value == null ? "" : String.valueOf(value);
        if (!id.matches("[A-Za-z0-9_-]{8,80}")) throw new IllegalArgumentException("任务情景编号不合法");
        return id;
    }
    static Map<String, Object> normalizeVehicle(Object value) {
        if (!(value instanceof Map<?, ?> raw)) throw new IllegalArgumentException("缺少重车参数");
        Map<String, Object> vehicle = new LinkedHashMap<>();
        vehicle.put("profileName", String.valueOf(raw.getOrDefault("profileName", null) == null ? "本次车辆" : raw.get("profileName")));
        for (String field : VEHICLE_FIELDS) {
            try {
                double number = Double.parseDouble(String.valueOf(raw.get(field)));
                if (!Double.isFinite(number) || number <= 0 || ("axleCount".equals(field) && number != Math.rint(number)))
                    throw new IllegalArgumentException();
                vehicle.put(field, number);
            } catch (Exception e) { throw new IllegalArgumentException("重车参数 " + field + " 必须为有效正数，轴数必须为整数"); }
        }
        return vehicle;
    }
}
