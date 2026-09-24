package com.plantplatform.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.PriorityQueue;
import java.util.Set;

@Service
public class V2ResilienceService {
    private static final String EDGE_FILTER = "road_class IN ('motorway','trunk','primary')";
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public V2ResilienceService(@Qualifier("v2JdbcTemplate") JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Transactional("v2TransactionManager")
    public Map<String, Object> bootstrap() {
        ensureDefaultOdDemands();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("odProfiles", jdbc.queryForList("""
            SELECT p.id,p.profile_name profileName,p.profile_type profileType,p.description,p.is_default isDefault,
                   COUNT(d.id) odCount,COALESCE(SUM(d.demand_veh_h),0) totalDemand
            FROM resilience_od_profile p LEFT JOIN resilience_od_demand d ON d.profile_id=p.id
            GROUP BY p.id ORDER BY p.is_default DESC,p.id
            """));
        result.put("recoveryPlans", jdbc.queryForList("""
            SELECT id,plan_name planName,description,time_unit timeUnit,target_accessibility targetAccessibility,
                   target_travel_time_ratio targetTravelTimeRatio,time_points_json timePointsJson,is_default isDefault
            FROM resilience_recovery_plan ORDER BY is_default DESC,id
            """));
        result.put("disasterTasks", jdbc.queryForList("""
            SELECT t.id,t.task_code taskCode,t.task_name taskName,t.module_type moduleType,t.completed_at completedAt,
                   d.risk_level riskLevel,d.risk_score riskScore,COUNT(r.road_edge_id) affectedRoadCount
            FROM evaluation_task t JOIN disaster_task_result d ON d.task_id=t.id
            LEFT JOIN disaster_road_result r ON r.task_id=t.id
            WHERE t.status='SUCCESS' GROUP BY t.id,d.task_id ORDER BY t.completed_at DESC LIMIT 20
            """));
        result.put("network", jdbc.queryForMap(
            "SELECT (SELECT COUNT(*) FROM road_node) nodeCount,(SELECT COUNT(*) FROM road_edge) edgeCount," +
            "(SELECT COUNT(*) FROM road_edge WHERE " + EDGE_FILTER + ") analysisEdgeCount," +
            "(SELECT ROUND(SUM(length_m)/1000,2) FROM road_edge WHERE " + EDGE_FILTER + ") analysisLengthKm"));
        result.put("recentTasks", jdbc.queryForList("""
            SELECT t.id,t.task_code taskCode,t.task_name taskName,t.status,t.created_at createdAt,t.completed_at completedAt,
                   r.resilience_score resilienceScore,r.resilience_level resilienceLevel
            FROM evaluation_task t LEFT JOIN resilience_task_result r ON r.task_id=t.id
            WHERE t.module_type='RESILIENCE' ORDER BY t.created_at DESC LIMIT 10
            """));
        return result;
    }

    @Transactional("v2TransactionManager")
    public Map<String, Object> evaluate(Map<String, Object> input) {
        ensureDefaultOdDemands();
        long odProfileId = longValue(input.get("odProfileId"), defaultId("resilience_od_profile"));
        long recoveryPlanId = longValue(input.get("recoveryPlanId"), defaultId("resilience_recovery_plan"));
        Long disasterTaskId = nullableLong(input.get("disasterTaskId"));
        double targetAccessibility = number(input.get("targetAccessibility"), .99);
        double targetTravelRatio = number(input.get("targetTravelTimeRatio"), 1.05);
        String taskName = text(input.get("taskName"), "路网韧性评估任务");
        String taskCode = "RS-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        long taskId = createTask(taskCode, taskName, input);

        List<Edge> edges = loadEdges();
        if (edges.isEmpty()) throw new IllegalArgumentException("当前没有可用于韧性分析的道路数据");
        List<Demand> demands = loadDemands(odProfileId);
        if (demands.isEmpty()) throw new IllegalArgumentException("所选OD方案没有交通需求");
        Map<Long, Disruption> disruptions = loadDisruptions(disasterTaskId, edges);
        for (Edge edge : edges) {
            Disruption disruption = disruptions.get(edge.id);
            edge.eta = disruption == null ? 1 : disruption.eta;
            edge.sourceStatus = disruption == null ? "NORMAL" : disruption.status;
        }

        State baseline = assign(edges, demands, false, 1);
        State post = assign(edges, demands, true, 0);
        double accessibility = safe(post.reachableDemand / Math.max(post.totalDemand, 1));
        double efficiency = safe(post.reachableBaselineCost / Math.max(post.totalCost, .001));
        efficiency = clamp(efficiency, 0, 1);
        double retention = clamp(accessibility * efficiency, 0, 1);

        List<Double> timePoints = readTimePoints(recoveryPlanId);
        double maxTime = timePoints.stream().mapToDouble(Double::doubleValue).max().orElse(72);
        List<Timeline> timeline = new ArrayList<>();
        Double recoveryTime = null;
        for (double time : timePoints) {
            double progress = maxTime <= 0 ? 1 : clamp(time / maxTime, 0, 1);
            State state = assign(edges, demands, true, progress);
            double a = safe(state.reachableDemand / Math.max(state.totalDemand, 1));
            double e = clamp(safe(state.reachableBaselineCost / Math.max(state.totalCost, .001)), 0, 1);
            double p = clamp(a * e, 0, 1);
            double k = safe(state.totalCost / Math.max(baseline.totalCost, .001));
            Timeline point = new Timeline(time, a, e, p, k, state.isolatedNodes, state.unreachableOd, state.blockedRoads);
            timeline.add(point);
            if (recoveryTime == null && a >= targetAccessibility && k <= targetTravelRatio) recoveryTime = time;
        }
        double recoveryFactor = recoveryTime == null ? 0 : clamp(1 - recoveryTime / Math.max(maxTime, 1), 0, 1);
        double resilienceScore = clamp(retention * 65 + accessibility * 20 + recoveryFactor * 15, 0, 100);
        String resilienceLevel = resilienceLevel(resilienceScore);

        persist(taskId, disasterTaskId, odProfileId, recoveryPlanId, baseline, post, accessibility, efficiency,
            retention, recoveryTime, resilienceScore, resilienceLevel, edges, demands, timeline);
        jdbc.update("UPDATE evaluation_task SET status='SUCCESS',completed_at=NOW() WHERE id=?", taskId);
        return result(taskId);
    }

    public Map<String, Object> result(long taskId) {
        Map<String, Object> task = jdbc.queryForMap("""
            SELECT t.id,t.task_code taskCode,t.task_name taskName,t.status,t.algorithm_mode algorithmMode,
                   t.algorithm_version algorithmVersion,t.input_snapshot_json inputSnapshotJson,t.created_at createdAt,
                   t.completed_at completedAt,r.source_disaster_task_id sourceDisasterTaskId,r.od_profile_id odProfileId,
                   r.recovery_plan_id recoveryPlanId,r.baseline_total_travel_time baselineTotalTravelTime,
                   r.post_total_travel_time postTotalTravelTime,r.accessibility_rate accessibilityRate,
                   r.efficiency_rate efficiencyRate,r.function_retention_rate functionRetentionRate,
                   r.recovery_time_h recoveryTimeH,r.resilience_score resilienceScore,r.resilience_level resilienceLevel,
                   r.isolated_node_count isolatedNodeCount,r.unreachable_od_count unreachableOdCount,
                   r.blocked_road_count blockedRoadCount,r.reduced_road_count reducedRoadCount,
                   r.affected_road_length_km affectedRoadLengthKm,r.summary_json summaryJson
            FROM evaluation_task t JOIN resilience_task_result r ON r.task_id=t.id WHERE t.id=?
            """, taskId);
        task.put("roads", jdbc.queryForList("""
            SELECT rr.road_edge_id roadEdgeId,e.road_name roadName,e.road_ref roadRef,
                   e.road_class roadClass,e.length_m/1000 lengthKm,rr.remaining_capacity_ratio remainingCapacityRatio,
                   rr.baseline_flow_veh_h baselineFlowVehH,rr.post_flow_veh_h postFlowVehH,
                   rr.volume_capacity_ratio volumeCapacityRatio,rr.road_status roadStatus,
                   rr.criticality_score criticalityScore,rr.recommended_action recommendedAction
            FROM resilience_road_result rr JOIN road_edge e ON e.id=rr.road_edge_id
            WHERE rr.task_id=? ORDER BY rr.criticality_score DESC,e.id LIMIT 3000
            """, taskId));
        task.put("odResults", jdbc.queryForList("""
            SELECT o.od_demand_id odDemandId,CAST(n1.id AS CHAR) originNode,CAST(n2.id AS CHAR) destinationNode,
                   o.reachable,o.demand_veh_h demandVehH,o.baseline_travel_time_min baselineTravelTimeMin,
                   o.post_travel_time_min postTravelTimeMin,o.detour_ratio detourRatio,d.is_priority isPriority,
                   ST_X(n1.geom) originLongitude,ST_Y(n1.geom) originLatitude,
                   ST_X(n2.geom) destinationLongitude,ST_Y(n2.geom) destinationLatitude
            FROM resilience_od_result o JOIN resilience_od_demand d ON d.id=o.od_demand_id
            JOIN road_node n1 ON n1.id=d.origin_node_id JOIN road_node n2 ON n2.id=d.destination_node_id
            WHERE o.task_id=? ORDER BY o.reachable,d.is_priority DESC,o.demand_veh_h DESC
            """, taskId));
        task.put("timeline", jdbc.queryForList("""
            SELECT time_h timeH,accessibility_rate accessibilityRate,efficiency_rate efficiencyRate,
                   function_retention_rate functionRetentionRate,travel_time_ratio travelTimeRatio,
                   isolated_node_count isolatedNodeCount,unreachable_od_count unreachableOdCount,
                   blocked_road_count blockedRoadCount FROM resilience_timeline_result
            WHERE task_id=? ORDER BY time_h
            """, taskId));
        return task;
    }

    private void ensureDefaultOdDemands() {
        final String connectedProfileName = "默认日常交通OD方案（连通版）";
        List<Long> connectedProfiles = jdbc.queryForList(
            "SELECT id FROM resilience_od_profile WHERE profile_name=? LIMIT 1", Long.class, connectedProfileName);
        long profileId;
        if (connectedProfiles.isEmpty()) {
            jdbc.update("UPDATE resilience_od_profile SET is_default=0 WHERE is_default=1");
            jdbc.update("""
                INSERT INTO resilience_od_profile(profile_name,profile_type,description,is_default)
                VALUES(?,?,?,1)
                """, connectedProfileName, "DAILY", "依据实际有向道路生成，保证正常状态 OD 基准可达");
            profileId = jdbc.queryForObject(
                "SELECT id FROM resilience_od_profile WHERE profile_name=?", Long.class, connectedProfileName);
        } else {
            profileId = connectedProfiles.get(0);
            jdbc.update("UPDATE resilience_od_profile SET is_default=(id=?)", profileId);
        }
        Integer versionCount = jdbc.queryForObject("""
            SELECT COUNT(*) FROM resilience_od_demand
            WHERE profile_id=? AND description LIKE '自动生成演示OD-V2-%'
            """, Integer.class, profileId);
        if (versionCount != null && versionCount >= 10) return;

        // 旧方案及其历史结果继续保留；新版按实际有向道路生成，保证正常基准可达。
        List<Map<String, Object>> candidateEdges = jdbc.queryForList(
            "SELECT from_node_id,to_node_id FROM road_edge WHERE " + EDGE_FILTER + " ORDER BY id LIMIT 180");
        int[] sampleIndexes = {0, 17, 34, 52, 69, 86, 104, 121, 138, 155};
        for (int i = 0; i < sampleIndexes.length && sampleIndexes[i] < candidateEdges.size(); i++) {
            Map<String, Object> edge = candidateEdges.get(sampleIndexes[i]);
            long origin = ((Number) edge.get("from_node_id")).longValue();
            long destination = ((Number) edge.get("to_node_id")).longValue();
            jdbc.update("""
                INSERT IGNORE INTO resilience_od_demand(profile_id,origin_node_id,destination_node_id,demand_veh_h,is_priority,description)
                VALUES(?,?,?,?,?,?)
                """, profileId, origin, destination, 260 + i * 55, i < 3, "自动生成演示OD-V2-" + (i + 1));
        }
    }

    private long defaultId(String table) {
        if (!Set.of("resilience_od_profile", "resilience_recovery_plan").contains(table)) throw new IllegalArgumentException("非法默认表");
        Long id = jdbc.queryForObject("SELECT id FROM " + table + " ORDER BY is_default DESC,id LIMIT 1", Long.class);
        return Objects.requireNonNull(id);
    }

    private long createTask(String code, String name, Map<String, Object> input) {
        String snapshot;
        try { snapshot = objectMapper.writeValueAsString(input); }
        catch (JsonProcessingException exception) { throw new IllegalArgumentException("无法保存韧性任务输入", exception); }
        KeyHolder key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO evaluation_task(task_code,task_name,module_type,status,algorithm_mode,algorithm_version,input_snapshot_json,started_at,created_by)
                VALUES(?,?,'RESILIENCE','RUNNING','RULE','resilience-demo-v1',?,NOW(),'user')
                """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, code); statement.setString(2, name); statement.setString(3, snapshot); return statement;
        }, key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }

    private List<Edge> loadEdges() {
        return jdbc.query("""
            SELECT id,from_node_id,to_node_id,COALESCE(road_name,road_ref,CONCAT('道路-',id)) road_name,road_ref,road_class,
                   length_m,COALESCE(design_speed_kmh,CASE road_class WHEN 'motorway' THEN 100 WHEN 'trunk' THEN 80 ELSE 60 END) speed,
                   COALESCE(lane_count,CASE road_class WHEN 'motorway' THEN 4 WHEN 'trunk' THEN 3 ELSE 2 END) lanes
            FROM road_edge WHERE """ + " " + EDGE_FILTER + " ORDER BY id LIMIT 3000", (rs, row) -> {
            double lengthKm = rs.getDouble("length_m") / 1000;
            double speed = Math.max(rs.getDouble("speed"), 20);
            double lanes = Math.max(rs.getDouble("lanes"), 1);
            return new Edge(rs.getLong("id"), rs.getLong("from_node_id"), rs.getLong("to_node_id"),
                rs.getString("road_name"), rs.getString("road_ref"), rs.getString("road_class"), lengthKm,
                speed, lanes * 1800, lengthKm / speed * 60);
        });
    }

    private List<Demand> loadDemands(long profileId) {
        return jdbc.query("""
            SELECT id,origin_node_id,destination_node_id,demand_veh_h,is_priority
            FROM resilience_od_demand WHERE profile_id=? ORDER BY is_priority DESC,id
            """, (rs, row) -> new Demand(rs.getLong("id"), rs.getLong("origin_node_id"), rs.getLong("destination_node_id"),
            rs.getDouble("demand_veh_h"), rs.getBoolean("is_priority")), profileId);
    }

    private Map<Long, Disruption> loadDisruptions(Long taskId, List<Edge> edges) {
        Map<Long, Disruption> result = new HashMap<>();
        if (taskId != null) {
            jdbc.query("SELECT road_edge_id,passability_status FROM disaster_road_result WHERE task_id=?", rs -> {
                String status = rs.getString("passability_status");
                double eta = "BLOCKED".equals(status) ? 0 : "CONDITIONAL".equals(status) ? .5 : 1;
                result.put(rs.getLong("road_edge_id"), new Disruption(eta, status));
            }, taskId);
        } else {
            for (int i = 0; i < edges.size(); i++) {
                Edge edge = edges.get(i);
                if (i % 53 == 0) result.put(edge.id, new Disruption(0, "BLOCKED"));
                else if (i % 17 == 0) result.put(edge.id, new Disruption(.5, "CONDITIONAL"));
            }
        }
        return result;
    }

    private State assign(List<Edge> edges, List<Demand> demands, boolean degraded, double recoveryProgress) {
        Map<Long, Double> eta = new HashMap<>();
        for (Edge edge : edges) {
            double value = degraded ? edge.eta + (1 - edge.eta) * recoveryProgress : 1;
            eta.put(edge.id, clamp(value, 0, 1));
        }
        Map<Long, Double> initialWeights = new HashMap<>();
        for (Edge edge : edges) initialWeights.put(edge.id, edge.freeTimeMin);
        Assignment first = routeAll(edges, demands, eta, initialWeights);
        Map<Long, Double> congestedWeights = new HashMap<>();
        for (Edge edge : edges) {
            double cap = edge.capacity * eta.get(edge.id);
            double flow = first.flows.getOrDefault(edge.id, 0d);
            double time = cap <= .001 ? Double.POSITIVE_INFINITY : edge.freeTimeMin * (1 + .15 * Math.pow(flow / cap, 4));
            congestedWeights.put(edge.id, time);
        }
        Assignment second = routeAll(edges, demands, eta, congestedWeights);
        State state = new State();
        state.totalDemand = demands.stream().mapToDouble(d -> d.q).sum();
        state.flows.putAll(second.flows);
        state.paths.putAll(second.paths);
        for (Demand demand : demands) {
            PathData path = second.paths.get(demand.id);
            PathData baselinePath = route(edges, demand.origin, demand.destination, allOnes(edges), initialWeights);
            if (path != null && path.reachable) {
                state.reachableDemand += demand.q;
                state.totalCost += demand.q * path.time;
                if (baselinePath.reachable) state.reachableBaselineCost += demand.q * baselinePath.time;
            } else state.unreachableOd++;
        }
        state.blockedRoads = (int) eta.values().stream().filter(v -> v <= .001).count();
        state.isolatedNodes = isolatedNodes(edges, eta);
        return state;
    }

    private Assignment routeAll(List<Edge> edges, List<Demand> demands, Map<Long, Double> eta, Map<Long, Double> weights) {
        Assignment result = new Assignment();
        for (Demand demand : demands) {
            PathData path = route(edges, demand.origin, demand.destination, eta, weights);
            result.paths.put(demand.id, path);
            if (path.reachable) for (long edgeId : path.edgeIds) result.flows.merge(edgeId, demand.q, Double::sum);
        }
        return result;
    }

    private PathData route(List<Edge> edges, long origin, long destination, Map<Long, Double> eta, Map<Long, Double> weights) {
        Map<Long, List<Edge>> adjacency = new HashMap<>();
        for (Edge edge : edges) if (eta.getOrDefault(edge.id, 1d) > .001)
            adjacency.computeIfAbsent(edge.from, ignored -> new ArrayList<>()).add(edge);
        Map<Long, Double> distance = new HashMap<>();
        Map<Long, Edge> previous = new HashMap<>();
        PriorityQueue<NodeCost> queue = new PriorityQueue<>(Comparator.comparingDouble(NodeCost::cost));
        distance.put(origin, 0d); queue.add(new NodeCost(origin, 0));
        while (!queue.isEmpty()) {
            NodeCost current = queue.poll();
            if (current.cost > distance.getOrDefault(current.node, Double.POSITIVE_INFINITY)) continue;
            if (current.node == destination) break;
            for (Edge edge : adjacency.getOrDefault(current.node, List.of())) {
                double weight = weights.getOrDefault(edge.id, edge.freeTimeMin);
                if (!Double.isFinite(weight)) continue;
                double next = current.cost + weight;
                if (next < distance.getOrDefault(edge.to, Double.POSITIVE_INFINITY)) {
                    distance.put(edge.to, next); previous.put(edge.to, edge); queue.add(new NodeCost(edge.to, next));
                }
            }
        }
        if (!distance.containsKey(destination)) return new PathData(false, 0, List.of());
        List<Long> ids = new ArrayList<>();
        long cursor = destination;
        while (cursor != origin && previous.containsKey(cursor)) { Edge edge = previous.get(cursor); ids.add(0, edge.id); cursor = edge.from; }
        return new PathData(cursor == origin, distance.get(destination), ids);
    }

    private int isolatedNodes(List<Edge> edges, Map<Long, Double> eta) {
        Set<Long> all = new HashSet<>(), active = new HashSet<>();
        for (Edge edge : edges) {
            all.add(edge.from); all.add(edge.to);
            if (eta.getOrDefault(edge.id, 1d) > .001) { active.add(edge.from); active.add(edge.to); }
        }
        all.removeAll(active); return all.size();
    }

    private Map<Long, Double> allOnes(List<Edge> edges) { Map<Long, Double> map = new HashMap<>(); for (Edge e : edges) map.put(e.id, 1d); return map; }

    private List<Double> readTimePoints(long planId) {
        String json = jdbc.queryForObject("SELECT time_points_json FROM resilience_recovery_plan WHERE id=?", String.class, planId);
        try { return objectMapper.readValue(json, objectMapper.getTypeFactory().constructCollectionType(List.class, Double.class)); }
        catch (Exception exception) { return List.of(0d, 6d, 12d, 24d, 48d, 72d); }
    }

    private void persist(long taskId, Long disasterTaskId, long odProfileId, long planId, State baseline, State post,
                         double accessibility, double efficiency, double retention, Double recoveryTime,
                         double score, String level, List<Edge> edges, List<Demand> demands, List<Timeline> timeline) {
        int blocked = 0, reduced = 0; double affectedLength = 0;
        for (Edge edge : edges) { if (edge.eta <= .001) blocked++; else if (edge.eta < .999) reduced++; if (edge.eta < .999) affectedLength += edge.lengthKm; }
        jdbc.update("""
            INSERT INTO resilience_task_result(task_id,source_disaster_task_id,od_profile_id,recovery_plan_id,
              baseline_total_travel_time,post_total_travel_time,accessibility_rate,efficiency_rate,function_retention_rate,
              recovery_time_h,resilience_score,resilience_level,isolated_node_count,unreachable_od_count,
              blocked_road_count,reduced_road_count,affected_road_length_km,summary_json)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, taskId, disasterTaskId, odProfileId, planId, round(baseline.totalCost,3), round(post.totalCost,3),
            round(accessibility,4), round(efficiency,4), round(retention,4), recoveryTime, round(score,2), level,
            post.isolatedNodes, post.unreachableOd, blocked, reduced, round(affectedLength,2), json(Map.of("engine","DEMO","edgeCount",edges.size(),"odCount",demands.size())));
        for (Edge edge : edges) {
            double baseFlow = baseline.flows.getOrDefault(edge.id,0d), postFlow = post.flows.getOrDefault(edge.id,0d);
            double postCapacity = edge.capacity * edge.eta;
            double vc = postCapacity <= .001 ? 0 : postFlow/postCapacity;
            double postTime = postCapacity <= .001 ? 0 : edge.freeTimeMin*(1+.15*Math.pow(vc,4));
            String status = edge.eta <= .001 ? "BLOCKED" : edge.eta < .999 ? "REDUCED" : "NORMAL";
            double criticality = clamp((1-edge.eta)*60 + Math.min(vc,2)*20 + postFlow/100,0,100);
            String action = "BLOCKED".equals(status) ? "优先抢通并核查替代路径" : "REDUCED".equals(status) ? "实施交通管制并分阶段恢复能力" : "保持监测";
            jdbc.update("""
                INSERT INTO resilience_road_result(task_id,road_edge_id,remaining_capacity_ratio,baseline_capacity_veh_h,
                  post_capacity_veh_h,baseline_flow_veh_h,post_flow_veh_h,baseline_travel_time_min,post_travel_time_min,
                  volume_capacity_ratio,road_status,criticality_score,recommended_action) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, taskId,edge.id,round(edge.eta,4),round(edge.capacity,2),round(postCapacity,2),round(baseFlow,2),round(postFlow,2),
                round(edge.freeTimeMin,4),postCapacity<=.001?null:round(postTime,4),postCapacity<=.001?null:round(vc,4),status,round(criticality,2),action);
        }
        for (Demand demand : demands) {
            PathData base = baseline.paths.get(demand.id), after = post.paths.get(demand.id);
            boolean reachable = after != null && after.reachable;
            Double detour = reachable && base != null && base.time > 0 ? after.time/base.time : null;
            jdbc.update("""
                INSERT INTO resilience_od_result(task_id,od_demand_id,reachable,demand_veh_h,baseline_travel_time_min,post_travel_time_min,detour_ratio)
                VALUES(?,?,?,?,?,?,?)
                """,taskId,demand.id,reachable,round(demand.q,2),base==null?null:round(base.time,3),reachable?round(after.time,3):null,detour==null?null:round(detour,4));
        }
        for (Timeline point : timeline) jdbc.update("""
            INSERT INTO resilience_timeline_result(task_id,time_h,accessibility_rate,efficiency_rate,function_retention_rate,
              travel_time_ratio,isolated_node_count,unreachable_od_count,blocked_road_count) VALUES(?,?,?,?,?,?,?,?,?)
            """,taskId,point.time,round(point.accessibility,4),round(point.efficiency,4),round(point.retention,4),round(point.k,4),point.isolated,point.unreachable,point.blocked);
    }

    private String resilienceLevel(double score) { return score>=85?"高韧性":score>=75?"较高韧性":score>=65?"中等韧性":score>=50?"较低韧性":"低韧性"; }
    private String json(Object value) { try{return objectMapper.writeValueAsString(value);}catch(Exception e){return "{}";} }
    private static double number(Object value,double fallback){try{return value==null?fallback:Double.parseDouble(value.toString());}catch(Exception e){return fallback;}}
    private static long longValue(Object value,long fallback){try{return value==null?fallback:Long.parseLong(value.toString());}catch(Exception e){return fallback;}}
    private static Long nullableLong(Object value){try{return value==null||value.toString().isBlank()?null:Long.parseLong(value.toString());}catch(Exception e){return null;}}
    private static String text(Object value,String fallback){return value==null||value.toString().isBlank()?fallback:value.toString();}
    private static double clamp(double value,double min,double max){return Math.max(min,Math.min(max,value));}
    private static double safe(double value){return Double.isFinite(value)?value:0;}
    private static double round(double value,int scale){double p=Math.pow(10,scale);return Math.round(value*p)/p;}

    private record Disruption(double eta,String status) {}
    private record Demand(long id,long origin,long destination,double q,boolean priority) {}
    private record NodeCost(long node,double cost) {}
    private record PathData(boolean reachable,double time,List<Long> edgeIds) {}
    private record Timeline(double time,double accessibility,double efficiency,double retention,double k,int isolated,int unreachable,int blocked) {}
    private static class Assignment { final Map<Long,Double> flows=new HashMap<>(); final Map<Long,PathData> paths=new HashMap<>(); }
    private static class State {
        double totalDemand,reachableDemand,totalCost,reachableBaselineCost; int isolatedNodes,unreachableOd,blockedRoads;
        final Map<Long,Double> flows=new HashMap<>(); final Map<Long,PathData> paths=new HashMap<>();
    }
    private static class Edge {
        final long id,from,to; final String name,ref,roadClass; final double lengthKm,speed,capacity,freeTimeMin;
        double eta=1; String sourceStatus="NORMAL";
        Edge(long id,long from,long to,String name,String ref,String roadClass,double lengthKm,double speed,double capacity,double freeTimeMin){
            this.id=id;this.from=from;this.to=to;this.name=name;this.ref=ref;this.roadClass=roadClass;this.lengthKm=lengthKm;this.speed=speed;this.capacity=capacity;this.freeTimeMin=freeTimeMin;
        }
    }
}
