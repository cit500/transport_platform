package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/** 灾害模块当前提供可替换的演示算法，结果统一写入通用分析表。 */
@Service
public class DisasterService {
    private final JdbcTemplate jdbc; private final AnalysisStore store;
    public DisasterService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc,AnalysisStore store){this.jdbc=jdbc;this.store=store;}

    public Map<String,Object> bootstrap(){
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("earthquakeScenarios",List.of(Map.ofEntries(
            Map.entry("id",1),Map.entry("scenarioName","重庆中心城区示例地震"),Map.entry("regionCode","500100"),
            Map.entry("intensityDegree","VII"),Map.entry("pgaG",0.20),Map.entry("magnitudeMw",6.5),
            Map.entry("durationS",25),Map.entry("siteCategory","II"),Map.entry("longitude",106.55),
            Map.entry("latitude",29.56),Map.entry("isDefault",true))));
        out.put("debrisScenarios",List.of(Map.of("id",2,"scenarioName","渝东南示例泥石流","regionCode","500200","rainfallDurationH",24,"averageRainfallMmH",10,"accumulatedRainfallMm",240,"averageSlopeDegree",28,"longitude",107.76,"latitude",29.33,"isDefault",true)));
        out.put("regions",jdbc.queryForList("SELECT region_code regionCode,region_name regionName FROM region ORDER BY region_code"));
        out.put("assetCount",jdbc.queryForObject("SELECT COUNT(*) FROM transport_asset WHERE service_status<>'CLOSED'",Long.class));
        out.put("recentTasks",store.recent("DISASTER"));return out;
    }

    @Transactional("platformTransactionManager")
    public Map<String,Object> evaluate(Map<String,Object> input){
        String hazard=text(input.get("hazardType"),"EARTHQUAKE");String name=text(input.get("taskName"),"灾害风险评估任务");
        double severity="EARTHQUAKE".equals(hazard)?number(input.get("pgaG"),.2)*3:number(input.get("accumulatedRainfallMm"),240)/500;
        severity=Math.max(.15,Math.min(.95,severity));
        Map<String,Object> storedInput=new LinkedHashMap<>(input);storedInput.put("eventType",hazard);
        storedInput.putIfAbsent("occurredAt",LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));
        if(!storedInput.containsKey("regionName")){String regionCode=text(input.get("regionCode"),null);List<String> names=regionCode==null?List.of():jdbc.queryForList("SELECT region_name FROM region WHERE region_code=?",String.class,regionCode);storedInput.put("regionName",names.isEmpty()?"重庆市":names.get(0));}
        if("EARTHQUAKE".equals(hazard))storedInput.putIfAbsent("magnitude",number(input.get("magnitudeMw"),6.5));else storedInput.putIfAbsent("probability",round(severity*100));
        long id=store.start("DISASTER",name,storedInput);
        List<Map<String,Object>> assets=new ArrayList<>();List<Map<String,Object>> assetRows=jdbc.queryForList("""
            SELECT id assetId,asset_name assetName,asset_type assetType,longitude,latitude FROM transport_asset WHERE service_status<>'CLOSED' ORDER BY id
            """);
        int[] damage=new int[5];int bridge=0,tunnel=0,index=0;
        for(Map<String,Object> row:assetRows){int ordinal=index++;int estimatedDs=Math.min(4,Math.max(0,(int)Math.round(severity*4-(ordinal%3)*.55)));double probability=Math.min(100,round(estimatedDs*20+severity*18+ordinal%5));int ds=damageIndex(probability);String damageLevel="DS"+ds;damage[ds]++;if("BRIDGE".equals(row.get("assetType")))bridge++;else tunnel++;
            Map<String,Object> item=new LinkedHashMap<>(row);item.put("damageState","DS"+ds);item.put("damageProbability",probability);item.put("damageLevel",damageLevel);item.put("passabilityStatus",ds>=4?"BLOCKED":ds>=2?"CONDITIONAL":"PASS");item.put("assessmentReason","基于当前演示参数的规则结果");item.put("recommendedAction",ds>=3?"优先现场复核并设置交通管制":"保持巡检");assets.add(item);
            store.addResult(id,"ASSET","DISASTER_DAMAGE",String.valueOf(row.get("assetId")),damageLevel,probability,Map.of("assetId",row.get("assetId"),"damageProbability",probability,"damageLevel",damageLevel,"damageState","DS"+ds));}
        List<Map<String,Object>> roads=new ArrayList<>();for(Map<String,Object> row:jdbc.queryForList("""
            SELECT id roadEdgeId,road_name roadName,road_ref roadRef,length_m lengthM FROM road_edge
            WHERE source_bridge_flag=TRUE OR source_tunnel_flag=TRUE ORDER BY id LIMIT 80
            """)){Map<String,Object> item=new LinkedHashMap<>(row);item.put("passabilityStatus",severity>.65?"BLOCKED":severity>.35?"CONDITIONAL":"PASS");roads.add(item);}
        double roadKm=roads.stream().mapToDouble(r->number(r.get("lengthM"),0)).sum()/1000;
        Map<String,Object> result=new LinkedHashMap<>();result.put("id",id);result.put("taskCode","DISASTER-"+String.format("%06d",id));result.put("taskName",name);result.put("moduleType",hazard);result.put("status","SUCCESS");result.put("hazardType",hazard);
        result.put("occurrenceProbability",round(severity));result.put("riskScore",round(severity*100));result.put("riskLevel",severity>=.75?"高风险":severity>=.45?"中风险":"低风险");result.put("sourceLongitude",number(input.get("longitude"),106.55));result.put("sourceLatitude",number(input.get("latitude"),29.56));result.put("influenceRadiusKm",number(input.get("influenceRadiusKm"),20));result.put("impactAreaKm2",round(Math.PI*Math.pow(number(input.get("influenceRadiusKm"),20),2)));result.put("maxIntensity",number(input.get("pgaG"),severity));result.put("affectedRoadLengthKm",round(roadKm));result.put("affectedBridgeCount",bridge);result.put("affectedTunnelCount",tunnel);result.put("summaryJson",Map.of("maxFlowSpeedMs",round(severity*8),"maxFlowDepthM",round(severity*3)));result.put("assets",assets);result.put("roads",roads);
        List<Map<String,Object>> dist=new ArrayList<>();for(int i=0;i<5;i++)dist.add(Map.of("name","DS"+i,"value",damage[i]));result.put("damageDistribution",dist);store.complete(id,result);return result;
    }
    public Map<String,Object> result(long id){return store.result(id,"DISASTER");}
    private static String text(Object v,String d){return v==null||String.valueOf(v).isBlank()?d:String.valueOf(v);}
    private static double number(Object v,double d){try{return v==null?d:Double.parseDouble(String.valueOf(v));}catch(Exception e){return d;}}
    private static double round(double v){return Math.round(v*100.0)/100.0;}
    private static int damageIndex(double value){return value<20?0:value<40?1:value<60?2:value<80?3:4;}
}
