package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.*;

/** 首期所有道路边均按双向通行；缓存拓扑，几何仅在路径确定后读取。 */
@Service
public class RoadGraphService {
    public record Node(long id, double longitude, double latitude) {}
    public record Edge(long id, long from, long to, double lengthM) {}
    public record Graph(Map<Long, Node> nodes, Map<Long, List<PathFinder.Step>> adjacency,
                        int edgeCount, String builtAt, double buildMs) {}
    private final JdbcTemplate jdbc;
    private volatile Graph cached;

    public RoadGraphService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Graph graph() {
        Graph graph = cached;
        if (graph != null) return graph;
        synchronized (this) {
            if (cached == null) {
                long start = System.nanoTime();
                // SRID 4326 的轴顺序由 MySQL 空间参考系定义，不能把 ST_X/ST_Y 当作经纬度。
                List<Node> nodes = jdbc.query("SELECT id,ST_Longitude(geom) longitude,ST_Latitude(geom) latitude FROM road_node ORDER BY id",
                        (rs, n) -> new Node(rs.getLong("id"), rs.getDouble("longitude"), rs.getDouble("latitude")));
                List<Edge> edges = jdbc.query("SELECT id,from_node_id,to_node_id,length_m FROM road_edge ORDER BY id",
                        (rs, n) -> new Edge(rs.getLong("id"), rs.getLong("from_node_id"), rs.getLong("to_node_id"), rs.getDouble("length_m")));
                cached = build(nodes, edges, start);
            }
            return cached;
        }
    }

    static Graph build(List<Node> nodeRows, List<Edge> edgeRows, long start) {
        Map<Long, Node> nodes = new LinkedHashMap<>();
        Map<Long, List<PathFinder.Step>> adjacency = new HashMap<>();
        for (Node node : nodeRows) {
            if (!Double.isFinite(node.longitude()) || !Double.isFinite(node.latitude())
                    || Math.abs(node.longitude()) > 180 || Math.abs(node.latitude()) > 90)
                throw new IllegalStateException("路网节点坐标无效：" + node.id());
            nodes.put(node.id(), node);
            adjacency.put(node.id(), new ArrayList<>());
        }
        if (nodes.isEmpty()) throw new IllegalStateException("数据库中尚无路网节点");
        for (Edge edge : edgeRows) {
            if (!nodes.containsKey(edge.from()) || !nodes.containsKey(edge.to())
                    || !Double.isFinite(edge.lengthM()) || edge.lengthM() <= 0)
                throw new IllegalStateException("路网边拓扑或长度无效：" + edge.id());
            adjacency.get(edge.from()).add(new PathFinder.Step(edge.id(), edge.from(), edge.to(), edge.lengthM()));
            adjacency.get(edge.to()).add(new PathFinder.Step(edge.id(), edge.to(), edge.from(), edge.lengthM()));
        }
        adjacency.replaceAll((id, steps) -> List.copyOf(steps));
        return new Graph(Collections.unmodifiableMap(nodes), Map.copyOf(adjacency), edgeRows.size(),
                Instant.now().toString(), (System.nanoTime() - start) / 1e6);
    }

    public static Node nearest(Graph graph, double longitude, double latitude) {
        Node nearest = null;
        double best = Double.POSITIVE_INFINITY;
        for (Node node : graph.nodes().values()) {
            double distance = distanceM(longitude, latitude, node.longitude(), node.latitude());
            if (distance < best) { best = distance; nearest = node; }
        }
        return nearest;
    }

    public static double distanceM(double lon1, double lat1, double lon2, double lat2) {
        double a = Math.pow(Math.sin(Math.toRadians(lat2 - lat1) / 2), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.pow(Math.sin(Math.toRadians(lon2 - lon1) / 2), 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
    }
}
