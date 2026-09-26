package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 首页只发布已经落库的分析结果；基础表保持稳定，专业结果保留任务历史。 */
@Service
public class DashboardDataService {
    private final JdbcTemplate jdbc;

    public DashboardDataService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc){this.jdbc=jdbc;}

    public Map<String,Object> bootstrap(){
        Map<String,Object> response=new LinkedHashMap<>();
        List<Map<String,Object>> heavy=heavyResults();
        List<Map<String,Object>> damage=damageResults();
        response.put("overview",overview());
        response.put("defaultVehicle",latestHeavyVehicle());
        response.put("passSummary",passSummary(heavy));
        response.put("heavyResults",heavy);
        response.put("regions",regions());
        response.put("resilienceOverall",resilienceOverall());
        response.put("damageDistribution",damageDistribution(damage));
        response.put("damageResults",damage);
        response.put("hazardNotices",hazardNotices());
        response.put("assistantQuestions",List.of(
            Map.of("questionCode","platform","answerText","平台统一管理路网、桥隧，以及重车通行、灾害影响和区域韧性分析结果。"),
            Map.of("questionCode","map","answerText","地图可切换韧性指数、路网连通度和灾害恢复能力，颜色由红到黄再到绿表示数值由低到高。"),
            Map.of("questionCode","heavy","answerText","左侧按每处桥隧最近一次成功评估展示通行结论；新任务只更新本次涉及的设施。")
        ));
        return response;
    }

    public Map<String,Object> latestHeavyVehicle(){
        List<Map<String,Object>> rows=jdbc.queryForList("""
            SELECT COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.profileName')),''),'最近一次重车任务') profileName,
                   COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.grossWeightTon')) AS DECIMAL(10,1)),100) grossWeightTon,
                   COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.vehicleLengthM')) AS DECIMAL(10,1)),18) vehicleLengthM,
                   COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.vehicleWidthM')) AS DECIMAL(10,1)),3.2) vehicleWidthM,
                   COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.vehicleHeightM')) AS DECIMAL(10,1)),4.5) vehicleHeightM,
                   COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.axleCount')) AS UNSIGNED),6) axleCount
            FROM analysis_task t
            WHERE t.task_type='HEAVY' AND t.status='SUCCESS'
              AND EXISTS (SELECT 1 FROM analysis_result r WHERE r.task_id=t.id AND r.result_scope='ASSET' AND r.target_type='HEAVY_PASS')
            ORDER BY COALESCE(t.completed_at,t.created_at) DESC,t.id DESC LIMIT 1
            """);
        return rows.isEmpty()?Map.of("profileName","暂无重车评估","grossWeightTon",100,
            "vehicleLengthM",18,"vehicleWidthM",3.2,"vehicleHeightM",4.5,"axleCount",6):rows.get(0);
    }

    public Map<String,Object> overview(){
        return jdbc.queryForMap("""
            SELECT (SELECT COUNT(*) FROM region) regionCount,
                   (SELECT COUNT(*) FROM road_edge) roadCount,
                   (SELECT ROUND(COALESCE(SUM(length_m),0)/1000,2) FROM road_edge) roadLengthKm,
                   (SELECT COUNT(*) FROM transport_asset WHERE asset_type='BRIDGE') bridgeCount,
                   (SELECT COUNT(*) FROM transport_asset WHERE asset_type='TUNNEL') tunnelCount
            """);
    }

    public List<Map<String,Object>> heavyResults(){
        return jdbc.queryForList("""
            WITH ranked AS (
              SELECT ar.target_key,ar.status_code,ar.score,ar.result_json,t.id task_id,
                     COALESCE(t.completed_at,t.created_at) evaluated_at,
                     ROW_NUMBER() OVER (PARTITION BY ar.target_key
                       ORDER BY COALESCE(t.completed_at,t.created_at) DESC,t.id DESC,ar.id DESC) rn
              FROM analysis_result ar JOIN analysis_task t ON t.id=ar.task_id
              WHERE ar.result_scope='ASSET' AND ar.target_type='HEAVY_PASS'
                AND t.task_type='HEAVY' AND t.status='SUCCESS'
            )
            SELECT a.id assetId,a.asset_name assetName,a.asset_type assetType,
                   ar.status_code passabilityStatus,
                   JSON_UNQUOTE(JSON_EXTRACT(ar.result_json,'$.restrictionReason')) restrictionReason,
                   ar.score,ar.task_id taskId,ar.evaluated_at evaluatedAt
            FROM transport_asset a
            LEFT JOIN ranked ar ON ar.rn=1 AND ar.target_key=CAST(a.id AS CHAR) COLLATE utf8mb4_unicode_ci
            ORDER BY a.asset_type,a.asset_code
            """);
    }

    private List<Map<String,Object>> passSummary(List<Map<String,Object>> heavy){
        Map<String,int[]> counts=new LinkedHashMap<>();
        for(Map<String,Object> row:heavy){
            int[] values=counts.computeIfAbsent(String.valueOf(row.get("assetType")),key->new int[5]);
            values[0]++;
            String status=(String)row.get("passabilityStatus");
            if(status==null)continue;
            values[1]++;
            switch(status){case "PASS" -> values[2]++;case "CONDITIONAL" -> values[3]++;case "DENY" -> values[4]++;default -> {}}
        }
        List<Map<String,Object>> summary=new ArrayList<>();
        for(Map.Entry<String,int[]> entry:counts.entrySet()){
            int[] c=entry.getValue();Map<String,Object> row=new LinkedHashMap<>();
            row.put("assetType",entry.getKey());row.put("totalCount",c[0]);row.put("assessedCount",c[1]);
            row.put("passCount",c[2]);row.put("conditionalCount",c[3]);row.put("denyCount",c[4]);
            row.put("strictPassRate",c[1]==0?null:BigDecimal.valueOf(100L*c[2]).divide(BigDecimal.valueOf(c[1]),1,java.math.RoundingMode.HALF_UP));
            summary.add(row);
        }
        return summary;
    }

    private List<Map<String,Object>> damageDistribution(List<Map<String,Object>> damage){
        List<Map<String,Object>> distribution=new ArrayList<>();
        for(int i=0;i<5;i++){
            String level="DS"+i;
            long count=damage.stream().filter(row->level.equals(row.get("damageLevel"))).count();
            distribution.add(Map.of("name",level,"value",count));
        }
        return distribution;
    }

    public List<Map<String,Object>> damageResults(){
        return jdbc.queryForList("""
            WITH ranked AS (
              SELECT ar.target_key,ar.score,t.id task_id,COALESCE(t.completed_at,t.created_at) evaluated_at,
                     ROW_NUMBER() OVER (PARTITION BY ar.target_key
                       ORDER BY COALESCE(t.completed_at,t.created_at) DESC,t.id DESC,ar.id DESC) rn
              FROM analysis_result ar JOIN analysis_task t ON t.id=ar.task_id
              WHERE ar.result_scope='ASSET' AND ar.target_type='DISASTER_DAMAGE'
                AND t.task_type='DISASTER' AND t.status='SUCCESS'
            )
            SELECT a.id assetId,a.asset_name assetName,a.asset_type assetType,
                   ar.score damageProbability,
                   CASE WHEN ar.score IS NULL THEN NULL WHEN ar.score<20 THEN 'DS0'
                        WHEN ar.score<40 THEN 'DS1' WHEN ar.score<60 THEN 'DS2'
                        WHEN ar.score<80 THEN 'DS3' ELSE 'DS4' END damageLevel,
                   ar.task_id taskId,ar.evaluated_at evaluatedAt
            FROM transport_asset a
            LEFT JOIN ranked ar ON ar.rn=1 AND ar.target_key=CAST(a.id AS CHAR) COLLATE utf8mb4_unicode_ci
            ORDER BY a.asset_type,a.asset_code
            """);
    }

    public List<Map<String,Object>> regions(){
        return jdbc.queryForList("""
            WITH ranked AS (
              SELECT ar.target_key,ar.score,ar.result_json,
                     ROW_NUMBER() OVER (PARTITION BY ar.target_key
                       ORDER BY COALESCE(t.completed_at,t.created_at) DESC,t.id DESC,ar.id DESC) rn
              FROM analysis_result ar JOIN analysis_task t ON t.id=ar.task_id
              WHERE ar.result_scope='REGION' AND ar.target_type='RESILIENCE'
                AND ar.target_key<>'CHONGQING' AND t.task_type='RESILIENCE' AND t.status='SUCCESS'
            )
            SELECT r.region_code regionCode,r.region_name regionName,
                   rr.score resilienceIndex,
                   CAST(JSON_UNQUOTE(JSON_EXTRACT(rr.result_json,'$.connectivityScore')) AS DECIMAL(10,1)) connectivityScore,
                   CAST(JSON_UNQUOTE(JSON_EXTRACT(rr.result_json,'$.recoveryCapacity')) AS DECIMAL(10,1)) recoveryCapacity
            FROM region r
            LEFT JOIN ranked rr ON rr.rn=1 AND rr.target_key COLLATE utf8mb4_unicode_ci=r.region_code
            ORDER BY r.region_code
            """);
    }

    public Map<String,Object> resilienceOverall(){
        List<Map<String,Object>> rows=jdbc.queryForList("""
            SELECT 'CHONGQING' regionCode,'重庆市总体' regionName,ar.score resilienceIndex,
                   CAST(JSON_UNQUOTE(JSON_EXTRACT(ar.result_json,'$.connectivityScore')) AS DECIMAL(10,1)) connectivityScore,
                   CAST(JSON_UNQUOTE(JSON_EXTRACT(ar.result_json,'$.recoveryCapacity')) AS DECIMAL(10,1)) recoveryCapacity
            FROM analysis_result ar JOIN analysis_task t ON t.id=ar.task_id
            WHERE ar.result_scope='REGION' AND ar.target_type='RESILIENCE' AND ar.target_key='CHONGQING' AND t.status='SUCCESS'
            ORDER BY COALESCE(t.completed_at,t.created_at) DESC,t.id DESC LIMIT 1
            """);
        if(!rows.isEmpty())return new LinkedHashMap<>(rows.get(0));
        List<Map<String,Object>> regions=regions();
        Map<String,Object> fallback=new LinkedHashMap<>();fallback.put("regionCode","CHONGQING");fallback.put("regionName","重庆市总体");
        fallback.put("resilienceIndex",average(regions,"resilienceIndex"));fallback.put("connectivityScore",average(regions,"connectivityScore"));fallback.put("recoveryCapacity",average(regions,"recoveryCapacity"));return fallback;
    }

    public List<Map<String,Object>> hazardNotices(){
        List<Map<String,Object>> source=jdbc.queryForList("""
            SELECT id,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(input_json,'$.eventType')),
                               JSON_UNQUOTE(JSON_EXTRACT(input_json,'$.hazardType'))) eventType,
                   JSON_UNQUOTE(JSON_EXTRACT(input_json,'$.occurredAt')) occurredAt,
                   JSON_UNQUOTE(JSON_EXTRACT(input_json,'$.regionName')) regionName,
                   JSON_UNQUOTE(JSON_EXTRACT(input_json,'$.magnitude')) magnitude,
                   JSON_UNQUOTE(JSON_EXTRACT(input_json,'$.probability')) probability
            FROM analysis_task WHERE task_type='DISASTER' AND status='SUCCESS'
              AND COALESCE(JSON_EXTRACT(input_json,'$.eventType'),JSON_EXTRACT(input_json,'$.hazardType')) IS NOT NULL
            ORDER BY COALESCE(completed_at,created_at) DESC,id DESC LIMIT 5
            """);
        List<Map<String,Object>> notices=new ArrayList<>();
        for(Map<String,Object> row:source){
            String type=String.valueOf(row.get("eventType"));String occurred=String.valueOf(row.get("occurredAt"));
            String detail="EARTHQUAKE".equals(type)?row.get("magnitude")+" 级地震":"泥石流发生概率 "+row.get("probability")+"%";
            Map<String,Object> notice=new LinkedHashMap<>();notice.put("id",row.get("id"));notice.put("regionName",row.get("regionName"));notice.put("eventType",type);notice.put("occurredAt",occurred);notice.put("content",occurred+" · "+detail);notices.add(notice);
        }
        return notices;
    }

    private static BigDecimal average(List<Map<String,Object>> rows,String key){
        BigDecimal total=BigDecimal.ZERO;int count=0;
        for(Map<String,Object> row:rows){Object value=row.get(key);if(value instanceof Number number){total=total.add(new BigDecimal(number.toString()));count++;}}
        return count==0?BigDecimal.ZERO:total.divide(BigDecimal.valueOf(count),1,java.math.RoundingMode.HALF_UP);
    }
}
