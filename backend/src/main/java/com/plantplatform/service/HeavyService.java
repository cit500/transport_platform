package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 重车规则评估及设施级结果持久化。专业算法可在保持返回结构不变的前提下替换。 */
@Service
public class HeavyService {
    private final JdbcTemplate jdbc;
    private final AnalysisStore store;

    public HeavyService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc, AnalysisStore store) {
        this.jdbc = jdbc;
        this.store = store;
    }

    @Transactional("platformTransactionManager")
    public Map<String,Object> evaluate(Map<String,Object> input) {
        String name = text(input.get("taskName"), "重车通行评估任务");
        long taskId = store.start("HEAVY", name, input);
        double grossWeight = number(input.get("grossWeightTon"), 100);
        double vehicleWidth = number(input.get("vehicleWidthM"), 3.2);
        double vehicleHeight = number(input.get("vehicleHeightM"), 4.5);
        boolean avoidBlocked = bool(input.get("avoidBlocked"), true);
        boolean allowConditional = bool(input.get("allowConditional"), true);

        List<Map<String,Object>> assets = jdbc.queryForList("""
            SELECT a.id assetId,a.asset_name assetName,a.asset_type assetType,a.service_status serviceStatus,
                   b.design_load_ton bridgeDesignLoadTon,b.vertical_clearance_m bridgeVerticalClearanceM,
                   b.horizontal_clearance_m bridgeHorizontalClearanceM,
                   t.vertical_clearance_m tunnelVerticalClearanceM,t.horizontal_clearance_m tunnelHorizontalClearanceM
            FROM transport_asset a
            LEFT JOIN bridge_detail b ON b.asset_id=a.id
            LEFT JOIN tunnel_detail t ON t.asset_id=a.id
            ORDER BY a.asset_type,a.asset_code
            """);
        List<Map<String,Object>> rows = new ArrayList<>();
        int pass = 0, conditional = 0, blocked = 0, pending = 0;
        for (Map<String,Object> asset : assets) {
            Map<String,Object> row = judge(asset, grossWeight, vehicleWidth, vehicleHeight);
            rows.add(row);
            String status = String.valueOf(row.get("status"));
            switch (status) {
                case "PASS" -> pass++;
                case "CONDITIONAL" -> conditional++;
                case "BLOCKED" -> blocked++;
                default -> pending++;
            }
            String publishedStatus = "BLOCKED".equals(status) || "PENDING_DATA".equals(status) ? "DENY" : status;
            double score = switch (status) { case "PASS" -> 92; case "CONDITIONAL" -> 62; case "BLOCKED" -> 24; default -> 10; };
            store.addResult(taskId, "ASSET", "HEAVY_PASS", String.valueOf(asset.get("assetId")), publishedStatus, score,
                Map.of("assetId", asset.get("assetId"), "passabilityStatus", publishedStatus,
                       "restrictionReason", row.get("reason"), "recommendedAction", row.get("action"), "score", score));
        }

        String conclusion = pending == rows.size() ? "PENDING_DATA" : "PASS";
        if ((blocked > 0 && !avoidBlocked) || (conditional > 0 && !allowConditional)) conclusion = "BLOCKED";
        else if (blocked > 0 || conditional > 0) conclusion = "CONDITIONAL";
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("id", taskId);
        result.put("taskCode", "HEAVY-" + String.format("%06d", taskId));
        result.put("taskName", name);
        result.put("status", "SUCCESS");
        result.put("rows", rows);
        result.put("pass", pass);
        result.put("conditional", conditional);
        result.put("blocked", blocked);
        result.put("pending", pending);
        result.put("conclusion", conclusion);
        result.put("recommendedDistance", round(25.8 + blocked * 3.1 + conditional * .8));
        result.put("alternativeDistance", round(33.6 + conditional * .7));
        store.complete(taskId, result);
        return result;
    }

    public Map<String,Object> result(long id) { return store.result(id, "HEAVY"); }

    private static Map<String,Object> judge(Map<String,Object> asset, double grossWeight, double vehicleWidth, double vehicleHeight) {
        Map<String,Object> row = new LinkedHashMap<>();
        row.put("assetId", asset.get("assetId"));
        if ("CLOSED".equals(asset.get("serviceStatus")))
            return decision(row, "BLOCKED", "设施当前状态为关闭。", "请选择绕行路线。");
        if ("BRIDGE".equals(asset.get("assetType"))) {
            double capacity = number(asset.get("bridgeDesignLoadTon"), 0);
            if (capacity <= 0) return decision(row, "PENDING_DATA", "缺少桥梁设计荷载参数。", "请补充设计荷载。");
            if (grossWeight > capacity) return decision(row, "BLOCKED", "车辆总重超过桥梁设计荷载。", "请避开该桥梁。");
            if (grossWeight / capacity >= .85) return decision(row, "CONDITIONAL", "荷载利用率接近阈值。", "建议限速并复核轴载。");
            return decision(row, "PASS", "车辆荷载满足当前规则。", "可按计划通行。");
        }
        double vertical = number(asset.get("tunnelVerticalClearanceM"), 0);
        double horizontal = number(asset.get("tunnelHorizontalClearanceM"), 0);
        if (vertical <= 0 || horizontal <= 0) return decision(row, "PENDING_DATA", "缺少隧道净空参数。", "请补充断面参数。");
        if (vehicleHeight > vertical || vehicleWidth > horizontal)
            return decision(row, "BLOCKED", "车辆外廓超过隧道净空。", "请选择绕行路线。");
        if (vehicleHeight > vertical * .9 || vehicleWidth > horizontal * .9)
            return decision(row, "CONDITIONAL", "车辆外廓接近净空阈值。", "建议低速通过。");
        return decision(row, "PASS", "车辆外廓满足隧道断面规则。", "可按计划通行。");
    }

    private static Map<String,Object> decision(Map<String,Object> row, String status, String reason, String action) {
        row.put("status", status); row.put("reason", reason); row.put("action", action); return row;
    }
    private static String text(Object value, String fallback) { return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value); }
    private static double number(Object value, double fallback) { try { return value == null ? fallback : Double.parseDouble(String.valueOf(value)); } catch (Exception ignored) { return fallback; } }
    private static boolean bool(Object value, boolean fallback) { return value == null ? fallback : Boolean.parseBoolean(String.valueOf(value)); }
    private static double round(double value) { return Math.round(value * 10.0) / 10.0; }
}
