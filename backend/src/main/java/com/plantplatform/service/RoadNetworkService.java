package com.plantplatform.service;

import com.plantplatform.dto.RoadEdgeDTO;
import com.plantplatform.dto.RoadEdgeDetailDTO;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.MultiLineString;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 路网查询服务
 * 负责 road_edges 的查询、筛选、GeoJSON 导出
 */
@Service
public class RoadNetworkService {

    private static final Logger log = LoggerFactory.getLogger(RoadNetworkService.class);

    private static final com.fasterxml.jackson.databind.ObjectMapper objectMapper = new com.fasterxml.jackson.databind.ObjectMapper();

    @Autowired
    private JdbcTemplate jdbc;

    // ============================================================
    // RowMapper
    // ============================================================

    private final RowMapper<RoadEdgeDTO> edgeRowMapper = (rs, rowNum) -> {
        RoadEdgeDTO dto = new RoadEdgeDTO();
        dto.setId(rs.getLong("id"));
        dto.setSourceUOsmid(rs.getLong("source_u_osmid"));
        dto.setSourceVOsmid(rs.getLong("source_v_osmid"));
        dto.setEdgeKey(rs.getInt("edge_key"));
        dto.setOsmid(rs.getString("osmid"));
        dto.setName(rs.getString("name"));
        dto.setRef(rs.getString("ref"));
        dto.setHighway(rs.getString("highway"));
        dto.setOneWay(Boolean.valueOf(rs.getBoolean("oneway")));
        dto.setLanes(rs.getString("lanes"));
        dto.setMaxspeed(rs.getString("maxspeed"));
        dto.setLengthM(rs.getDouble("length_m"));
        dto.setBridgeRaw(rs.getString("bridge_raw"));
        dto.setIsBridge(rs.getBoolean("is_bridge"));
        dto.setTunnelRaw(rs.getString("tunnel_raw"));
        dto.setIsTunnel(rs.getBoolean("is_tunnel"));
        dto.setSourceDistrictName(rs.getString("source_district_name"));

        Long divId = rs.getObject("division_id") != null ? rs.getLong("division_id") : null;
        dto.setDivisionId(divId);
        dto.setDivisionKey(rs.getString("division_key"));
        dto.setDivisionName(rs.getString("display_name"));

        return dto;
    };

    // ============================================================
    // 分页查询
    // ============================================================

    public Page<RoadEdgeDTO> searchEdges(String keyword, Long divisionId,
                                          String highway, Boolean isBridge, Boolean isTunnel,
                                          Pageable pageable) {
        List<Object> params = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE 1=1");

        if (keyword != null && !keyword.isEmpty()) {
            where.append(" AND (e.name LIKE ? OR e.ref LIKE ? OR CAST(e.source_u_osmid AS CHAR) LIKE ?)");
            String like = "%" + keyword + "%";
            params.add(like); params.add(like); params.add(like);
        }
        if (divisionId != null) {
            where.append(" AND e.division_id = ?");
            params.add(divisionId);
        }
        if (highway != null && !highway.isEmpty()) {
            where.append(" AND e.highway LIKE ?");
            params.add("%" + highway + "%");
        }
        if (isBridge != null && isBridge) {
            where.append(" AND e.is_bridge = 1");
        }
        if (isTunnel != null && isTunnel) {
            where.append(" AND e.is_tunnel = 1");
        }

        String baseSql = "FROM road_edges e " +
            "LEFT JOIN administrative_divisions d ON e.division_id = d.id " +
            where;

        // Count
        Long total = jdbc.queryForObject("SELECT COUNT(*) " + baseSql, Long.class, params.toArray());

        // Data
        String dataSql = "SELECT e.*, d.display_name, d.division_key " + baseSql +
            " ORDER BY e.id LIMIT ? OFFSET ?";
        params.add(pageable.getPageSize());
        params.add(pageable.getOffset());

        List<RoadEdgeDTO> content = jdbc.query(dataSql, edgeRowMapper, params.toArray());

        return new PageImpl<>(content, pageable, total != null ? total : 0);
    }

    // ============================================================
    // 详情查询
    // ============================================================

    public RoadEdgeDetailDTO getEdgeDetail(Long id) {
        String sql = "SELECT e.id, e.source_u_osmid, e.source_v_osmid, e.edge_key, " +
            "e.osmid, e.name, e.ref, e.highway, e.oneway, e.lanes, e.maxspeed, " +
            "e.length_m, e.bridge_raw, e.is_bridge, e.tunnel_raw, e.is_tunnel, " +
            "e.division_id, e.source_district_name, " +
            "d.display_name, d.division_key, " +
            "ST_AsGeoJSON(e.geom) as geojson_geom " +
            "FROM road_edges e " +
            "LEFT JOIN administrative_divisions d ON e.division_id = d.id " +
            "WHERE e.id = ?";

        List<RoadEdgeDetailDTO> results = jdbc.query(sql, (rs, rowNum) -> {
            RoadEdgeDetailDTO dto = new RoadEdgeDetailDTO();
            dto.setId(rs.getLong("id"));
            dto.setSourceUOsmid(rs.getLong("source_u_osmid"));
            dto.setSourceVOsmid(rs.getLong("source_v_osmid"));
            dto.setEdgeKey(rs.getInt("edge_key"));
            dto.setOsmid(rs.getString("osmid"));
            dto.setName(rs.getString("name"));
            dto.setRef(rs.getString("ref"));
            dto.setHighway(rs.getString("highway"));
            dto.setOneWay(Boolean.valueOf(rs.getBoolean("oneway")));
            dto.setLanes(rs.getString("lanes"));
            dto.setMaxspeed(rs.getString("maxspeed"));
            dto.setLengthM(rs.getDouble("length_m"));
            dto.setBridgeRaw(rs.getString("bridge_raw"));
            dto.setIsBridge(rs.getBoolean("is_bridge"));
            dto.setTunnelRaw(rs.getString("tunnel_raw"));
            dto.setIsTunnel(rs.getBoolean("is_tunnel"));
            dto.setSourceDistrictName(rs.getString("source_district_name"));

            Long divId = rs.getObject("division_id") != null ? rs.getLong("division_id") : null;
            dto.setDivisionId(divId);
            dto.setDivisionKey(rs.getString("division_key"));
            dto.setDivisionName(rs.getString("display_name"));

            // GeoJSON from MySQL ST_AsGeoJSON
            String geojsonStr = rs.getString("geojson_geom");
            if (geojsonStr != null) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> geom = objectMapper.readValue(geojsonStr, Map.class);
                    dto.setGeometry(geom);
                } catch (Exception e) {
                    log.warn("GeoJSON parse failed: {}", e.getMessage());
                }
            }

            return dto;
        }, id);

        return results.isEmpty() ? null : results.get(0);
    }

    // ============================================================
    // GeoJSON 导出 (FeatureCollection)
    // ============================================================

    public Map<String, Object> getGeoJsonFeatures() {
        List<Map<String, Object>> features = new ArrayList<>();

        // 一次性查询所有 Edge，使用 ST_AsGeoJSON 在 MySQL 层转换，避免 N+1
        String sql = "SELECT e.id, e.name, e.ref, e.highway, e.division_id, " +
            "e.is_bridge, e.is_tunnel, ST_AsGeoJSON(e.geom) as geojson_geom " +
            "FROM road_edges e";

        jdbc.query(sql, (rs) -> {
            Map<String, Object> feature = new HashMap<>();
            feature.put("type", "Feature");

            // Properties
            Map<String, Object> props = new LinkedHashMap<>();
            props.put("edgeId", rs.getLong("id"));
            props.put("name", rs.getString("name"));
            props.put("ref", rs.getString("ref"));
            props.put("highway", rs.getString("highway"));
            props.put("divisionId", rs.getObject("division_id") != null ? rs.getLong("division_id") : null);
            props.put("isBridge", rs.getBoolean("is_bridge"));
            props.put("isTunnel", rs.getBoolean("is_tunnel"));
            feature.put("properties", props);

            // Geometry from ST_AsGeoJSON
            String geojsonStr = rs.getString("geojson_geom");
            if (geojsonStr != null) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> geom = objectMapper.readValue(geojsonStr, Map.class);
                    feature.put("geometry", geom);
                } catch (Exception e) {
                    log.warn("GeoJSON parse failed for edge {}: {}", rs.getLong("id"), e.getMessage());
                }
            }

            features.add(feature);
        });

        Map<String, Object> collection = new LinkedHashMap<>();
        collection.put("type", "FeatureCollection");
        collection.put("features", features);
        return collection;
    }

    // ============================================================
    // Geometry 转换
    // ============================================================

    /**
     * 从 MySQL GEOMETRY 提取 GeoJSON coordinates
     * MySQL SRID 4326: ST_X=latitude, ST_Y=longitude
     * GeoJSON: [longitude, latitude]
     */
    @SuppressWarnings("unchecked")
    private List<List<double[]>> extractGeoJsonCoordinates(Object geom) {
        if (geom == null) return null;

        // 通过 WKT 转换
        try {
            org.locationtech.jts.geom.Geometry jtsGeom = (org.locationtech.jts.geom.Geometry) geom;
            if (jtsGeom instanceof LineString) {
                LineString ls = (LineString) jtsGeom;
                List<double[]> coords = new ArrayList<>();
                for (int i = 0; i < ls.getNumPoints(); i++) {
                    // JTS: x=latitude (MySQL), y=longitude (MySQL)
                    // GeoJSON: [longitude, latitude] → [y, x]
                    coords.add(new double[]{ls.getCoordinateN(i).y, ls.getCoordinateN(i).x});
                }
                return Collections.singletonList(coords);
            } else if (jtsGeom instanceof MultiLineString) {
                MultiLineString mls = (MultiLineString) jtsGeom;
                List<List<double[]>> result = new ArrayList<>();
                for (int i = 0; i < mls.getNumGeometries(); i++) {
                    LineString ls = (LineString) mls.getGeometryN(i);
                    List<double[]> coords = new ArrayList<>();
                    for (int j = 0; j < ls.getNumPoints(); j++) {
                        coords.add(new double[]{ls.getCoordinateN(j).y, ls.getCoordinateN(j).x});
                    }
                    result.add(coords);
                }
                return result;
            }
        } catch (Exception e) {
            log.warn("Geometry 转换失败: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 从 MySQL GEOMETRY 提取完整 GeoJSON Geometry 对象
     */
    private Map<String, Object> extractGeoJsonGeometry(Object geom) {
        Map<String, Object> geoJson = new LinkedHashMap<>();
        geoJson.put("type", "LineString");

        List<List<double[]>> coords = extractGeoJsonCoordinates(geom);
        if (coords != null && !coords.isEmpty()) {
            if (coords.size() == 1) {
                geoJson.put("type", "LineString");
                geoJson.put("coordinates", coords.get(0));
            } else {
                geoJson.put("type", "MultiLineString");
                geoJson.put("coordinates", coords);
            }
        }

        return geoJson;
    }

    // ============================================================
    // 统计查询
    // ============================================================

    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("nodeCount", jdbc.queryForObject("SELECT COUNT(*) FROM road_nodes", Long.class));
        stats.put("edgeCount", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges", Long.class));
        stats.put("assignedEdgeCount", jdbc.queryForObject(
            "SELECT COUNT(*) FROM road_edges WHERE division_id IS NOT NULL", Long.class));
        stats.put("unassignedEdgeCount", jdbc.queryForObject(
            "SELECT COUNT(*) FROM road_edges WHERE division_id IS NULL", Long.class));
        stats.put("edgeLengthKm", jdbc.queryForObject(
            "SELECT COALESCE(SUM(length_m), 0) / 1000.0 FROM road_edges", Double.class));
        return stats;
    }
}
