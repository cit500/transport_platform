package com.plantplatform.controller;

import com.plantplatform.model.RoadNode;
import com.plantplatform.model.RoadEdge;
import com.plantplatform.repository.RoadNodeRepository;
import com.plantplatform.repository.RoadEdgeRepository;
import com.plantplatform.service.AdministrativeDivisionService;
import com.plantplatform.service.RoadNetworkImportService;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.io.ParseException;
import org.locationtech.jts.io.WKTReader;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 路网 Geometry 验证 + 导入工具 API
 *
 * 仅用于 V1.3B 导入期间，正式完成后移除。
 */
@RestController
@RequestMapping("/api/road-import")
public class RoadImportController {

    @Autowired
    private RoadNodeRepository nodeRepository;

    @Autowired
    private RoadEdgeRepository edgeRepository;

    @Autowired
    private AdministrativeDivisionService divisionService;

    @Autowired
    private RoadNetworkImportService importService;

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    /**
     * Geometry 小样本验证
     * 测试 Node + Edge 的 GeoJSON → MySQL SRID 4326 → JTS → Java 全链路
     */
    @GetMapping("/geo-verify")
    public ResponseEntity<Map<String, Object>> geoVerify() {
        GeometryFactory factory = new GeometryFactory(new PrecisionModel(), 4326);
        WKTReader reader = new WKTReader();

        try {
            // ---- Node 验证：渝中区中心点 ----
            Point nodePoint = factory.createPoint(new Coordinate(106.5514, 29.5628));
            nodePoint.setSRID(4326);

            // ---- Edge 验证：一条短线段 ----
            Coordinate[] edgeCoords = new Coordinate[]{
                new Coordinate(106.5514, 29.5628),
                new Coordinate(106.5520, 29.5635)
            };
            LineString edgeLine = factory.createLineString(edgeCoords);
            edgeLine.setSRID(4326);

            // WKT round-trip
            String nodeWKT = nodePoint.toText();
            String edgeWKT = edgeLine.toText();
            Point parsedNode = (Point) reader.read(nodeWKT);
            LineString parsedEdge = (LineString) reader.read(edgeWKT);

            Coordinate nodeCoord = parsedNode.getCoordinate();
            Envelope env = parsedEdge.getEnvelopeInternal();

            // 构建结果（避免 Map.of 参数过多）
            Map<String, Object> nodeTest = new HashMap<>();
            nodeTest.put("longitude", 106.5514);
            nodeTest.put("latitude", 29.5628);
            nodeTest.put("jtsX", nodeCoord.x);
            nodeTest.put("jtsY", nodeCoord.y);
            nodeTest.put("srid", parsedNode.getSRID());
            nodeTest.put("wkt", nodeWKT);
            nodeTest.put("parsedWkt", parsedNode.toText());
            nodeTest.put("match", Math.abs(nodeCoord.x - 106.5514) < 0.0001 && Math.abs(nodeCoord.y - 29.5628) < 0.0001);

            Map<String, Object> edgeTest = new HashMap<>();
            edgeTest.put("jtsFirstX", parsedEdge.getCoordinateN(0).x);
            edgeTest.put("jtsFirstY", parsedEdge.getCoordinateN(0).y);
            edgeTest.put("jtsLastX", parsedEdge.getCoordinateN(parsedEdge.getNumPoints() - 1).x);
            edgeTest.put("jtsLastY", parsedEdge.getCoordinateN(parsedEdge.getNumPoints() - 1).y);
            edgeTest.put("srid", parsedEdge.getSRID());
            edgeTest.put("envelopeMinX", env.getMinX());
            edgeTest.put("envelopeMaxX", env.getMaxX());
            edgeTest.put("envelopeMinY", env.getMinY());
            edgeTest.put("envelopeMaxY", env.getMaxY());
            edgeTest.put("wkt", edgeWKT);

            Map<String, Object> range = new HashMap<>();
            range.put("longitudeOk", 105.0 <= 106.5514 && 106.5514 <= 110.0);
            range.put("latitudeOk", 28.0 <= 29.5628 && 29.5628 <= 32.0);
            range.put("note", "JTS Coordinate.x=longitude, y=latitude, SRID 4326");

            Map<String, Object> strategy = new HashMap<>();
            strategy.put("point", "factory.createPoint(Coordinate(lon, lat)), SRID=4326");
            strategy.put("linestring", "factory.createLineString(Coordinate[]{lon,lat,...}), SRID=4326");
            strategy.put("mysql", "ST_GeomFromText('POINT(lon lat)', 4326)");
            strategy.put("conclusion", "JTS Coordinate.x=经度, y=纬度, 与 GeoJSON 一致, 无需交换坐标");

            Map<String, Object> result = new HashMap<>();
            result.put("nodeTest", nodeTest);
            result.put("edgeTest", edgeTest);
            result.put("chongqingRange", range);
            result.put("strategy", strategy);

            return ResponseEntity.ok(result);
        } catch (ParseException e) {
            return ResponseEntity.internalServerError().body(Map.of(
                "error", "WKT parse failed: " + e.getMessage()
            ));
        }
    }

    /**
     * 实际写入单个 Node 到 MySQL（验证持久化）
     */
    @PostMapping("/test-node")
    public ResponseEntity<Map<String, Object>> testNode() {
        GeometryFactory factory = new GeometryFactory(new PrecisionModel(), 4326);
        try {
            Point point = factory.createPoint(new Coordinate(106.5514, 29.5628));
            point.setSRID(4326);

            RoadNode node = new RoadNode();
            node.setOsmid(-999999L); // 测试 ID，验证后删除
            node.setStreetCount(3);
            node.setGeom(point);
            node.setSourceType("TEST");
            node.setCreatedAt(LocalDateTime.now());
            node.setUpdatedAt(LocalDateTime.now());

            RoadNode saved = nodeRepository.save(node);

            // 读回验证
            RoadNode loaded = nodeRepository.findById(saved.getId()).orElseThrow();
            Point loadedPoint = loaded.getGeom();

            Map<String, Object> result = Map.of(
                "savedId", saved.getId(),
                "savedOsmid", saved.getOsmid(),
                "loadedJtsX", loadedPoint.getCoordinate().x,
                "loadedJtsY", loadedPoint.getCoordinate().y,
                "loadedSrid", loadedPoint.getSRID(),
                "longitudeOk", Math.abs(loadedPoint.getCoordinate().x - 106.5514) < 0.0001,
                "latitudeOk", Math.abs(loadedPoint.getCoordinate().y - 29.5628) < 0.0001,
                "message", "测试 Node 已写入，请手动删除 id=" + saved.getId()
            );

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of(
                "error", e.getClass().getSimpleName() + ": " + e.getMessage()
            ));
        }
    }

    /**
     * 清除测试 Node
     */
    @DeleteMapping("/test-cleanup")
    public ResponseEntity<Map<String, Object>> testCleanup() {
        nodeRepository.findByOsmid(-999999L).ifPresent(n -> nodeRepository.delete(n));
        return ResponseEntity.ok(Map.of("status", "cleaned"));
    }

    /**
     * 执行全量导入
     * 读取 nodes.geojson + edges.geojson，写入 MySQL
     */
    @PostMapping("/import")
    public ResponseEntity<Map<String, Object>> doImport() {
        try {
            String nodesPath = "D:\\LYC\\Documents\\Plant_v2\\public\\data\\roadnet\\chongqing_expressway_nodes.geojson";
            String edgesPath = "D:\\LYC\\Documents\\Plant_v2\\gaosu\\data\\chongqing_roadnet\\chongqing_expressway_edges_district_fixed.geojson";

            RoadNetworkImportService.ImportResult result = importService.importAll(nodesPath, edgesPath);
            return ResponseEntity.ok(result.toMap());
        } catch (Exception e) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            err.put("stackTrace", e.getStackTrace() != null && e.getStackTrace().length > 0 ?
                e.getStackTrace()[0].toString() : "N/A");
            return ResponseEntity.internalServerError().body(err);
        }
    }

    /**
     * 修复 osmid 列宽（V1.3B 数据修复）
     */
    @PostMapping("/fix-osmid-column")
    public ResponseEntity<Map<String, Object>> fixOsmidColumn() {
        try {
            jdbc.execute("ALTER TABLE road_edges MODIFY COLUMN osmid VARCHAR(2000) DEFAULT NULL");
            return ResponseEntity.ok(Map.of("status", "osmid column widened to VARCHAR(2000)"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 6条 NULL Edge 空间候选检查
     * 查找每条 Edge 的起点/终点落在哪些行政区中
     */
    @GetMapping("/spatial-candidates")
    public ResponseEntity<Map<String, Object>> spatialCandidates() {
        // 获取6条 NULL Edge
        List<Map<String, Object>> nullEdges = jdbc.queryForList(
            "SELECT id, source_u_osmid, source_v_osmid, name, ref " +
            "FROM road_edges WHERE division_id IS NULL"
        );

        List<Map<String, Object>> results = new java.util.ArrayList<>();

        for (Map<String, Object> edge : nullEdges) {
            long edgeId = ((Number) edge.get("id")).longValue();
            long uOsmid = ((Number) edge.get("source_u_osmid")).longValue();
            long vOsmid = ((Number) edge.get("source_v_osmid")).longValue();

            // 获取起点坐标（MySQL SRID 4326: ST_X=latitude, ST_Y=longitude）
            List<Map<String, Object>> uNodes = jdbc.queryForList(
                "SELECT ST_X(geom) as lat, ST_Y(geom) as lon FROM road_nodes WHERE osmid = ?", uOsmid
            );
            // 获取终点坐标
            List<Map<String, Object>> vNodes = jdbc.queryForList(
                "SELECT ST_X(geom) as lat, ST_Y(geom) as lon FROM road_nodes WHERE osmid = ?", vOsmid
            );

            Map<String, Object> result = new HashMap<>();
            result.put("edgeId", edgeId);
            result.put("sourceUOsmid", uOsmid);
            result.put("sourceVOsmid", vOsmid);
            result.put("name", edge.get("name"));
            result.put("ref", edge.get("ref"));

            if (!uNodes.isEmpty() && !vNodes.isEmpty()) {
                double uLat = ((Number) uNodes.get(0).get("lat")).doubleValue();
                double uLon = ((Number) uNodes.get(0).get("lon")).doubleValue();
                double vLat = ((Number) vNodes.get(0).get("lat")).doubleValue();
                double vLon = ((Number) vNodes.get(0).get("lon")).doubleValue();

                // 中点
                double midLon = (uLon + vLon) / 2;
                double midLat = (uLat + vLat) / 2;

                result.put("uLon", uLon);
                result.put("uLat", uLat);
                result.put("vLon", vLon);
                result.put("vLat", vLat);
                result.put("midLon", midLon);
                result.put("midLat", midLat);

                // 用中点查询 ST_Contains（MySQL SRID 4326: POINT(latitude longitude)）
                String pointWKT = String.format("POINT(%s %s)", midLat, midLon);
                List<Map<String, Object>> candidates = jdbc.queryForList(
                    "SELECT id, canonical_name, display_name " +
                    "FROM administrative_divisions " +
                    "WHERE is_active = 1 AND ST_Contains(geom, ST_GeomFromText(?, 4326))",
                    pointWKT
                );

                result.put("candidates", candidates);
                result.put("candidateCount", candidates.size());

                if (candidates.size() == 1) {
                    result.put("recommendation", "UNIQUE_CANDIDATE");
                    result.put("recommendedDivisionId", ((Number) candidates.get(0).get("id")).longValue());
                } else if (candidates.size() == 0) {
                    result.put("recommendation", "NO_CANDIDATE");
                } else {
                    result.put("recommendation", "AMBIGUOUS");
                }
            } else {
                result.put("error", "Node coordinates not found");
                result.put("recommendation", "ERROR");
            }

            results.add(result);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("nullEdges", results);
        response.put("totalCount", results.size());

        // 统计推荐结果
        long uniqueCount = results.stream().filter(r -> "UNIQUE_CANDIDATE".equals(r.get("recommendation"))).count();
        long ambiguousCount = results.stream().filter(r -> "AMBIGUOUS".equals(r.get("recommendation"))).count();
        long noCandidateCount = results.stream().filter(r -> "NO_CANDIDATE".equals(r.get("recommendation"))).count();

        response.put("uniqueCandidateCount", uniqueCount);
        response.put("ambiguousCount", ambiguousCount);
        response.put("noCandidateCount", noCandidateCount);

        return ResponseEntity.ok(response);
    }

    /**
     * 查看导入统计
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        return ResponseEntity.ok(Map.of(
            "nodeCount", nodeRepository.countAll(),
            "nodeDistinctOsmid", nodeRepository.countDistinctOsmid(),
            "edgeCount", edgeRepository.countAll(),
            "edgeNullNodeFk", edgeRepository.countNullNodeFk(),
            "edgeNullDivisionId", edgeRepository.countNullDivisionId(),
            "bridgeCount", edgeRepository.countBridge(),
            "tunnelCount", edgeRepository.countTunnel(),
            "minLength", edgeRepository.minLength() != null ? edgeRepository.minLength() : 0,
            "maxLength", edgeRepository.maxLength() != null ? edgeRepository.maxLength() : 0,
            "sumLength", edgeRepository.sumLength() != null ? edgeRepository.sumLength() : 0
        ));
    }

    /**
     * 全面完整性验证
     */
    @GetMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify() {
        Map<String, Object> result = new HashMap<>();

        // Node 验证
        result.put("nodeCount", jdbc.queryForObject("SELECT COUNT(*) FROM road_nodes", Long.class));
        result.put("nodeDistinctOsmid", jdbc.queryForObject("SELECT COUNT(DISTINCT osmid) FROM road_nodes", Long.class));
        result.put("nodeGeomNull", jdbc.queryForObject("SELECT COUNT(*) FROM road_nodes WHERE geom IS NULL", Long.class));

        // Edge 验证
        result.put("edgeCount", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges", Long.class));
        result.put("edgeUniqueKey", jdbc.queryForObject(
            "SELECT COUNT(*) FROM (SELECT source_u_osmid, source_v_osmid, edge_key, COUNT(*) c FROM road_edges GROUP BY source_u_osmid, source_v_osmid, edge_key HAVING c>1) t", Long.class));
        result.put("edgeGeomNull", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges WHERE geom IS NULL", Long.class));
        result.put("edgeNullUNodeId", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges WHERE u_node_id IS NULL", Long.class));
        result.put("edgeNullVNodeId", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges WHERE v_node_id IS NULL", Long.class));
        result.put("edgeNullDivisionId", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges WHERE division_id IS NULL", Long.class));

        // FK 完整性
        result.put("fkIntegrityBroken", jdbc.queryForObject(
            "SELECT COUNT(*) FROM road_edges e LEFT JOIN road_nodes un ON e.u_node_id=un.id LEFT JOIN road_nodes vn ON e.v_node_id=vn.id WHERE un.id IS NULL OR vn.id IS NULL", Long.class));

        // highway 分布
        List<Map<String, Object>> hwRows = jdbc.queryForList("SELECT highway, COUNT(*) cnt FROM road_edges GROUP BY highway ORDER BY cnt DESC");
        Map<String, Long> hwDist = new HashMap<>();
        for (Map<String, Object> row : hwRows) hwDist.put((String) row.get("highway"), ((Number) row.get("cnt")).longValue());
        result.put("highwayDistribution", hwDist);

        // bridge/tunnel
        result.put("bridgeRawDistribution", jdbc.queryForList("SELECT bridge_raw, COUNT(*) cnt FROM road_edges GROUP BY bridge_raw ORDER BY cnt DESC"));
        result.put("isBridgeTrue", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges WHERE is_bridge=1", Long.class));
        result.put("tunnelRawDistribution", jdbc.queryForList("SELECT tunnel_raw, COUNT(*) cnt FROM road_edges GROUP BY tunnel_raw ORDER BY cnt DESC"));
        result.put("isTunnelTrue", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges WHERE is_tunnel=1", Long.class));

        // bridge='no' 校验
        result.put("bridgeNoEdges", jdbc.queryForList(
            "SELECT id, source_u_osmid, source_v_osmid, bridge_raw, is_bridge FROM road_edges WHERE bridge_raw='no'"));

        // length 统计
        result.put("lengthMin", jdbc.queryForObject("SELECT MIN(length_m) FROM road_edges", Double.class));
        result.put("lengthMax", jdbc.queryForObject("SELECT MAX(length_m) FROM road_edges", Double.class));
        result.put("lengthSum", jdbc.queryForObject("SELECT SUM(length_m) FROM road_edges", Double.class));
        result.put("lengthNull", jdbc.queryForObject("SELECT COUNT(*) FROM road_edges WHERE length_m IS NULL", Long.class));

        // null district 处理
        result.put("nullDistrictEdges", jdbc.queryForList(
            "SELECT id, source_u_osmid, source_v_osmid, name, ref, division_id FROM road_edges WHERE source_district_name IS NULL"));

        // street_count 分布
        result.put("streetCountDistribution", jdbc.queryForList("SELECT street_count, COUNT(*) cnt FROM road_nodes GROUP BY street_count ORDER BY street_count"));

        return ResponseEntity.ok(result);
    }
}
