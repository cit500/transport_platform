package com.plantplatform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.*;

/** 规划只读数据库，不调用车辆规则，不发布首页重车评估结论。 */
@Service
public class RoadPlanService {
    private final RoadGraphService graphs;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public RoadPlanService(RoadGraphService graphs, @Qualifier("platformJdbcTemplate") JdbcTemplate jdbc,
                           ObjectMapper mapper) {
        this.graphs = graphs; this.jdbc = jdbc; this.mapper = mapper;
    }

    public Map<String, Object> plan(Map<String, Object> input) {
        long started = System.nanoTime();
        double olon = coordinate(input, "originLongitude", 180), olat = coordinate(input, "originLatitude", 90);
        double dlon = coordinate(input, "destinationLongitude", 180), dlat = coordinate(input, "destinationLatitude", 90);
        RoadGraphService.Graph graph = graphs.graph();
        long snapStart = System.nanoTime();
        var origin = RoadGraphService.nearest(graph, olon, olat);
        var destination = RoadGraphService.nearest(graph, dlon, dlat);
        double snapMs = elapsed(snapStart);
        long solveStart = System.nanoTime();
        // 扩展点：未来将人工禁行设施转换成边集合；首期始终为空，不接收禁行参数。
        var path = PathFinder.solve(graph.adjacency(), origin.id(), destination.id(), Set.of());
        double solveMs = elapsed(solveStart);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reachable", path.reachable());
        result.put("status", !path.reachable() ? "UNREACHABLE" : origin.id() == destination.id() ? "SAME_NODE" : "SUCCESS");
        result.put("message", !path.reachable() ? "起点与终点在当前路网中不连通" : origin.id() == destination.id()
                ? "起终点匹配到同一路网节点，路网距离为 0" : "已完成双向简化路网最短路径规划");
        result.put("origin", endpoint(origin, olon, olat));
        result.put("destination", endpoint(destination, dlon, dlat));
        result.put("distanceM", path.reachable() ? path.lengthM() : null);
        result.put("distanceKm", path.reachable() ? path.lengthM() / 1000 : null);
        result.put("edgeCount", path.steps().size());
        result.put("nodeIds", path.reachable() ? nodeIds(origin.id(), path.steps()) : List.of());
        result.put("edgeIds", path.steps().stream().map(PathFinder.Step::edgeId).toList());
        result.put("network", Map.of("nodeCount", graph.nodes().size(), "edgeCount", graph.edgeCount(),
                "builtAt", graph.builtAt(), "buildMs", graph.buildMs(), "directionMode", "BIDIRECTIONAL"));

        List<Map<String, Object>> segments = new ArrayList<>();
        LinkedHashMap<Long, Map<String, Object>> assets = new LinkedHashMap<>();
        if (!path.steps().isEmpty()) {
            List<Long> ids = path.steps().stream().map(PathFinder.Step::edgeId).toList();
            String marks = String.join(",", Collections.nCopies(ids.size(), "?"));
            Map<Long, Map<String, Object>> edges = new HashMap<>();
            for (var row : jdbc.queryForList("SELECT id,road_name roadName,road_ref roadRef,road_class roadClass," +
                    "ST_AsGeoJSON(geom,7) geometryJson FROM road_edge WHERE id IN (" + marks + ")", ids.toArray()))
                edges.put(((Number) row.get("id")).longValue(), row);
            Map<Long, List<Map<String, Object>>> bindings = new HashMap<>();
            for (var row : jdbc.queryForList("SELECT r.road_edge_id roadEdgeId,a.id assetId,a.asset_code assetCode," +
                    "a.asset_name assetName,a.asset_type assetType,a.service_status serviceStatus,a.longitude,a.latitude " +
                    "FROM asset_road_relation r JOIN transport_asset a ON a.id=r.asset_id " +
                    "WHERE r.road_edge_id IN (" + marks + ") ORDER BY a.id", ids.toArray()))
                bindings.computeIfAbsent(((Number) row.get("roadEdgeId")).longValue(), k -> new ArrayList<>()).add(row);
            for (var step : path.steps()) {
                var edge = edges.get(step.edgeId());
                if (edge == null) throw new IllegalStateException("路网数据已变化，请重启后端刷新拓扑");
                List<List<Double>> points = geometry(String.valueOf(edge.get("geometryJson")));
                var from = graph.nodes().get(step.from());
                var first = points.get(0); var last = points.get(points.size() - 1);
                if (RoadGraphService.distanceM(from.longitude(), from.latitude(), last.get(1), last.get(0))
                        < RoadGraphService.distanceM(from.longitude(), from.latitude(), first.get(1), first.get(0)))
                    Collections.reverse(points);
                Map<String, Object> segment = new LinkedHashMap<>();
                segment.put("edgeId", step.edgeId()); segment.put("fromNodeId", step.from()); segment.put("toNodeId", step.to());
                segment.put("lengthM", step.lengthM()); segment.put("roadName", edge.get("roadName"));
                segment.put("roadRef", edge.get("roadRef")); segment.put("roadClass", edge.get("roadClass"));
                segment.put("points", points); segments.add(segment);
                for (var row : bindings.getOrDefault(step.edgeId(), List.of())) {
                    long assetId = ((Number) row.get("assetId")).longValue();
                    if (!assets.containsKey(assetId)) {
                        Map<String, Object> asset = new LinkedHashMap<>(row);
                        asset.put("id", assetId); asset.put("firstEdgeId", step.edgeId());
                        asset.put("sequence", assets.size() + 1);
                        // 无台账坐标时仍保留清单，定位到首次经过的绑定边。
                        var focus = points.get(points.size() / 2);
                        asset.put("focusLatitude", row.get("latitude") == null ? focus.get(0) : row.get("latitude"));
                        asset.put("focusLongitude", row.get("longitude") == null ? focus.get(1) : row.get("longitude"));
                        assets.put(assetId, asset);
                    }
                }
            }
        }
        result.put("segments", segments);
        result.put("assets", new ArrayList<>(assets.values()));
        result.put("bridgeCount", assets.values().stream().filter(a -> "BRIDGE".equals(a.get("assetType"))).count());
        result.put("tunnelCount", assets.values().stream().filter(a -> "TUNNEL".equals(a.get("assetType"))).count());
        result.put("timings", Map.of("snapMs", snapMs, "solveMs", solveMs, "totalMs", elapsed(started)));
        return result;
    }

    private List<List<Double>> geometry(String json) {
        try {
            JsonNode shape = mapper.readTree(json);
            if (!"LineString".equals(shape.path("type").asText())) throw new IllegalArgumentException();
            List<List<Double>> points = new ArrayList<>();
            for (var pair : shape.path("coordinates")) points.add(List.of(pair.get(1).asDouble(), pair.get(0).asDouble()));
            if (points.size() < 2) throw new IllegalArgumentException();
            return points;
        } catch (Exception e) { throw new IllegalStateException("路径道路几何无效，无法绘制真实路线"); }
    }

    private static List<Long> nodeIds(long origin, List<PathFinder.Step> steps) {
        List<Long> nodes = new ArrayList<>(); nodes.add(origin);
        steps.forEach(s -> nodes.add(s.to())); return nodes;
    }
    private static Map<String, Object> endpoint(RoadGraphService.Node node, double lon, double lat) {
        return Map.of("input", Map.of("longitude", lon, "latitude", lat),
                "node", Map.of("id", node.id(), "longitude", node.longitude(), "latitude", node.latitude()),
                "snapDistanceM", RoadGraphService.distanceM(lon, lat, node.longitude(), node.latitude()));
    }
    private static double coordinate(Map<String, Object> input, String field, int limit) {
        Object raw = input.get(field);
        try {
            if (raw == null || String.valueOf(raw).isBlank()) throw new NumberFormatException();
            double value = Double.parseDouble(String.valueOf(raw));
            if (!Double.isFinite(value) || Math.abs(value) > limit) throw new NumberFormatException();
            return value;
        } catch (NumberFormatException e) { throw new IllegalArgumentException(field + " 必须为有效经纬度（±" + limit + "）"); }
    }
    private static double elapsed(long start) { return (System.nanoTime() - start) / 1e6; }
}
