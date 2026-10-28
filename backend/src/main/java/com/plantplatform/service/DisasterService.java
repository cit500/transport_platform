package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.stream.Collectors;

/**
 * 灾害风险评估：地震与泥石流两条链路，统一落到「强度指标 → 易损性曲线 → 损伤状态概率」。
 *
 * 本版约定（2026-10-28 重构）：
 * <ul>
 *   <li>评估是纯计算，不落库；只有调用 {@link #save} 时才写入 analysis_task / analysis_result；</li>
 *   <li>评估对象由界面显式圈选（assetIds），不再全表遍历；</li>
 *   <li>地震强度就是输入的 PGA（或地震动记录解析出的 PGA），不再做衰减场与场地放大；
 *       震中坐标只用于地图圆环展示与距离参考，不参与计算；</li>
 *   <li>易损性模型按「绑定当前设施的曲线优先，资产类型默认曲线兜底」解析（fragility_model.platform_asset_id）；</li>
 *   <li>道路影响传导已移除，结果只到设施级。</li>
 * </ul>
 */
@Service
public class DisasterService {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final double EARTH_RADIUS_KM = 6371.0;

    private final JdbcTemplate jdbc;
    private final AnalysisStore store;
    private final FragilityModelService models;
    private final DebrisFlowService debris;

    public DisasterService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc, AnalysisStore store,
                           FragilityModelService models, DebrisFlowService debris) {
        this.jdbc = jdbc; this.store = store; this.models = models; this.debris = debris;
    }

    // ------------------------------------------------------------------ bootstrap

    public Map<String,Object> bootstrap() {
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("regions", jdbc.queryForList("SELECT region_code regionCode,region_name regionName FROM region ORDER BY region_code"));
        out.put("assets", jdbc.queryForList("""
                SELECT id assetId, asset_name assetName, asset_type assetType,
                       longitude, latitude, region_code regionCode
                FROM transport_asset
                WHERE service_status <> 'CLOSED'
                ORDER BY asset_type, id
                """));
        out.put("assetCount", jdbc.queryForObject("SELECT COUNT(*) FROM transport_asset WHERE service_status<>'CLOSED'", Long.class));
        out.put("models", modelCatalog());
        return out;
    }

    /** 可用模型清单，按灾害类型分组；读取失败时返回空清单而不是让整个页面不可用。 */
    private Map<String,Object> modelCatalog() {
        Map<String,Object> catalog = new LinkedHashMap<>();
        try {
            catalog.put("EARTHQUAKE", models.list("EARTHQUAKE", null));
            catalog.put("DEBRIS_FLOW", models.list("DEBRIS_FLOW", null));
        } catch (RuntimeException e) {
            catalog.put("error", e.getMessage());
            catalog.put("EARTHQUAKE", List.of());
            catalog.put("DEBRIS_FLOW", List.of());
        }
        return catalog;
    }

    // ------------------------------------------------------------------ evaluate（纯计算，不落库）

    public Map<String,Object> evaluate(Map<String,Object> input) {
        String hazard = text(input.get("hazardType"), "EARTHQUAKE");
        return "DEBRIS_FLOW".equals(hazard) ? evaluateDebris(input) : evaluateEarthquake(input);
    }

    private Map<String,Object> evaluateEarthquake(Map<String,Object> input) {
        String hazard = "EARTHQUAKE";
        double sourceLon = number(input.get("longitude"), 106.55);
        double sourceLat = number(input.get("latitude"), 29.56);
        boolean allowResearch = bool(input.get("allowResearch"));

        // 强度取值：上传地震动记录优先，其次统一 PGA；不做衰减与场地放大
        Double recordPga = null;
        Map<String,Object> groundMotion = null;
        Object gmInput = input.get("groundMotion");
        if (gmInput instanceof Map<?,?> gm) {
            String content = gm.get("content") == null ? "" : String.valueOf(gm.get("content"));
            if (!content.isBlank()) {
                GroundMotionParser.GroundMotion parsed = GroundMotionParser.parse(
                        content,
                        String.valueOf(gm.get("filename") == null ? "record.txt" : gm.get("filename")),
                        gm.get("unit") == null ? null : String.valueOf(gm.get("unit")),
                        gm.get("dt") == null ? null : number(gm.get("dt"), Double.NaN));
                recordPga = parsed.pgaG();
                groundMotion = new LinkedHashMap<>();
                groundMotion.put("filename", parsed.filename());
                groundMotion.put("format", parsed.format());
                groundMotion.put("npts", parsed.npts());
                groundMotion.put("dt", parsed.dt());
                groundMotion.put("durationS", parsed.durationS());
                groundMotion.put("pgaG", round6(parsed.pgaG()));
                groundMotion.put("unit", parsed.unitOriginal());
                groundMotion.put("warnings", parsed.warnings());
            }
        }
        final double pga = recordPga != null ? recordPga : number(input.get("pgaG"), 0.20);
        final String imMode = groundMotion != null ? "GROUND_MOTION" : "UNIFORM_PGA";

        Map<String,Object> result = assessAssets(hazard, assetIds(input), allowResearch,
                (row, assetType) -> pga);
        result.put("imMode", imMode);
        result.put("sourceLongitude", sourceLon);
        result.put("sourceLatitude", sourceLat);
        result.put("pgaG", round6(pga));
        result.put("groundMotion", groundMotion);
        result.put("summaryJson", Map.of(
                "pgaG", round6(pga),
                "evaluatedCount", number(result.get("evaluatedCount"), 0),
                "pendingCount", number(result.get("pendingCount"), 0)));
        return result;
    }

    private Map<String,Object> evaluateDebris(Map<String,Object> input) {
        String hazard = "DEBRIS_FLOW";
        double sourceLon = number(input.get("longitude"), 107.76);
        double sourceLat = number(input.get("latitude"), 29.33);
        boolean allowResearch = bool(input.get("allowResearch"));

        Map<String,Object> context = new LinkedHashMap<>();
        if (input.get("debrisContext") instanceof Map<?,?> provided) context.putAll((Map<String,Object>) provided);
        else context.putAll(debris.context(text(input.get("regionName"), null), sourceLon, sourceLat, 6));

        Map<String,Object> process = debris.intensity(context);
        double bridgeIndex = number(process.get("intensityBridge"), 0.0);
        double tunnelIndex = number(process.get("intensityTunnel"), 0.0);

        // 影响半径：未显式传值时按汇水面积推导（4·√A，下限 10km）
        boolean radiusAuto = input.get("influenceRadiusKm") == null;
        double radiusKm = radiusAuto
                ? Math.max(10.0, 4.0 * Math.sqrt(Math.max(0.5, number(context.get("catchmentAreaKm2"), 5.5))))
                : number(input.get("influenceRadiusKm"), 15.0);

        Map<String,Object> result = assessAssets(hazard, assetIds(input), allowResearch,
                (row, assetType) -> debris.decay("TUNNEL".equals(assetType) ? tunnelIndex : bridgeIndex,
                        distance(sourceLat, sourceLon, number(row.get("latitude"), sourceLat), number(row.get("longitude"), sourceLon)),
                        radiusKm));
        result.put("imMode", "DEBRIS_INTENSITY");
        result.put("sourceLongitude", sourceLon);
        result.put("sourceLatitude", sourceLat);
        result.put("occurrenceProbability", r2(number(process.get("occurrenceProbability"), 0.0)));
        result.put("influenceRadiusKm", r2(radiusKm));
        result.put("influenceRadiusAuto", radiusAuto);
        result.put("impactAreaKm2", r2(Math.PI * radiusKm * radiusKm));
        result.put("debrisContext", context);
        Map<String,Object> summary = new LinkedHashMap<>(process);
        summary.put("evaluatedCount", number(result.get("evaluatedCount"), 0));
        summary.put("pendingCount", number(result.get("pendingCount"), 0));
        result.put("summaryJson", summary);
        return result;
    }

    /** 逐设施评估公共流程：查指定设施 → 解析模型（绑定优先） → 曲线求值 → 组装 DRAFT 结果。 */
    private Map<String,Object> assessAssets(String hazard, List<Long> assetIds, boolean allowResearch,
                                            BiFunction<Map<String,Object>, String, Double> imOf) {
        List<Map<String,Object>> assetRows = assetIds.isEmpty() ? List.of() : jdbc.queryForList("""
                SELECT id assetId, asset_name assetName, asset_type assetType,
                       longitude, latitude, region_code regionCode
                FROM transport_asset
                WHERE service_status <> 'CLOSED' AND id IN (%s)
                ORDER BY id
                """.formatted(assetIds.stream().map(id -> "?").collect(Collectors.joining(","))),
                assetIds.toArray());

        List<Map<String,Object>> assets = new ArrayList<>();
        int[] damage = new int[5];
        int pending = 0, affectedBridge = 0, affectedTunnel = 0, evaluated = 0;
        double damageSum = 0.0, imSum = 0.0, imMax = 0.0;

        for (Map<String,Object> row : assetRows) {
            String assetType = text(row.get("assetType"), "BRIDGE");
            double im = imOf.apply(row, assetType);
            FragilityModelService.Model model;
            try {
                model = models.defaultFor(hazard, assetType, allowResearch,
                        row.get("assetId") == null ? null : ((Number) row.get("assetId")).longValue());
            } catch (RuntimeException e) {
                model = null;
            }

            Map<String,Object> item = new LinkedHashMap<>(row);
            item.put("imValue", round6(im));
            item.put("imType", model == null ? null : model.imType());
            try {
                if (model == null) {
                    throw new IllegalStateException("该资产类型没有可用的易损性模型，可勾选“允许使用研究参考模型”后重试");
                }
                Map<String,Object> assessment = models.assess(model, im);
                item.putAll(assessment);
                String dominant = text(assessment.get("dominantDamageState"), "DS0");
                int ds = dsIndex(dominant);
                damage[ds]++;
                damageSum += number(assessment.get("damageProbability"), 0.0);
                evaluated++;
                if (ds >= 1) { if ("TUNNEL".equals(assetType)) affectedTunnel++; else affectedBridge++; }
                item.put("damageState", dominant);
                item.put("damageLevel", dominant);
                item.put("damageProbability", r2(number(assessment.get("damageProbability"), 0.0) * 100));
                item.put("passabilityStatus", ds >= 4 ? "BLOCKED" : ds >= 2 ? "CONDITIONAL" : "PASS");
                item.put("assessmentReason", "对数正态易损性曲线：" + model.assetName() + "，IM=" + round6(im)
                        + " " + model.imUnit() + (Boolean.TRUE.equals(assessment.get("extrapolated")) ? "（超出模型验证范围，结果为外推）" : ""));
            } catch (RuntimeException e) {
                pending++;
                item.put("damageState", "PENDING_DATA");
                item.put("damageLevel", "PENDING_DATA");
                item.put("damageProbability", 0.0);
                item.put("passabilityStatus", "PENDING_DATA");
                item.put("assessmentReason", "无法给出损伤概率：" + e.getMessage());
            }
            imSum += im;
            imMax = Math.max(imMax, im);
            assets.add(item);
        }

        double avgDamage = evaluated == 0 ? 0 : damageSum / evaluated;
        double affectedRatio = assets.isEmpty() ? 0 : (double) (affectedBridge + affectedTunnel) / assets.size();
        double riskScore = r2(100 * (0.5 * avgDamage + 0.5 * affectedRatio));

        Map<String,Object> result = new LinkedHashMap<>();
        result.put("hazardType", hazard);
        result.put("status", "DRAFT");
        result.put("riskScore", riskScore);
        result.put("riskLevel", riskScore >= 60 ? "高风险" : riskScore >= 30 ? "中风险" : "低风险");
        result.put("maxIntensity", round6(imMax));
        result.put("avgIntensity", round6(assets.isEmpty() ? 0 : imSum / assets.size()));
        result.put("evaluatedCount", evaluated);
        result.put("pendingCount", pending);
        result.put("affectedBridgeCount", affectedBridge);
        result.put("affectedTunnelCount", affectedTunnel);
        result.put("assets", assets);
        List<Map<String,Object>> distribution = new ArrayList<>();
        for (int i = 0; i < 5; i++) distribution.add(Map.of("name", "DS" + i, "value", damage[i]));
        distribution.add(Map.of("name", "PENDING_DATA", "value", pending));
        result.put("damageDistribution", distribution);
        result.put("evaluatedAt", LocalDateTime.now().format(TIME));
        return result;
    }

    // ------------------------------------------------------------------ save（唯一落库入口）

    /**
     * 保存评估结果：一次灾害事件一个任务，桥梁与隧道两组结果合并入库。
     * 请求体：{taskName, hazardType, input, bridgeResult, tunnelResult}，后两组至少一组含评估设施。
     */
    @Transactional("platformTransactionManager")
    public Map<String,Object> save(Map<String,Object> body) {
        String taskName = text(body.get("taskName"), null);
        if (taskName == null) throw new IllegalArgumentException("请填写任务名称");
        String hazard = text(body.get("hazardType"), "EARTHQUAKE");
        if (!"EARTHQUAKE".equals(hazard) && !"DEBRIS_FLOW".equals(hazard)) {
            throw new IllegalArgumentException("未知的灾害类型：" + hazard);
        }

        Map<String,Object> input = body.get("input") instanceof Map<?,?> m ? (Map<String,Object>) m : Map.of();
        Map<String,Object> bridgeResult = body.get("bridgeResult") instanceof Map<?,?> b ? (Map<String,Object>) b : null;
        Map<String,Object> tunnelResult = body.get("tunnelResult") instanceof Map<?,?> t ? (Map<String,Object>) t : null;

        List<Map<String,Object>> assets = new ArrayList<>();
        for (Map<String,Object> group : List.of(bridgeResult, tunnelResult)) {
            if (group != null && group.get("assets") instanceof List<?> list) {
                for (Object item : list) if (item instanceof Map<?,?> row) assets.add((Map<String,Object>) row);
            }
        }
        if (assets.isEmpty()) throw new IllegalArgumentException("没有可保存的评估结果，请先完成桥梁或隧道评估");

        Map<String,Object> primary = bridgeResult != null && bridgeResult.get("assets") instanceof List<?> bList && !bList.isEmpty()
                ? bridgeResult : tunnelResult;

        // 由全部设施重算汇总指标，避免两次独立评估各自算各自的
        int[] damage = new int[5];
        int pending = 0, affectedBridge = 0, affectedTunnel = 0, evaluated = 0;
        double damageSum = 0.0, imSum = 0.0, imMax = 0.0;
        for (Map<String,Object> asset : assets) {
            String state = text(asset.get("damageState"), "DS0");
            if ("PENDING_DATA".equals(state)) { pending++; continue; }
            int ds = dsIndex(state);
            damage[ds]++;
            damageSum += number(asset.get("damageProbability"), 0.0) / 100.0;
            evaluated++;
            if (ds >= 1) { if ("TUNNEL".equals(text(asset.get("assetType"), "BRIDGE"))) affectedTunnel++; else affectedBridge++; }
            double im = number(asset.get("imValue"), 0.0);
            imSum += im;
            imMax = Math.max(imMax, im);
        }
        double avgDamage = evaluated == 0 ? 0 : damageSum / evaluated;
        double affectedRatio = assets.isEmpty() ? 0 : (double) (affectedBridge + affectedTunnel) / assets.size();
        double riskScore = r2(100 * (0.5 * avgDamage + 0.5 * affectedRatio));

        Map<String,Object> result = new LinkedHashMap<>();
        result.put("taskName", taskName);
        result.put("moduleType", hazard);
        result.put("status", "SUCCESS");
        result.put("hazardType", hazard);
        result.put("imMode", primary.get("imMode"));
        result.put("sourceLongitude", primary.get("sourceLongitude"));
        result.put("sourceLatitude", primary.get("sourceLatitude"));
        result.put("pgaG", primary.get("pgaG"));
        result.put("groundMotion", primary.get("groundMotion"));
        result.put("occurrenceProbability", primary.get("occurrenceProbability"));
        result.put("influenceRadiusKm", primary.get("influenceRadiusKm"));
        result.put("influenceRadiusAuto", primary.get("influenceRadiusAuto"));
        result.put("impactAreaKm2", primary.get("impactAreaKm2"));
        result.put("debrisContext", primary.get("debrisContext"));
        result.put("maxIntensity", round6(imMax));
        result.put("avgIntensity", round6(assets.isEmpty() ? 0 : imSum / assets.size()));
        result.put("riskScore", riskScore);
        result.put("riskLevel", riskScore >= 60 ? "高风险" : riskScore >= 30 ? "中风险" : "低风险");
        result.put("evaluatedCount", evaluated);
        result.put("pendingCount", pending);
        result.put("affectedBridgeCount", affectedBridge);
        result.put("affectedTunnelCount", affectedTunnel);
        result.put("summaryJson", primary.get("summaryJson"));
        result.put("assets", assets);
        List<Map<String,Object>> distribution = new ArrayList<>();
        for (int i = 0; i < 5; i++) distribution.add(Map.of("name", "DS" + i, "value", damage[i]));
        distribution.add(Map.of("name", "PENDING_DATA", "value", pending));
        result.put("damageDistribution", distribution);
        result.put("evaluatedAt", primary.get("evaluatedAt"));
        result.put("savedAt", LocalDateTime.now().format(TIME));

        long taskId = store.start("DISASTER", taskName, storedInput(input, hazard, taskName, bridgeResult, tunnelResult));
        for (Map<String,Object> asset : assets) {
            store.addResult(taskId, "ASSET", "DISASTER_DAMAGE", String.valueOf(asset.get("assetId")),
                    text(asset.get("damageState"), "DS0"), number(asset.get("damageProbability"), 0.0), asset);
        }
        result.put("id", taskId);
        result.put("taskCode", "DISASTER-" + String.format("%06d", taskId));
        store.complete(taskId, result);
        return result;
    }

    /** 输入快照：保留可追溯的小字段，地震动原文等大文本替换为解析摘要，避免任务表膨胀。 */
    private static Map<String,Object> storedInput(Map<String,Object> input, String hazard, String taskName,
                                                  Map<String,Object> bridgeResult, Map<String,Object> tunnelResult) {
        Map<String,Object> stored = new LinkedHashMap<>(input);
        stored.put("eventType", hazard);
        stored.put("taskName", taskName);
        stored.putIfAbsent("occurredAt", LocalDateTime.now().format(TIME));
        if (stored.get("groundMotion") instanceof Map<?,?> gm) {
            Map<String,Object> summary = new LinkedHashMap<>();
            for (String key : List.of("filename", "format", "npts", "dt", "durationS", "pgaG", "unit", "warnings")) {
                if (gm.get(key) != null) summary.put(key, gm.get(key));
            }
            stored.put("groundMotion", summary);
        }
        List<Long> bridgeIds = resultAssetIds(bridgeResult);
        List<Long> tunnelIds = resultAssetIds(tunnelResult);
        if (!bridgeIds.isEmpty()) stored.put("bridgeAssetIds", bridgeIds);
        if (!tunnelIds.isEmpty()) stored.put("tunnelAssetIds", tunnelIds);
        stored.remove("content");
        return stored;
    }

    private static List<Long> resultAssetIds(Map<String,Object> group) {
        List<Long> ids = new ArrayList<>();
        if (group == null || !(group.get("assets") instanceof List<?> list)) return ids;
        for (Object item : list) {
            if (item instanceof Map<?,?> row && row.get("assetId") != null) ids.add(((Number) row.get("assetId")).longValue());
        }
        return ids;
    }

    // ------------------------------------------------------------------ 查询

    public Map<String,Object> result(long id) { return store.result(id, "DISASTER"); }

    /** 曲线数据：给前端绘制易损性曲线。 */
    public Map<String,Object> curves(long modelId, int points) {
        FragilityModelService.Model model = models.load(modelId);
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("model", modelSummary(model));
        out.put("limitations", model.limitations());
        out.put("curves", models.curves(model, points));
        return out;
    }

    private static Map<String,Object> modelSummary(FragilityModelService.Model model) {
        if (model == null) return Map.of("name", "未选择模型");
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("id", model.id());
        out.put("name", model.assetName());
        out.put("modelId", model.modelId());
        out.put("modelVersion", model.modelVersion());
        out.put("status", model.status());
        out.put("imType", model.imType());
        out.put("imUnit", model.imUnit());
        out.put("validRange", model.validMin() == null ? null : List.of(model.validMin(), model.validMax()));
        out.put("sourceLabel", model.sourceLabel());
        out.put("boundAssetId", model.platformAssetId());
        return out;
    }

    // ------------------------------------------------------------------ 工具

    private static List<Long> assetIds(Map<String,Object> input) {
        List<Long> ids = new ArrayList<>();
        Object value = input.get("assetIds");
        if (value instanceof List<?> list) {
            for (Object item : list) {
                try { ids.add(Long.parseLong(String.valueOf(item))); } catch (NumberFormatException ignored) { }
            }
        }
        return ids;
    }

    /** 球面距离（Haversine），单位 km。 */
    public static double distance(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    private static int dsIndex(String state) {
        if (state == null) return 0;
        return switch (state) {
            case "DS1" -> 1; case "DS2" -> 2; case "DS3" -> 3; case "DS4" -> 4; default -> 0;
        };
    }

    private static String text(Object v, String d) { return v == null || String.valueOf(v).isBlank() ? d : String.valueOf(v); }
    private static double number(Object v, double d) { try { return v == null ? d : Double.parseDouble(String.valueOf(v)); } catch (Exception e) { return d; } }
    private static boolean bool(Object v) { return v != null && ("true".equalsIgnoreCase(String.valueOf(v)) || "1".equals(String.valueOf(v))); }
    private static double r2(double v) { return Math.round(v * 100.0) / 100.0; }
    private static double round6(double v) { return Math.round(v * 1e6) / 1e6; }
}
