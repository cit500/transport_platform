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

/** 首页和基础地图接口，只读取九表最小数据库。 */
@RestController
@RequestMapping("/api")
public class DashboardController {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public DashboardController(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/dashboard/bootstrap")
    public Map<String, Object> bootstrap() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("overview", overview());
        response.put("defaultVehicle", Map.of(
            "profileName", "默认100吨重型运输车", "grossWeightTon", 100,
            "vehicleLengthM", 18, "vehicleWidthM", 3.2, "vehicleHeightM", 4.5,
            "axleCount", 6, "plannedSpeedKmh", 30));
        response.put("passSummary", List.of());
        response.put("heavyResults", List.of());
        response.put("regions", regions());
        response.put("riskDistribution", List.of(Map.of("name", "暂无数据", "value", regionCount())));
        response.put("hazardNotices", List.of());
        response.put("assistantQuestions", List.of(
            Map.of("questionCode", "platform", "answerText", "平台当前集中维护行政区、路网和桥隧基础数据，分析模块处于方法设计阶段。"),
            Map.of("questionCode", "map", "answerText", "地图统一使用基础行政区、道路和桥隧图层；分析颜色将在方法确定后由任务结果驱动。"),
            Map.of("questionCode", "heavy", "answerText", "重车页面目前用于参数和桥隧规则演示，正式路径方法将在后续确定。")
        ));
        return response;
    }

    @GetMapping("/map/regions")
    public ResponseEntity<StreamingResponseBody> regionGeoJson() {
        String sql = """
            SELECT region_code,region_name,ST_AsGeoJSON(geom,6) geometry_json
            FROM region ORDER BY region_code
            """;
        return geoJsonStream(sql, rs -> {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("regionCode", rs.getString("region_code"));
            p.put("regionName", rs.getString("region_name"));
            p.put("riskLevel", "暂无数据");
            p.put("resilienceLevel", "暂无数据");
            p.put("passabilityLevel", "暂无数据");
            return geoJsonFeature(rs.getString("geometry_json"), p);
        });
    }

    @GetMapping("/map/roads")
    public ResponseEntity<StreamingResponseBody> roadGeoJson() {
        String sql = """
            SELECT id,road_name,road_ref,road_class,one_way,lane_count,design_speed_kmh,
                   length_m,region_code,source_bridge_flag,source_tunnel_flag,
                   ST_AsGeoJSON(ST_Simplify(ST_SRID(geom,0),0.0001),6) geometry_json
            FROM road_edge
            WHERE road_class REGEXP '(^|;)(motorway|trunk)($|;)'
            ORDER BY id
            """;
        return geoJsonStream(sql, rs -> {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("id", rs.getLong("id"));
            p.put("roadName", rs.getString("road_name"));
            p.put("roadRef", rs.getString("road_ref"));
            p.put("roadClass", rs.getString("road_class"));
            p.put("oneWay", rs.getBoolean("one_way"));
            p.put("laneCount", rs.getObject("lane_count"));
            p.put("designSpeedKmh", rs.getObject("design_speed_kmh"));
            p.put("lengthM", rs.getBigDecimal("length_m"));
            p.put("regionCode", rs.getString("region_code"));
            p.put("sourceBridgeFlag", rs.getBoolean("source_bridge_flag"));
            p.put("sourceTunnelFlag", rs.getBoolean("source_tunnel_flag"));
            return geoJsonFeature(rs.getString("geometry_json"), p);
        });
    }

    @GetMapping("/map/assets")
    public Map<String, Object> assetGeoJson() {
        List<Map<String, Object>> features = jdbc.query("""
            SELECT a.id,a.asset_code,a.asset_name,a.asset_type,a.region_code,a.longitude,a.latitude,
                   a.service_status,COUNT(ar.road_edge_id) binding_count
            FROM transport_asset a LEFT JOIN asset_road_relation ar ON ar.asset_id=a.id
            WHERE a.longitude IS NOT NULL AND a.latitude IS NOT NULL
            GROUP BY a.id,a.asset_code,a.asset_name,a.asset_type,a.region_code,a.longitude,a.latitude,a.service_status
            ORDER BY a.asset_type,a.asset_code
            """, (rs, rowNum) -> {
            Map<String, Object> geometry = Map.of("type", "Point", "coordinates", List.of(rs.getDouble("longitude"), rs.getDouble("latitude")));
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
        return featureCollection(features);
    }

    private Map<String, Object> overview() {
        return jdbc.queryForObject("""
            SELECT (SELECT COUNT(*) FROM region) region_count,
                   (SELECT COUNT(*) FROM road_edge) road_count,
                   (SELECT ROUND(SUM(length_m)/1000,2) FROM road_edge) road_length_km,
                   (SELECT COUNT(*) FROM transport_asset WHERE asset_type='BRIDGE') bridge_count,
                   (SELECT COUNT(*) FROM transport_asset WHERE asset_type='TUNNEL') tunnel_count
            """, (rs, rowNum) -> Map.of(
            "regionCount", rs.getLong("region_count"), "roadCount", rs.getLong("road_count"),
            "roadLengthKm", rs.getBigDecimal("road_length_km"), "bridgeCount", rs.getLong("bridge_count"),
            "tunnelCount", rs.getLong("tunnel_count")));
    }

    private long regionCount() { return jdbc.queryForObject("SELECT COUNT(*) FROM region", Long.class); }

    private List<Map<String, Object>> regions() {
        return jdbc.query("SELECT region_code,region_name FROM region ORDER BY region_code", (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("regionCode", rs.getString("region_code"));
            row.put("regionName", rs.getString("region_name"));
            row.put("riskLevel", "暂无数据");
            row.put("resilienceLevel", "暂无数据");
            row.put("passabilityLevel", "暂无数据");
            return row;
        });
    }

    private String writeJson(Map<String, Object> value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new IllegalStateException("属性数据无法转换为JSON", e); }
    }

    private String geoJsonFeature(String geometryJson, Map<String, Object> properties) {
        return "{\"type\":\"Feature\",\"geometry\":" + geometryJson + ",\"properties\":" + writeJson(properties) + "}";
    }

    private ResponseEntity<StreamingResponseBody> geoJsonStream(String sql, GeoJsonRowMapper mapper) {
        StreamingResponseBody body = outputStream -> {
            BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(outputStream, StandardCharsets.UTF_8), 64 * 1024);
            writer.write("{\"type\":\"FeatureCollection\",\"features\":[");
            boolean[] first = {true};
            try {
                jdbc.query(sql, ps -> ps.setFetchSize(500), rs -> {
                    try {
                        if (!first[0]) writer.write(',');
                        first[0] = false;
                        writer.write(mapper.map(rs));
                    } catch (IOException e) { throw new UncheckedIOException(e); }
                });
            } catch (UncheckedIOException e) { throw e.getCause(); }
            writer.write("]}");
            writer.flush();
        };
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private Map<String, Object> feature(Map<String, Object> geometry, Map<String, Object> properties) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", "Feature"); result.put("geometry", geometry); result.put("properties", properties);
        return result;
    }

    private Map<String, Object> featureCollection(List<Map<String, Object>> features) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", "FeatureCollection"); result.put("features", new ArrayList<>(features));
        return result;
    }

    @FunctionalInterface
    private interface GeoJsonRowMapper { String map(java.sql.ResultSet rs) throws java.sql.SQLException; }
}
