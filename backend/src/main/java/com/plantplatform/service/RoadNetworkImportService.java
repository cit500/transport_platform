package com.plantplatform.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;

import java.io.*;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * V1.3B 路网导入服务（JdbcTemplate 批量模式）
 *
 * 从 GeoJSON 文件读取 nodes + edges，用原生 SQL 写入 MySQL。
 * 幂等：重复执行不会产生重复数据。
 */
@Service
public class RoadNetworkImportService {

    private static final Logger log = LoggerFactory.getLogger(RoadNetworkImportService.class);

    @Autowired
    private JdbcTemplate jdbc;

    /**
     * 全量导入结果
     */
    public static class ImportResult {
        public int nodesInserted;
        public int nodesSkipped;
        public int edgesInserted;
        public int edgesSkipped;
        public int edgesError;
        public int divisionResolved;
        public int divisionNull;
        public int bridgeYesCount;
        public int tunnelYesCount;
        public List<Map<String, Object>> unresolvedNullDistricts = new ArrayList<>();
        public List<String> errors = new ArrayList<>();
        public long elapsedMs;

        public Map<String, Object> toMap() {
            Map<String, Object> m = new HashMap<>();
            m.put("nodesInserted", nodesInserted);
            m.put("nodesSkipped", nodesSkipped);
            m.put("edgesInserted", edgesInserted);
            m.put("edgesSkipped", edgesSkipped);
            m.put("edgesError", edgesError);
            m.put("divisionResolved", divisionResolved);
            m.put("divisionNull", divisionNull);
            m.put("bridgeYesCount", bridgeYesCount);
            m.put("tunnelYesCount", tunnelYesCount);
            m.put("unresolvedNullDistricts", unresolvedNullDistricts);
            m.put("errors", errors);
            m.put("elapsedMs", elapsedMs);
            return m;
        }
    }

    /**
     * 执行全量导入
     * @param nodesPath nodes.geojson 路径
     * @param edgesPath edges.geojson 路径
     */
    public ImportResult importAll(String nodesPath, String edgesPath) throws Exception {
        long start = System.currentTimeMillis();
        ImportResult result = new ImportResult();

        // 1. 加载行政区映射
        log.info("[IMPORT] 加载行政区映射...");
        Map<String, Long> divisionMap = buildDivisionMap();
        Map<String, Long> aliasMap = buildAliasMap();
        log.info("  行政区: {} 条, alias: {} 个", divisionMap.size(), aliasMap.size());

        // 2. 导入 Nodes
        log.info("[IMPORT] 导入 Nodes from {}...", nodesPath);
        Map<Long, Long> osmidToNodeId = importNodesJdbc(nodesPath, result);
        log.info("  Node 完成: inserted={}, skipped={}, total={}", result.nodesInserted, result.nodesSkipped, osmidToNodeId.size());

        // 3. 导入 Edges
        log.info("[IMPORT] 导入 Edges from {}...", edgesPath);
        importEdgesJdbc(edgesPath, osmidToNodeId, divisionMap, aliasMap, result);
        log.info("  Edge 完成: inserted={}, skipped={}, error={}", result.edgesInserted, result.edgesSkipped, result.edgesError);

        result.elapsedMs = System.currentTimeMillis() - start;
        return result;
    }

    private Map<Long, Long> importNodesJdbc(String geojsonPath, ImportResult result) throws Exception {
        Map<Long, Long> osmidToNodeId = new HashMap<>();

        // 加载已有 Node
        List<Map<String, Object>> existingRows = jdbc.queryForList("SELECT id, osmid FROM road_nodes");
        for (Map<String, Object> row : existingRows) {
            osmidToNodeId.put(((Number) row.get("osmid")).longValue(), ((Number) row.get("id")).longValue());
        }
        result.nodesSkipped = existingRows.size();
        log.info("  已有 Node: {}", existingRows.size());

        // 读取 GeoJSON
        String json = Files.readString(Paths.get(geojsonPath));
        Map<String, Object> root = parseJson(json);
        List<Map<String, Object>> features = (List<Map<String, Object>>) root.get("features");

        // 收集需要插入的 Node
        List<Object[]> batchArgs = new ArrayList<>();
        List<Long> batchOsmids = new ArrayList<>();

        for (Map<String, Object> feature : features) {
            Map<String, Object> props = (Map<String, Object>) feature.get("properties");
            long osmid = toLong(props.get("osmid"));
            int streetCount = toInt(props.get("street_count"));

            if (osmidToNodeId.containsKey(osmid)) continue;

            Map<String, Object> geom = (Map<String, Object>) feature.get("geometry");
            List<?> coordsList = (List<?>) geom.get("coordinates");
            double x = toDouble(coordsList.get(0));
            double y = toDouble(coordsList.get(1));
            // MySQL ST_GeomFromText(SRID 4326) 期望 POINT(lat lon)，GeoJSON 是 (lon lat)
            String wkt = String.format("POINT(%s %s)", y, x);

            batchArgs.add(new Object[]{osmid, streetCount, wkt});
            batchOsmids.add(osmid);
        }

        if (!batchArgs.isEmpty()) {
            jdbc.batchUpdate(
                "INSERT INTO road_nodes (osmid, street_count, geom, source_type, created_at, updated_at) VALUES (?, ?, ST_GeomFromText(?, 4326), 'GEOJSON', NOW(), NOW())",
                batchArgs
            );
            // 读回新插入的 ID
            String inClause = batchOsmids.stream().map(String::valueOf).collect(Collectors.joining(","));
            List<Map<String, Object>> newRows = jdbc.queryForList("SELECT id, osmid FROM road_nodes WHERE osmid IN (" + inClause + ")");
            for (Map<String, Object> row : newRows) {
                osmidToNodeId.put(((Number) row.get("osmid")).longValue(), ((Number) row.get("id")).longValue());
            }
            result.nodesInserted = batchArgs.size();
        }

        return osmidToNodeId;
    }

    private void importEdgesJdbc(String geojsonPath, Map<Long, Long> osmidToNodeId,
                                  Map<String, Long> divisionMap, Map<String, Long> aliasMap,
                                  ImportResult result) throws Exception {
        String json = Files.readString(Paths.get(geojsonPath));
        Map<String, Object> root = parseJson(json);
        List<Map<String, Object>> features = (List<Map<String, Object>>) root.get("features");

        int inserted = 0, skipped = 0, error = 0, divResolved = 0, divNull = 0;
        int bridgeYes = 0, tunnelYes = 0;

        String insertSql = "INSERT INTO road_edges (" +
            "u_node_id, v_node_id, source_u_osmid, source_v_osmid, edge_key, " +
            "osmid, name, ref, highway, oneway, lanes, maxspeed, length_m, " +
            "bridge_raw, is_bridge, tunnel_raw, is_tunnel, " +
            "division_id, source_district_name, geom, source_type, created_at, updated_at" +
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326), 'GEOJSON', NOW(), NOW())";

        for (Map<String, Object> feature : features) {
            Map<String, Object> props = (Map<String, Object>) feature.get("properties");
            Map<String, Object> geom = (Map<String, Object>) feature.get("geometry");

            long sourceUOsmid = toLong(props.get("u"));
            long sourceVOsmid = toLong(props.get("v"));
            int edgeKey = toInt(props.get("key"));

            // 幂等检查
            Integer existingCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM road_edges WHERE source_u_osmid=? AND source_v_osmid=? AND edge_key=?",
                Integer.class, sourceUOsmid, sourceVOsmid, edgeKey
            );
            if (existingCount != null && existingCount > 0) {
                skipped++;
                continue;
            }

            // Node FK
            Long uNodeId = osmidToNodeId.get(sourceUOsmid);
            Long vNodeId = osmidToNodeId.get(sourceVOsmid);
            if (uNodeId == null || vNodeId == null) {
                String msg = String.format("Node 不存在: u=%d(id=%s), v=%d(id=%s)", sourceUOsmid, uNodeId, sourceVOsmid, vNodeId);
                log.error("  [ERROR] {}", msg);
                result.errors.add(msg);
                error++;
                continue;
            }

            // division_id
            String districtName = (String) props.get("district_name");
            Long divisionId = null;
            if (districtName != null && !districtName.isEmpty()) {
                divisionId = resolveDivisionId(districtName, divisionMap, aliasMap);
                if (divisionId != null) divResolved++;
                else { log.warn("  [WARN] 无法解析 district: \"{}\"", districtName); divNull++; }
            } else {
                divNull++;
            }

            // bridge/tunnel
            String bridgeRaw = getString(props, "bridge");
            String tunnelRaw = getString(props, "tunnel");
            boolean bridgeFlag = isBridge(bridgeRaw);
            boolean tunnelFlag = isTunnel(tunnelRaw);
            if (bridgeFlag) bridgeYes++;
            if (tunnelFlag) tunnelYes++;

            // MySQL ST_GeomFromText(SRID 4326) 期望 (lat lon)，GeoJSON 是 (lon lat)
            List<?> edgeCoordsList = (List<?>) geom.get("coordinates");
            StringBuilder wkt = new StringBuilder("LINESTRING(");
            for (int i = 0; i < edgeCoordsList.size(); i++) {
                List<?> c = (List<?>) edgeCoordsList.get(i);
                if (i > 0) wkt.append(", ");
                // 交换：MySQL 期望 lat lon
                wkt.append(toDouble(c.get(1))).append(" ").append(toDouble(c.get(0)));
            }
            wkt.append(")");

            try {
                jdbc.update(insertSql,
                    uNodeId, vNodeId,
                    sourceUOsmid, sourceVOsmid, edgeKey,
                    getString(props, "osmid"),
                    getString(props, "name"),
                    getString(props, "ref"),
                    props.get("highway"),
                    Boolean.TRUE.equals(props.get("oneway")) ? 1 : 0,
                    getString(props, "lanes"),
                    getString(props, "maxspeed"),
                    toDouble(props.get("length")),
                    bridgeRaw, bridgeFlag ? 1 : 0,
                    tunnelRaw, tunnelFlag ? 1 : 0,
                    divisionId, districtName, wkt.toString()
                );
                inserted++;
            } catch (Exception e) {
                String msg = String.format("Edge 插入失败 u=%d v=%d: %s", sourceUOsmid, sourceVOsmid, e.getMessage());
                log.error("  [ERROR] {}", msg);
                result.errors.add(msg);
                error++;
            }
        }

        result.edgesInserted = inserted;
        result.edgesSkipped = skipped;
        result.edgesError = error;
        result.divisionResolved = divResolved;
        result.divisionNull = divNull;
        result.bridgeYesCount = bridgeYes;
        result.tunnelYesCount = tunnelYes;
    }

    // ============================================================
    // 辅助方法
    // ============================================================

    private Map<String, Long> buildDivisionMap() {
        Map<String, Long> map = new HashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, canonical_name, display_name FROM administrative_divisions WHERE is_active = 1"
        );
        for (Map<String, Object> row : rows) {
            Long id = ((Number) row.get("id")).longValue();
            map.put((String) row.get("canonical_name"), id);
            String dn = (String) row.get("display_name");
            if (dn != null) map.put(dn, id);
        }
        return map;
    }

    private Map<String, Long> buildAliasMap() {
        Map<String, Long> map = new HashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT alias_name, division_id FROM administrative_division_aliases");
        for (Map<String, Object> row : rows) {
            map.put((String) row.get("alias_name"), ((Number) row.get("division_id")).longValue());
        }
        return map;
    }

    private Long resolveDivisionId(String name, Map<String, Long> divMap, Map<String, Long> aliasMap) {
        if (name == null) return null;
        if (divMap.containsKey(name)) return divMap.get(name);
        if (aliasMap.containsKey(name)) return aliasMap.get(name);
        // 清理后缀尝试
        String cleaned = name
            .replace("土家族苗族自治县", "")
            .replace("苗族土家族自治县", "")
            .replace("土家族自治县", "");
        if (divMap.containsKey(cleaned)) return divMap.get(cleaned);
        if (aliasMap.containsKey(cleaned)) return aliasMap.get(cleaned);
        return null;
    }

    private Boolean isBridge(String raw) {
        if (raw == null || raw.isEmpty()) return Boolean.FALSE;
        String v = raw.toLowerCase().trim();
        return (!v.isEmpty() && !v.equals("no") && !v.equals("false") && !v.equals("0")) ? Boolean.TRUE : Boolean.FALSE;
    }

    private Boolean isTunnel(String raw) {
        if (raw == null || raw.isEmpty()) return Boolean.FALSE;
        String v = raw.toLowerCase().trim();
        return (!v.isEmpty() && !v.equals("no") && !v.equals("false") && !v.equals("0")) ? Boolean.TRUE : Boolean.FALSE;
    }

    private String getString(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? String.valueOf(v) : null;
    }

    private long toLong(Object o) {
        if (o instanceof Number) return ((Number) o).longValue();
        return Long.parseLong(String.valueOf(o));
    }

    private int toInt(Object o) {
        if (o instanceof Number) return ((Number) o).intValue();
        return Integer.parseInt(String.valueOf(o));
    }

    private double toDouble(Object o) {
        if (o instanceof Number) return ((Number) o).doubleValue();
        return Double.parseDouble(String.valueOf(o));
    }

    /**
     * 简单 JSON 解析（使用 JDK 内置 JSON 或手动解析）
     * 由于是内部工具，使用简单字符串解析
     */
    private Map<String, Object> parseJson(String json) throws Exception {
        // 使用 Nashorn 或手动解析
        // 由于 JDK 15+ 移除了 Nashorn，改用简单解析
        // 这里用 com.fasterxml.jackson 项目已有依赖
        try {
            Class<?> mapperClass = Class.forName("com.fasterxml.jackson.databind.ObjectMapper");
            Object mapper = mapperClass.getConstructor().newInstance();
            Object root = mapperClass.getMethod("readValue", String.class, Class.class)
                .invoke(mapper, json, Map.class);
            return (Map<String, Object>) root;
        } catch (Exception e) {
            throw new RuntimeException("JSON 解析失败: " + e.getMessage(), e);
        }
    }
}
