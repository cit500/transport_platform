package com.plantplatform.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 新版首页聚合接口；所有数据均来自 transport_resilience_v2。 */
@RestController
@RequestMapping("/api/v2")
public class V2DashboardController {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public V2DashboardController(
            @Qualifier("v2JdbcTemplate") JdbcTemplate jdbc,
            ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/dashboard/bootstrap")
    public ResponseEntity<Map<String, Object>> bootstrap() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("overview", queryOverview());
        response.put("defaultVehicle", queryDefaultVehicle());
        response.put("passSummary", queryPassSummary());
        response.put("heavyResults", queryHeavyResults());
        response.put("regions", queryRegionMetrics());
        response.put("riskDistribution", queryRiskDistribution());
        response.put("hazardNotices", queryHazardNotices());
        response.put("assistantQuestions", queryAssistantQuestions());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/map/regions")
    public ResponseEntity<StreamingResponseBody> regionGeoJson() {
        String sql = """
            SELECT r.region_code, r.region_name, ST_AsGeoJSON(r.geom, 6) AS geometry_json,
                   a.risk_score, a.risk_level, a.resilience_score, a.resilience_level,
                   a.passability_score, a.passability_level, a.dominant_hazard,
                   a.connectivity, a.network_efficiency, a.accessibility,
                   a.redundancy, a.robustness, a.recovery_capacity, a.guarantee_rate
            FROM region r
            JOIN dashboard_publication p ON p.module_code = 'REGION_ASSESSMENT'
            LEFT JOIN region_assessment_result a
                   ON a.task_id = p.published_task_id AND a.region_code = r.region_code
            ORDER BY r.region_code
            """;
        return geoJsonStream(sql, rs -> {
            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("regionCode", rs.getString("region_code"));
            properties.put("regionName", rs.getString("region_name"));
            properties.put("riskScore", rs.getObject("risk_score"));
            properties.put("riskLevel", rs.getString("risk_level"));
            properties.put("resilienceScore", rs.getObject("resilience_score"));
            properties.put("resilienceLevel", rs.getString("resilience_level"));
            properties.put("passabilityScore", rs.getObject("passability_score"));
            properties.put("passabilityLevel", rs.getString("passability_level"));
            properties.put("dominantHazard", rs.getString("dominant_hazard"));
            properties.put("connectivity", rs.getObject("connectivity"));
            properties.put("networkEfficiency", rs.getObject("network_efficiency"));
            properties.put("accessibility", rs.getObject("accessibility"));
            properties.put("redundancy", rs.getObject("redundancy"));
            properties.put("robustness", rs.getObject("robustness"));
            properties.put("recoveryCapacity", rs.getObject("recovery_capacity"));
            properties.put("guaranteeRate", rs.getObject("guarantee_rate"));
            return geoJsonFeature(rs.getString("geometry_json"), properties);
        });
    }

    @GetMapping("/map/roads")
    public ResponseEntity<StreamingResponseBody> roadGeoJson() {
        String sql = """
            SELECT e.id, e.edge_code, e.road_name, e.road_ref, e.road_class,
                   e.one_way, e.lane_count, e.design_speed_kmh, e.length_m,
                   e.region_code, e.source_bridge_flag, e.source_tunnel_flag,
                   ST_AsGeoJSON(ST_Simplify(ST_SRID(e.geom, 0), 0.0001), 6) AS geometry_json
            FROM road_edge e
            WHERE e.road_class REGEXP '(^|;)(motorway|trunk)($|;)'
            ORDER BY e.id
            """;
        return geoJsonStream(sql, rs -> {
            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("id", rs.getLong("id"));
            properties.put("edgeCode", rs.getString("edge_code"));
            properties.put("roadName", rs.getString("road_name"));
            properties.put("roadRef", rs.getString("road_ref"));
            properties.put("roadClass", rs.getString("road_class"));
            properties.put("oneWay", rs.getBoolean("one_way"));
            properties.put("laneCount", rs.getObject("lane_count"));
            properties.put("designSpeedKmh", rs.getObject("design_speed_kmh"));
            properties.put("lengthM", rs.getBigDecimal("length_m"));
            properties.put("regionCode", rs.getString("region_code"));
            properties.put("sourceBridgeFlag", rs.getBoolean("source_bridge_flag"));
            properties.put("sourceTunnelFlag", rs.getBoolean("source_tunnel_flag"));
            return geoJsonFeature(rs.getString("geometry_json"), properties);
        });
    }

    @GetMapping("/map/assets")
    public ResponseEntity<Map<String, Object>> assetGeoJson() {
        String sql = """
            SELECT a.id, a.asset_code, a.asset_name, a.asset_type, a.region_code,
                   a.longitude, a.latitude, a.service_status,
                   COUNT(ar.road_edge_id) AS binding_count
            FROM transport_asset a
            LEFT JOIN asset_road_relation ar ON ar.asset_id = a.id
            GROUP BY a.id, a.asset_code, a.asset_name, a.asset_type, a.region_code,
                     a.longitude, a.latitude, a.service_status
            ORDER BY a.asset_type, a.asset_code
            """;
        List<Map<String, Object>> features = jdbc.query(sql, (rs, rowNum) -> {
            Map<String, Object> geometry = new LinkedHashMap<>();
            geometry.put("type", "Point");
            geometry.put("coordinates", List.of(rs.getDouble("longitude"), rs.getDouble("latitude")));

            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("id", rs.getLong("id"));
            properties.put("assetCode", rs.getString("asset_code"));
            properties.put("assetName", rs.getString("asset_name"));
            properties.put("assetType", rs.getString("asset_type"));
            properties.put("regionCode", rs.getString("region_code"));
            properties.put("serviceStatus", rs.getString("service_status"));
            properties.put("bindingCount", rs.getInt("binding_count"));
            return feature(geometry, properties);
        });
        return ResponseEntity.ok(featureCollection(features));
    }

    private Map<String, Object> queryOverview() {
        String sql = """
            SELECT
                (SELECT COUNT(*) FROM region) AS region_count,
                (SELECT COUNT(*) FROM road_edge) AS road_count,
                (SELECT ROUND(SUM(length_m) / 1000, 2) FROM road_edge) AS road_length_km,
                (SELECT COUNT(*) FROM transport_asset WHERE asset_type = 'BRIDGE') AS bridge_count,
                (SELECT COUNT(*) FROM transport_asset WHERE asset_type = 'TUNNEL') AS tunnel_count
            """;
        return jdbc.queryForObject(sql, (rs, rowNum) -> Map.of(
            "regionCount", rs.getLong("region_count"),
            "roadCount", rs.getLong("road_count"),
            "roadLengthKm", rs.getBigDecimal("road_length_km"),
            "bridgeCount", rs.getLong("bridge_count"),
            "tunnelCount", rs.getLong("tunnel_count")
        ));
    }

    private Map<String, Object> queryDefaultVehicle() {
        String sql = """
            SELECT id, profile_name, gross_weight_ton, vehicle_length_m, vehicle_width_m,
                   vehicle_height_m, axle_count, planned_speed_kmh
            FROM vehicle_profile
            WHERE is_default = TRUE
            ORDER BY id
            LIMIT 1
            """;
        return jdbc.queryForObject(sql, (rs, rowNum) -> Map.of(
            "id", rs.getLong("id"),
            "profileName", rs.getString("profile_name"),
            "grossWeightTon", rs.getBigDecimal("gross_weight_ton"),
            "vehicleLengthM", rs.getBigDecimal("vehicle_length_m"),
            "vehicleWidthM", rs.getBigDecimal("vehicle_width_m"),
            "vehicleHeightM", rs.getBigDecimal("vehicle_height_m"),
            "axleCount", rs.getInt("axle_count"),
            "plannedSpeedKmh", rs.getInt("planned_speed_kmh")
        ));
    }

    private List<Map<String, Object>> queryPassSummary() {
        return jdbc.queryForList("""
            SELECT a.asset_type AS assetType,
                   COUNT(*) AS totalCount,
                   SUM(r.passability_status = 'PASS') AS passCount,
                   SUM(r.passability_status = 'CONDITIONAL') AS conditionalCount,
                   SUM(r.passability_status = 'BLOCKED') AS blockedCount,
                   ROUND(100 * SUM(r.passability_status = 'PASS') / COUNT(*), 1) AS strictPassRate
            FROM dashboard_publication p
            JOIN heavy_passage_result r ON r.task_id = p.published_task_id
            JOIN transport_asset a ON a.id = r.asset_id
            WHERE p.module_code = 'HEAVY_PASSAGE'
            GROUP BY a.asset_type
            ORDER BY a.asset_type
            """);
    }

    private List<Map<String, Object>> queryHeavyResults() {
        return jdbc.queryForList("""
            SELECT a.asset_code AS assetCode, a.asset_name AS assetName, a.asset_type AS assetType,
                   r.passability_status AS passabilityStatus,
                   r.restriction_reason AS restrictionReason,
                   r.recommended_speed_kmh AS recommendedSpeedKmh,
                   r.recommended_action AS recommendedAction
            FROM dashboard_publication p
            JOIN heavy_passage_result r ON r.task_id = p.published_task_id
            JOIN transport_asset a ON a.id = r.asset_id
            WHERE p.module_code = 'HEAVY_PASSAGE'
            ORDER BY a.asset_type, a.asset_code
            """);
    }

    private List<Map<String, Object>> queryRegionMetrics() {
        return jdbc.queryForList("""
            SELECT r.region_code AS regionCode, r.region_name AS regionName,
                   a.dominant_hazard AS dominantHazard, a.risk_score AS riskScore,
                   a.risk_level AS riskLevel, a.resilience_score AS resilienceScore,
                   a.resilience_level AS resilienceLevel, a.passability_score AS passabilityScore,
                   a.passability_level AS passabilityLevel, a.connectivity,
                   a.network_efficiency AS networkEfficiency, a.accessibility,
                   a.redundancy, a.robustness, a.recovery_capacity AS recoveryCapacity,
                   a.guarantee_rate AS guaranteeRate
            FROM dashboard_publication p
            JOIN region_assessment_result a ON a.task_id = p.published_task_id
            JOIN region r ON r.region_code = a.region_code
            WHERE p.module_code = 'REGION_ASSESSMENT'
            ORDER BY a.risk_score DESC, r.region_code
            """);
    }

    private List<Map<String, Object>> queryRiskDistribution() {
        return jdbc.queryForList("""
            SELECT a.risk_level AS name, COUNT(*) AS value
            FROM dashboard_publication p
            JOIN region_assessment_result a ON a.task_id = p.published_task_id
            WHERE p.module_code = 'REGION_ASSESSMENT'
            GROUP BY a.risk_level
            ORDER BY FIELD(a.risk_level, '低风险', '中风险', '高风险', '极高风险')
            """);
    }

    private List<Map<String, Object>> queryHazardNotices() {
        return jdbc.queryForList("""
            SELECT n.id, DATE_FORMAT(n.event_time, '%m-%d %H:%i') AS eventTime,
                   r.region_name AS regionName, n.hazard_type AS hazardType,
                   n.warning_level AS warningLevel, n.content
            FROM hazard_notice n
            JOIN region r ON r.region_code = n.region_code
            ORDER BY n.event_time DESC, n.id DESC
            LIMIT 20
            """);
    }

    private List<Map<String, Object>> queryAssistantQuestions() {
        return jdbc.queryForList("""
            SELECT question_code AS questionCode, question_text AS questionText,
                   answer_text AS answerText
            FROM assistant_qa
            ORDER BY display_order
            """);
    }

    private String writeJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("属性数据无法转换为 JSON", e);
        }
    }

    private String geoJsonFeature(String geometryJson, Map<String, Object> properties) {
        return "{\"type\":\"Feature\",\"geometry\":" + geometryJson
            + ",\"properties\":" + writeJson(properties) + "}";
    }

    private ResponseEntity<StreamingResponseBody> geoJsonStream(
            String sql,
            GeoJsonRowMapper rowMapper) {
        StreamingResponseBody body = outputStream -> {
            BufferedWriter writer = new BufferedWriter(
                new OutputStreamWriter(outputStream, StandardCharsets.UTF_8), 64 * 1024);
            writer.write("{\"type\":\"FeatureCollection\",\"features\":[");
            boolean[] first = {true};
            int[] count = {0};
            try {
                jdbc.query(sql, preparedStatement -> preparedStatement.setFetchSize(500), rs -> {
                    try {
                        if (!first[0]) writer.write(',');
                        first[0] = false;
                        writer.write(rowMapper.map(rs));
                        if (++count[0] % 250 == 0) writer.flush();
                    } catch (IOException exception) {
                        throw new UncheckedIOException(exception);
                    }
                });
            } catch (UncheckedIOException exception) {
                throw exception.getCause();
            }
            writer.write("]}");
            writer.flush();
        };
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .body(body);
    }

    @FunctionalInterface
    private interface GeoJsonRowMapper {
        String map(java.sql.ResultSet resultSet) throws java.sql.SQLException;
    }

    private Map<String, Object> feature(Map<String, Object> geometry, Map<String, Object> properties) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", "Feature");
        result.put("geometry", geometry);
        result.put("properties", properties);
        return result;
    }

    private Map<String, Object> featureCollection(List<Map<String, Object>> features) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", "FeatureCollection");
        result.put("features", new ArrayList<>(features));
        return result;
    }
}
