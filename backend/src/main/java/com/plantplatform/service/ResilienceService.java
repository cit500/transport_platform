package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 韧性模块当前用轻量演示参数运行，正式方法确定后可替换而无需调整基础库。 */
@Service
public class ResilienceService {
    private final JdbcTemplate jdbc;private final AnalysisStore store;
    public ResilienceService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc,AnalysisStore store){this.jdbc=jdbc;this.store=store;}
    public Map<String,Object> bootstrap(){
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("odProfiles",List.of(Map.of("id",1,"profileName","默认演示 OD","description","由现有路网自动抽取","isDefault",true)));
        out.put("recoveryPlans",List.of(Map.of("id",1,"planName","72小时分阶段恢复","description","演示恢复曲线","isDefault",true)));
        out.put("disasterTasks",store.recent("DISASTER"));out.put("recentTasks",store.recent("RESILIENCE"));
        out.put("network",jdbc.queryForMap("SELECT (SELECT COUNT(*) FROM road_node) nodeCount,(SELECT COUNT(*) FROM road_edge) roadCount,(SELECT ROUND(SUM(length_m)/1000,2) FROM road_edge) roadLengthKm"));return out;
    }
    @Transactional("platformTransactionManager")
    public Map<String,Object> evaluate(Map<String,Object> input){
        String name=input.get("taskName")==null?"路网韧性评估任务":String.valueOf(input.get("taskName"));long id=store.start("RESILIENCE",name,input);
        List<Map<String,Object>> rows=jdbc.queryForList("SELECT id roadEdgeId,road_name roadName,road_ref roadRef,length_m lengthM FROM road_edge ORDER BY id LIMIT 60");
        List<Map<String,Object>> roads=new ArrayList<>();int blocked=0,reduced=0;double affected=0;int i=0;
        for(Map<String,Object> row:rows){double ratio=i%11==0?0:i%4==0?.5:1;i++;if(ratio==0)blocked++;else if(ratio<1)reduced++;if(ratio<1)affected+=number(row.get("lengthM"));Map<String,Object> item=new LinkedHashMap<>(row);item.put("remainingCapacityRatio",ratio);item.put("passabilityStatus",ratio==0?"BLOCKED":ratio<1?"CONDITIONAL":"PASS");roads.add(item);}
        double accessibility=.91,retention=.78,efficiency=.82,score=83;
        List<Map<String,Object>> od=List.of(
            Map.of("odDemandId",1,"originNode",rows.isEmpty()?1:1,"destinationNode",2,"demandVehH",320,"reachable",true,"detourRatio",1.18),
            Map.of("odDemandId",2,"originNode",3,"destinationNode",4,"demandVehH",180,"reachable",false,"detourRatio",0));
        List<Map<String,Object>> timeline=new ArrayList<>();for(int h:new int[]{0,12,24,48,72})timeline.add(Map.of("timeH",h,"functionRetentionRate",round(retention+(1-retention)*h/72.0)));
        Map<String,Object> result=new LinkedHashMap<>();result.put("id",id);result.put("taskCode","RESILIENCE-"+String.format("%06d",id));result.put("taskName",name);result.put("status","SUCCESS");result.put("baselineTotalTravelTime",125000);result.put("postTotalTravelTime",158000);result.put("accessibilityRate",accessibility);result.put("efficiencyRate",efficiency);result.put("functionRetentionRate",retention);result.put("recoveryTimeH",72);result.put("resilienceScore",score);result.put("resilienceLevel","较高韧性");result.put("isolatedNodeCount",3);result.put("unreachableOdCount",1);result.put("blockedRoadCount",blocked);result.put("reducedRoadCount",reduced);result.put("affectedRoadLengthKm",round(affected/1000));result.put("roads",roads);result.put("odResults",od);result.put("timeline",timeline);store.complete(id,result);return result;
    }
    public Map<String,Object> result(long id){return store.result(id,"RESILIENCE");}
    private static double number(Object v){try{return Double.parseDouble(String.valueOf(v));}catch(Exception e){return 0;}}
    private static double round(double v){return Math.round(v*100.0)/100.0;}
}
