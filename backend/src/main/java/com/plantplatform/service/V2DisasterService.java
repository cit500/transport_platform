package com.plantplatform.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class V2DisasterService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public V2DisasterService(@Qualifier("v2JdbcTemplate") JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> bootstrap() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("earthquakeScenarios", jdbc.queryForList("""
            SELECT e.id,e.scenario_name scenarioName,e.event_time eventTime,e.region_code regionCode,
                   r.region_name regionName,e.longitude,e.latitude,e.seismic_intensity intensityDegree,
                   e.pga_g pgaG,e.intensity_measure_type intensityMeasure,e.duration_s durationS,
                   e.magnitude magnitudeMw,e.source_distance_km sourceDistanceKm,
                   e.site_category siteCategory,e.description,e.is_default isDefault
            FROM earthquake_scenario e JOIN region r ON r.region_code=e.region_code
            ORDER BY e.is_default DESC,e.id
            """));
        result.put("debrisScenarios", jdbc.queryForList("""
            SELECT d.id,d.scenario_name scenarioName,d.event_time eventTime,d.region_code regionCode,
                   r.region_name regionName,d.longitude,d.latitude,d.description,
                   d.rainfall_duration_h rainfallDurationH,d.average_rainfall_mm_h averageRainfallMmH,
                   d.accumulated_rainfall_mm accumulatedRainfallMm,d.antecedent_rainfall_mm antecedentRainfallMm,
                   d.catchment_area_km2 catchmentAreaKm2,d.average_slope_degree averageSlopeDegree,
                   d.channel_condition channelCondition,d.loose_material_level looseMaterialLevel,
                   d.soil_moisture_level soilMoistureLevel,d.is_default isDefault
            FROM debris_flow_scenario d JOIN region r ON r.region_code=d.region_code
            ORDER BY d.is_default DESC,d.id
            """));
        result.put("regions", jdbc.queryForList("""
            SELECT region_code regionCode,region_name regionName,center_longitude centerLongitude,
                   center_latitude centerLatitude FROM region ORDER BY region_code
            """));
        result.put("assetCount", jdbc.queryForObject("SELECT COUNT(*) FROM transport_asset WHERE service_status<>'CLOSED'", Long.class));
        result.put("recentTasks", jdbc.queryForList("""
            SELECT id,task_code taskCode,task_name taskName,module_type moduleType,status,
                   created_at createdAt,completed_at completedAt
            FROM evaluation_task WHERE module_type IN ('EARTHQUAKE','DEBRIS_FLOW')
            ORDER BY created_at DESC LIMIT 10
            """));
        return result;
    }

    @Transactional("v2TransactionManager")
    public Map<String, Object> evaluate(Map<String, Object> input) {
        String hazardType = text(input.get("hazardType"));
        if (!List.of("EARTHQUAKE", "DEBRIS_FLOW").contains(hazardType)) {
            throw new IllegalArgumentException("灾害类型必须为EARTHQUAKE或DEBRIS_FLOW");
        }
        String taskName = defaultText(input.get("taskName"), "EARTHQUAKE".equals(hazardType) ? "地震风险评估" : "泥石流风险评估");
        String taskCode = ("EARTHQUAKE".equals(hazardType) ? "EQ-" : "DF-")
            + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        String snapshot;
        try {
            snapshot = objectMapper.writeValueAsString(input);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("无法保存任务输入快照", exception);
        }

        KeyHolder key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO evaluation_task(task_code,task_name,module_type,status,algorithm_mode,
                  algorithm_version,input_snapshot_json,started_at,created_by)
                VALUES(?,?,?,'RUNNING','RULE','disaster-rule-v1',?,NOW(),'user')
                """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, taskCode);
            statement.setString(2, taskName);
            statement.setString(3, hazardType);
            statement.setString(4, snapshot);
            return statement;
        }, key);
        long taskId = Objects.requireNonNull(key.getKey()).longValue();

        double longitude = number(input.get("longitude"), 106.55);
        double latitude = number(input.get("latitude"), 29.56);
        String regionCode = defaultText(input.get("regionCode"), findNearestRegion(longitude, latitude));
        Calculation calculation = "EARTHQUAKE".equals(hazardType)
            ? earthquakeCalculation(input)
            : debrisCalculation(input);

        List<Map<String, Object>> assetRows = jdbc.queryForList("""
            SELECT a.id,a.asset_name assetName,a.asset_type assetType,a.longitude,a.latitude,
                   a.service_status serviceStatus,a.baseline_condition_level baselineConditionLevel,
                   CASE WHEN a.asset_type='BRIDGE' THEN b.asset_id ELSE t.asset_id END detailId
            FROM transport_asset a
            LEFT JOIN bridge_detail b ON b.asset_id=a.id
            LEFT JOIN tunnel_detail t ON t.asset_id=a.id
            WHERE a.longitude IS NOT NULL AND a.latitude IS NOT NULL AND a.service_status<>'CLOSED'
            ORDER BY a.asset_type,a.asset_code
            """);

        int bridgeCount = 0;
        int tunnelCount = 0;
        for (Map<String, Object> asset : assetRows) {
            double distance = haversine(latitude, longitude, number(asset.get("latitude"), latitude), number(asset.get("longitude"), longitude));
            double attenuation = Math.exp(-distance / Math.max(calculation.radiusKm * .62, 1));
            double localIntensity = calculation.maxIntensity * attenuation;
            double vulnerability = "BRIDGE".equals(asset.get("assetType")) ? .92 : .74;
            String condition = text(asset.get("baselineConditionLevel"));
            if (condition != null && (condition.contains("4") || condition.contains("差"))) vulnerability += .18;
            if (condition != null && (condition.contains("5") || condition.contains("危险"))) vulnerability += .3;
            double damageProbability = clamp(calculation.baseProbability * attenuation * vulnerability, 0, 1);
            double damageIndex = "EARTHQUAKE".equals(hazardType)
                ? clamp(localIntensity / .42 * vulnerability, 0, 1.25)
                : clamp(localIntensity * vulnerability, 0, 1.25);
            String damageState = damageState(damageIndex);
            String passability = passability(damageState);
            if (asset.get("detailId") == null && distance <= calculation.radiusKm) {
                passability = "PENDING_DATA";
            }
            String hazardLevel = riskLevel(damageIndex * 100);
            String reason = reason(hazardType, damageState, distance, localIntensity, asset.get("detailId") == null);
            String action = action(passability, damageState);
            jdbc.update("""
                INSERT INTO disaster_asset_result(task_id,asset_id,distance_km,hazard_intensity,hazard_level,
                  vulnerability_score,damage_probability,damage_state,passability_status,
                  assessment_reason,recommended_action,result_details_json)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                """, taskId, asset.get("id"), round(distance, 3), round(localIntensity, 4), hazardLevel,
                round(vulnerability, 4), round(damageProbability, 4), damageState, passability,
                reason, action, json(Map.of("attenuation", round(attenuation, 4), "damageIndex", round(damageIndex, 4))));
            if (distance <= calculation.radiusKm && !"DS0".equals(damageState)) {
                if ("BRIDGE".equals(asset.get("assetType"))) bridgeCount++;
                else tunnelCount++;
            }
        }

        RoadSummary roadSummary = saveRoadResults(taskId, regionCode, calculation.riskScore);
        double impactArea = Math.PI * calculation.radiusKm * calculation.radiusKm;
        jdbc.update("""
            INSERT INTO disaster_task_result(task_id,hazard_type,occurrence_probability,risk_score,risk_level,
              source_longitude,source_latitude,influence_radius_km,impact_area_km2,max_intensity,
              affected_road_length_km,affected_bridge_count,affected_tunnel_count,summary_json)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, taskId, hazardType, round(calculation.baseProbability, 4), round(calculation.riskScore, 2),
            riskLevel(calculation.riskScore), longitude, latitude, round(calculation.radiusKm, 2),
            round(impactArea, 2), round(calculation.maxIntensity, 3), round(roadSummary.lengthKm, 2),
            bridgeCount, tunnelCount, json(calculation.extra));
        jdbc.update("UPDATE evaluation_task SET status='SUCCESS',completed_at=NOW() WHERE id=?", taskId);
        return result(taskId);
    }

    public Map<String, Object> result(long taskId) {
        Map<String, Object> task = jdbc.queryForMap("""
            SELECT t.id,t.task_code taskCode,t.task_name taskName,t.module_type moduleType,t.status,
                   t.algorithm_mode algorithmMode,t.algorithm_version algorithmVersion,
                   t.input_snapshot_json inputSnapshotJson,t.created_at createdAt,t.completed_at completedAt,
                   d.hazard_type hazardType,d.occurrence_probability occurrenceProbability,
                   d.risk_score riskScore,d.risk_level riskLevel,d.source_longitude sourceLongitude,
                   d.source_latitude sourceLatitude,d.influence_radius_km influenceRadiusKm,
                   d.impact_area_km2 impactAreaKm2,d.max_intensity maxIntensity,
                   d.affected_road_length_km affectedRoadLengthKm,d.affected_bridge_count affectedBridgeCount,
                   d.affected_tunnel_count affectedTunnelCount,d.summary_json summaryJson
            FROM evaluation_task t JOIN disaster_task_result d ON d.task_id=t.id WHERE t.id=?
            """, taskId);
        task.put("assets", jdbc.queryForList("""
            SELECT r.asset_id assetId,a.asset_code assetCode,a.asset_name assetName,a.asset_type assetType,
                   a.longitude,a.latitude,r.distance_km distanceKm,r.hazard_intensity hazardIntensity,
                   r.hazard_level hazardLevel,r.vulnerability_score vulnerabilityScore,
                   r.damage_probability damageProbability,r.damage_state damageState,
                   r.passability_status passabilityStatus,r.assessment_reason assessmentReason,
                   r.recommended_action recommendedAction
            FROM disaster_asset_result r JOIN transport_asset a ON a.id=r.asset_id
            WHERE r.task_id=? ORDER BY FIELD(r.damage_state,'DS4','DS3','DS2','DS1','DS0'),r.distance_km
            """, taskId));
        task.put("roads", jdbc.queryForList("""
            SELECT r.road_edge_id roadEdgeId,e.edge_code edgeCode,e.road_name roadName,e.road_ref roadRef,
                   r.distance_km distanceKm,r.impact_score impactScore,r.risk_level riskLevel,
                   r.passability_status passabilityStatus,r.assessment_reason assessmentReason
            FROM disaster_road_result r JOIN road_edge e ON e.id=r.road_edge_id
            WHERE r.task_id=? ORDER BY r.impact_score DESC,e.id
            """, taskId));
        task.put("damageDistribution", jdbc.queryForList("""
            SELECT damage_state name,COUNT(*) value FROM disaster_asset_result
            WHERE task_id=? GROUP BY damage_state ORDER BY FIELD(damage_state,'DS0','DS1','DS2','DS3','DS4')
            """, taskId));
        return task;
    }

    private Calculation earthquakeCalculation(Map<String, Object> input) {
        double pga = number(input.get("pgaG"), .20);
        double magnitude = number(input.get("magnitudeMw"), 6.5);
        double intensity = intensityNumber(defaultText(input.get("intensityDegree"), "VII"));
        double radius = number(input.get("influenceRadiusKm"), Math.max(20, magnitude * 9));
        double riskScore = clamp(pga * 210 + magnitude * 4 + intensity * 3.5, 0, 100);
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("intensityDegree", defaultText(input.get("intensityDegree"), "VII"));
        extra.put("pgaG", pga);
        extra.put("magnitudeMw", magnitude);
        extra.put("durationS", number(input.get("durationS"), 25));
        extra.put("siteCategory", defaultText(input.get("siteCategory"), "II"));
        return new Calculation(clamp(riskScore / 100, .05, .98), riskScore, radius, pga, extra);
    }

    private Calculation debrisCalculation(Map<String, Object> input) {
        double accumulated = number(input.get("accumulatedRainfallMm"), 240);
        double antecedent = number(input.get("antecedentRainfallMm"), 80);
        double slope = number(input.get("averageSlopeDegree"), 28);
        double catchment = number(input.get("catchmentAreaKm2"), 5.5);
        double material = grade(defaultText(input.get("looseMaterialLevel"), "中等"));
        double moisture = grade(defaultText(input.get("soilMoistureLevel"), "潮湿"));
        double probability = clamp(.06 + accumulated / 520 + antecedent / 700 + slope / 150 + material * .08 + moisture * .06, .05, .98);
        double radius = number(input.get("influenceRadiusKm"), clamp(Math.sqrt(catchment) * 4.2 + slope / 9, 5, 35));
        double maxFlowSpeed = 2.0 + slope / 10 + probability * 4;
        double maxFlowDepth = .5 + catchment / 12 + probability * 2;
        double impact = maxFlowSpeed * maxFlowDepth;
        double riskScore = probability * 72 + clamp(impact / 2, 0, 28);
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("maxFlowSpeedMs", round(maxFlowSpeed, 2));
        extra.put("maxFlowDepthM", round(maxFlowDepth, 2));
        extra.put("impactIntensity", round(impact, 2));
        extra.put("accumulatedRainfallMm", accumulated);
        extra.put("averageSlopeDegree", slope);
        return new Calculation(probability, clamp(riskScore, 0, 100), radius, probability, extra);
    }

    private RoadSummary saveRoadResults(long taskId, String regionCode, double riskScore) {
        List<Map<String, Object>> roads = jdbc.queryForList("""
            SELECT id,length_m lengthM FROM road_edge
            WHERE region_code=? AND road_class REGEXP '(^|;)(motorway|trunk)($|;)'
            ORDER BY id LIMIT 250
            """, regionCode);
        double length = 0;
        int index = 0;
        for (Map<String, Object> road : roads) {
            double factor = .58 + (index++ % 7) * .055;
            double score = clamp(riskScore * factor, 0, 100);
            String level = riskLevel(score);
            String status = score >= 78 ? "BLOCKED" : score >= 50 ? "CONDITIONAL" : "PASS";
            double roadLength = number(road.get("lengthM"), 0) / 1000;
            if (!"PASS".equals(status)) length += roadLength;
            jdbc.update("""
                INSERT INTO disaster_road_result(task_id,road_edge_id,distance_km,impact_score,
                  risk_level,passability_status,assessment_reason) VALUES(?,?,?,?,?,?,?)
                """, taskId, road.get("id"), round(index * .12, 3), round(score / 100, 4),
                level, status, "依据灾害综合风险与同区域道路暴露度形成规则化判定");
        }
        return new RoadSummary(length);
    }

    private String findNearestRegion(double longitude, double latitude) {
        return jdbc.queryForObject("""
            SELECT region_code FROM region ORDER BY
              POW(center_longitude-?,2)+POW(center_latitude-?,2) LIMIT 1
            """, String.class, longitude, latitude);
    }

    private String reason(String hazardType, String damageState, double distance, double intensity, boolean incomplete) {
        if (incomplete) return "设施缺少专有结构参数，当前结果仅供风险筛查";
        String source = "EARTHQUAKE".equals(hazardType) ? "局部地震动强度" : "泥石流影响强度";
        return String.format("%s %.3f，距灾害源 %.2fkm，规则判定为%s", source, intensity, distance, damageState);
    }

    private String action(String passability, String damageState) {
        return switch (passability) {
            case "BLOCKED" -> "建议立即封闭并安排专项检测，恢复前禁止通行";
            case "CONDITIONAL" -> "建议限速限载，通过前开展现场复核";
            case "PENDING_DATA" -> "补充结构参数和道路绑定后重新评估";
            default -> "保持监测，可按现行管理要求通行";
        };
    }

    private String damageState(double score) {
        if (score < .18) return "DS0";
        if (score < .38) return "DS1";
        if (score < .63) return "DS2";
        if (score < .88) return "DS3";
        return "DS4";
    }

    private String passability(String damageState) {
        return switch (damageState) {
            case "DS0", "DS1" -> "PASS";
            case "DS2" -> "CONDITIONAL";
            default -> "BLOCKED";
        };
    }

    private String riskLevel(double score) {
        if (score < 30) return "低风险";
        if (score < 55) return "中风险";
        if (score < 78) return "高风险";
        return "极高风险";
    }

    private double grade(String value) {
        if (value == null) return .5;
        if (value.contains("丰富") || value.contains("高") || value.contains("饱和")) return 1;
        if (value.contains("中") || value.contains("潮湿") || value.contains("一般")) return .65;
        return .3;
    }

    private double intensityNumber(String value) {
        return switch (value.toUpperCase()) {
            case "VI" -> 6; case "VII" -> 7; case "VIII" -> 8; case "IX" -> 9;
            default -> number(value, 7);
        };
    }

    private double haversine(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { return "{}"; }
    }

    private String text(Object value) { return value == null ? null : String.valueOf(value).trim(); }
    private String defaultText(Object value, String fallback) { String result = text(value); return result == null || result.isBlank() ? fallback : result; }
    private double number(Object value, double fallback) {
        if (value == null || String.valueOf(value).isBlank()) return fallback;
        try { return Double.parseDouble(String.valueOf(value)); } catch (NumberFormatException ignored) { return fallback; }
    }
    private double clamp(double value, double min, double max) { return Math.max(min, Math.min(max, value)); }
    private BigDecimal round(double value, int scale) { return BigDecimal.valueOf(value).setScale(scale, java.math.RoundingMode.HALF_UP); }

    private record Calculation(double baseProbability, double riskScore, double radiusKm, double maxIntensity, Map<String, Object> extra) {}
    private record RoadSummary(double lengthKm) {}
}
