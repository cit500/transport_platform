package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class AdminService {
    private final JdbcTemplate jdbc;

    public AdminService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Map<String,Object> summary(){
        return Objects.requireNonNull(jdbc.queryForObject("""
            SELECT (SELECT COUNT(*) FROM region) regionCount,
                   (SELECT COUNT(*) FROM road_node) roadNodeCount,
                   (SELECT COUNT(*) FROM road_edge) roadEdgeCount,
                   (SELECT ROUND(COALESCE(SUM(length_m),0)/1000,2) FROM road_edge) roadLengthKm,
                   (SELECT COUNT(*) FROM transport_asset WHERE asset_type='BRIDGE') bridgeCount,
                   (SELECT COUNT(*) FROM transport_asset WHERE asset_type='TUNNEL') tunnelCount,
                   (SELECT COUNT(*) FROM analysis_task) taskCount,
                   (SELECT COUNT(*) FROM transport_asset a LEFT JOIN asset_road_relation r ON r.asset_id=a.id
                     WHERE r.asset_id IS NULL AND a.service_status<>'CLOSED') unboundAssetCount
            """,(rs,n)->{
                Map<String,Object> row=new LinkedHashMap<>();
                row.put("regionCount",rs.getLong("regionCount"));
                row.put("roadNodeCount",rs.getLong("roadNodeCount"));
                row.put("roadEdgeCount",rs.getLong("roadEdgeCount"));
                row.put("roadLengthKm",rs.getBigDecimal("roadLengthKm"));
                row.put("bridgeCount",rs.getLong("bridgeCount"));
                row.put("tunnelCount",rs.getLong("tunnelCount"));
                row.put("taskCount",rs.getLong("taskCount"));
                row.put("unboundAssetCount",rs.getLong("unboundAssetCount"));
                return row;
            }));
    }

    public List<Map<String,Object>> regions(){return jdbc.queryForList("""
        SELECT r.region_code regionCode,r.region_name regionName,r.area_km2 areaKm2,
               COALESCE(x.road_count,0) roadCount,COALESCE(x.road_length_km,0) roadLengthKm
        FROM region r LEFT JOIN (
          SELECT region_code,COUNT(*) road_count,ROUND(SUM(length_m)/1000,2) road_length_km
          FROM road_edge GROUP BY region_code
        ) x ON x.region_code=r.region_code ORDER BY r.region_code
        """);}

    public Map<String,Object> roadNodes(int page,int size,String query){
        List<Object> args=new ArrayList<>();String where="";
        if(hasText(query)){where=" WHERE CAST(n.id AS CHAR) LIKE ?";args.add("%"+query.trim()+"%");}
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM road_node n"+where,Long.class,args.toArray());
        List<Object> dataArgs=new ArrayList<>(args);dataArgs.add(size);dataArgs.add(page*size);
        List<Map<String,Object>> content=jdbc.queryForList("""
            SELECT n.id,n.street_count streetCount,ST_X(n.geom) longitude,ST_Y(n.geom) latitude
            FROM road_node n
            """+where+" ORDER BY n.id LIMIT ? OFFSET ?",dataArgs.toArray());
        return page(content,page,size,total);
    }

    public Map<String,Object> roads(int page,int size,String query){
        List<Object> args=new ArrayList<>(); String where="";
        if(hasText(query)){where=" WHERE e.road_name LIKE ? OR e.road_ref LIKE ? OR CAST(e.id AS CHAR) LIKE ?";String like="%"+query.trim()+"%";args.add(like);args.add(like);args.add(like);}
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM road_edge e"+where,Long.class,args.toArray());
        List<Object> dataArgs=new ArrayList<>(args);dataArgs.add(size);dataArgs.add(page*size);
        List<Map<String,Object>> content=jdbc.queryForList("""
            SELECT e.id,e.from_node_id fromNodeId,e.to_node_id toNodeId,e.road_name roadName,e.road_ref roadRef,e.road_class roadClass,
                   e.region_code regionCode,r.region_name regionName,e.length_m lengthM,
                   e.lane_count laneCount,e.design_speed_kmh designSpeedKmh,e.one_way oneWay,
                   e.source_bridge_flag sourceBridgeFlag,e.source_tunnel_flag sourceTunnelFlag
            FROM road_edge e JOIN region r ON r.region_code=e.region_code
            """+where+" ORDER BY e.id LIMIT ? OFFSET ?",dataArgs.toArray());
        return page(content,page,size,total);
    }

    public Map<String,Object> road(long id){return queryOne("""
        SELECT e.id,e.from_node_id fromNodeId,e.to_node_id toNodeId,e.road_name roadName,
               e.road_ref roadRef,e.road_class roadClass,e.region_code regionCode,r.region_name regionName,
               e.length_m lengthM,e.lane_count laneCount,e.design_speed_kmh designSpeedKmh,
               e.one_way oneWay,e.source_bridge_flag sourceBridgeFlag,e.source_tunnel_flag sourceTunnelFlag,
               ST_AsGeoJSON(e.geom,6) geometry
        FROM road_edge e JOIN region r ON r.region_code=e.region_code WHERE e.id=?
        """,id);}

    public List<Map<String,Object>> roadOptions(String query,int limit){
        List<Object> args=new ArrayList<>();String where="";
        if(hasText(query)){
            where=" WHERE e.road_name LIKE ? OR e.road_ref LIKE ? OR CAST(e.id AS CHAR) LIKE ?";
            String like="%"+query.trim()+"%";args.add(like);args.add(like);args.add(like);
        }
        args.add(limit);
        return jdbc.queryForList("""
            SELECT e.id,e.road_name roadName,e.road_ref roadRef,e.road_class roadClass,
                   e.region_code regionCode,r.region_name regionName,e.length_m lengthM,
                   ar.asset_id boundAssetId,a.asset_name boundAssetName
            FROM road_edge e JOIN region r ON r.region_code=e.region_code
            LEFT JOIN asset_road_relation ar ON ar.road_edge_id=e.id
            LEFT JOIN transport_asset a ON a.id=ar.asset_id
            """+where+" ORDER BY CASE WHEN e.road_name IS NULL THEN 1 ELSE 0 END,e.road_name,e.id LIMIT ?",args.toArray());
    }

    public Map<String,Object> assets(int page,int size,String query,String type){
        List<Object> args=new ArrayList<>();List<String> conditions=new ArrayList<>();
        if(hasText(query)){conditions.add("(a.asset_name LIKE ? OR a.asset_code LIKE ?)");String like="%"+query.trim()+"%";args.add(like);args.add(like);}
        if(hasText(type)){
            String normalized=type.trim().toUpperCase();
            if(!List.of("BRIDGE","TUNNEL").contains(normalized))bad("设施类型筛选值不合法");
            conditions.add("a.asset_type=?");args.add(normalized);
        }
        String where=conditions.isEmpty()?"":" WHERE "+String.join(" AND ",conditions);
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM transport_asset a"+where,Long.class,args.toArray());
        List<Object> dataArgs=new ArrayList<>(args);dataArgs.add(size);dataArgs.add(page*size);
        List<Map<String,Object>> content=jdbc.queryForList("""
            SELECT a.id,a.asset_code assetCode,a.asset_name assetName,a.asset_type assetType,
                   a.region_code regionCode,r.region_name regionName,a.longitude,a.latitude,
                   a.construction_year constructionYear,a.design_grade designGrade,
                   a.service_status serviceStatus,COUNT(ar.road_edge_id) bindingCount,
                   MAX(CASE WHEN ar.relation_type='PRIMARY' THEN e.id END) roadEdgeId,
                   MAX(CASE WHEN ar.relation_type='PRIMARY' THEN e.road_name END) roadName,
                   MAX(CASE WHEN ar.relation_type='PRIMARY' THEN e.road_ref END) roadRef
            FROM transport_asset a LEFT JOIN region r ON r.region_code=a.region_code
            LEFT JOIN asset_road_relation ar ON ar.asset_id=a.id
            LEFT JOIN road_edge e ON e.id=ar.road_edge_id
            """+where+" GROUP BY a.id,r.region_name ORDER BY a.asset_type,a.asset_code LIMIT ? OFFSET ?",dataArgs.toArray());
        return page(content,page,size,total);
    }

    public Map<String,Object> asset(long id){
        Map<String,Object> result=queryOne("""
            SELECT a.id,a.asset_code assetCode,a.asset_name assetName,a.asset_type assetType,
                   a.region_code regionCode,r.region_name regionName,a.longitude,a.latitude,
                   a.construction_year constructionYear,a.design_grade designGrade,a.design_speed_kmh designSpeedKmh,
                   a.baseline_condition_level baselineConditionLevel,a.baseline_inspection_date baselineInspectionDate,
                   a.service_status serviceStatus
            FROM transport_asset a LEFT JOIN region r ON r.region_code=a.region_code WHERE a.id=?
            """,id);
        String table="BRIDGE".equals(result.get("assetType"))?"bridge_detail":"tunnel_detail";
        result.put("detail",optionalOne("SELECT * FROM "+table+" WHERE asset_id=?",id));
        result.put("roads",jdbc.queryForList("""
            SELECT e.id roadEdgeId,e.road_name roadName,e.road_ref roadRef,e.road_class roadClass,
                   e.region_code regionCode,r.region_name regionName,e.length_m lengthM,ar.relation_type relationType,
                   ar.sequence_no sequenceNo,ar.direction,ar.start_chainage startChainage,ar.end_chainage endChainage
            FROM asset_road_relation ar JOIN road_edge e ON e.id=ar.road_edge_id
            JOIN region r ON r.region_code=e.region_code
            WHERE ar.asset_id=? ORDER BY COALESCE(ar.sequence_no,32767),e.id
            """,id));
        return result;
    }

    @Transactional("platformTransactionManager")
    public long saveAsset(Long id,Map<String,Object> body){
        String name=required(body,"assetName"),type=required(body,"assetType");
        if(!List.of("BRIDGE","TUNNEL").contains(type))bad("设施类型必须是 BRIDGE 或 TUNNEL");
        Map<String,Object> existing=id==null?null:queryOne("SELECT asset_code assetCode,asset_type assetType FROM transport_asset WHERE id=?",id);
        String code=id==null||!type.equals(existing.get("assetType"))?nextAssetCode(type):text(existing.get("assetCode"));
        String status=defaultText(body.get("serviceStatus"),"IN_SERVICE");
        if(!List.of("IN_SERVICE","MAINTENANCE","CLOSED").contains(status))bad("服务状态不合法");
        List<Long> roadEdgeIds=roadIds(body.get("roadEdgeIds"));
        if(roadEdgeIds.isEmpty())bad("至少绑定一条路网边");
        String marks=String.join(",",roadEdgeIds.stream().map(value->"?").toList());
        List<Map<String,Object>> roads=jdbc.queryForList("""
            SELECT id,region_code regionCode,
                   ST_X(ST_Centroid(ST_SRID(geom,0))) longitude,
                   ST_Y(ST_Centroid(ST_SRID(geom,0))) latitude
            FROM road_edge WHERE id IN ("""+marks+")",roadEdgeIds.toArray());
        if(roads.size()!=roadEdgeIds.size())bad("部分路网边不存在");
        List<Object> conflictArgs=new ArrayList<>(roadEdgeIds);
        String conflictSql="SELECT COUNT(*) FROM asset_road_relation WHERE road_edge_id IN ("+marks+")";
        if(id!=null){conflictSql+=" AND asset_id<>?";conflictArgs.add(id);}
        if(jdbc.queryForObject(conflictSql,Long.class,conflictArgs.toArray())>0)bad("所选路网边已绑定其他桥隧设施");
        Map<Long,Map<String,Object>> roadById=new HashMap<>();
        for(Map<String,Object> road:roads)roadById.put(longValue(road.get("id")),road);
        Map<String,Object> primaryRoad=roadById.get(roadEdgeIds.get(0));
        String regionCode=text(primaryRoad.get("regionCode"));
        BigDecimal longitude=BigDecimal.ZERO,latitude=BigDecimal.ZERO;
        for(Long roadId:roadEdgeIds){Map<String,Object> road=roadById.get(roadId);longitude=longitude.add(decimal(road.get("longitude")));latitude=latitude.add(decimal(road.get("latitude")));}
        longitude=longitude.divide(BigDecimal.valueOf(roadEdgeIds.size()),7,RoundingMode.HALF_UP);
        latitude=latitude.divide(BigDecimal.valueOf(roadEdgeIds.size()),7,RoundingMode.HALF_UP);
        Object[] values={code,name,type,regionCode,longitude,latitude,
            integer(body.get("constructionYear")),text(body.get("designGrade")),integer(body.get("designSpeedKmh")),
            text(body.get("baselineConditionLevel")),date(body.get("baselineInspectionDate")),status};
        if(id==null){
            KeyHolder key=new GeneratedKeyHolder();
            jdbc.update(c->{PreparedStatement ps=c.prepareStatement("""
                INSERT INTO transport_asset(asset_code,asset_name,asset_type,region_code,longitude,latitude,geom,
                  construction_year,design_grade,design_speed_kmh,baseline_condition_level,baseline_inspection_date,service_status)
                VALUES(?,?,?,?,?,?,CASE WHEN ? IS NULL OR ? IS NULL THEN NULL ELSE ST_SRID(Point(?,?),4326) END,?,?,?,?,?,?)
                """,Statement.RETURN_GENERATED_KEYS);
                bind(ps,values[0],values[1],values[2],values[3],values[4],values[5],values[4],values[5],values[4],values[5],values[6],values[7],values[8],values[9],values[10],values[11]);return ps;},key);
            id=Objects.requireNonNull(key.getKey()).longValue();
        }else{
            if(jdbc.update("""
                UPDATE transport_asset SET asset_code=?,asset_name=?,asset_type=?,region_code=?,longitude=?,latitude=?,
                  geom=CASE WHEN ? IS NULL OR ? IS NULL THEN NULL ELSE ST_SRID(Point(?,?),4326) END,
                  construction_year=?,design_grade=?,design_speed_kmh=?,baseline_condition_level=?,baseline_inspection_date=?,service_status=? WHERE id=?
                """,values[0],values[1],values[2],values[3],values[4],values[5],values[4],values[5],values[4],values[5],values[6],values[7],values[8],values[9],values[10],values[11],id)==0)notFound();
        }
        saveDetail(id,type,map(body.get("detail")));
        replaceRoads(id,roadEdgeIds);
        return id;
    }

    private String nextAssetCode(String type){
        String prefix="BRIDGE".equals(type)?"BRIDGE-CQ-":"TUNNEL-CQ-";
        List<Integer> used=jdbc.queryForList("""
            SELECT CAST(SUBSTRING_INDEX(asset_code,'-',-1) AS UNSIGNED)
            FROM transport_asset WHERE asset_type=? AND asset_code LIKE ? ORDER BY 1
            """,Integer.class,type,prefix+"%");
        int sequence=1;
        for(Integer value:used){if(value==null||value<sequence)continue;if(value==sequence)sequence++;else break;}
        return prefix+String.format("%03d",sequence);
    }

    private void saveDetail(long assetId,String type,Map<String,Object> detail){
        jdbc.update("DELETE FROM bridge_detail WHERE asset_id=?",assetId);
        jdbc.update("DELETE FROM tunnel_detail WHERE asset_id=?",assetId);
        if("BRIDGE".equals(type)){
            jdbc.update("""
                INSERT INTO bridge_detail(asset_id,bridge_type,total_length_m,deck_width_m,span_count,max_span_m,
                  pier_count,representative_pier_height_m,pier_section_type,pier_section_width_m,pier_section_height_m,
                  concrete_strength_mpa,steel_strength_mpa,reinforcement_ratio,bearing_type,bearing_count,
                  bearing_stiffness_kn_m,has_restrainer,design_load_grade,design_load_ton,vertical_clearance_m,horizontal_clearance_m)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,assetId,text(detail.get("bridge_type")),decimal(detail.get("total_length_m")),decimal(detail.get("deck_width_m")),
                integer(detail.get("span_count")),decimal(detail.get("max_span_m")),integer(detail.get("pier_count")),
                decimal(detail.get("representative_pier_height_m")),text(detail.get("pier_section_type")),
                decimal(detail.get("pier_section_width_m")),decimal(detail.get("pier_section_height_m")),
                decimal(detail.get("concrete_strength_mpa")),decimal(detail.get("steel_strength_mpa")),
                decimal(detail.get("reinforcement_ratio")),text(detail.get("bearing_type")),integer(detail.get("bearing_count")),
                decimal(detail.get("bearing_stiffness_kn_m")),bool(detail.get("has_restrainer")),
                text(detail.get("design_load_grade")),decimal(detail.get("design_load_ton")),
                decimal(detail.get("vertical_clearance_m")),decimal(detail.get("horizontal_clearance_m")));
        }else{
            jdbc.update("""
                INSERT INTO tunnel_detail(asset_id,tunnel_type,total_length_m,diameter_m,buried_depth_m,section_type,
                  lining_thickness_cm,concrete_strength_mpa,steel_strength_mpa,elastic_modulus_gpa,surrounding_rock_grade,
                  groundwater_level,site_category,vertical_clearance_m,horizontal_clearance_m,lane_count)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,assetId,text(detail.get("tunnel_type")),decimal(detail.get("total_length_m")),decimal(detail.get("diameter_m")),
                decimal(detail.get("buried_depth_m")),text(detail.get("section_type")),decimal(detail.get("lining_thickness_cm")),
                decimal(detail.get("concrete_strength_mpa")),decimal(detail.get("steel_strength_mpa")),
                decimal(detail.get("elastic_modulus_gpa")),text(detail.get("surrounding_rock_grade")),
                text(detail.get("groundwater_level")),text(detail.get("site_category")),
                decimal(detail.get("vertical_clearance_m")),decimal(detail.get("horizontal_clearance_m")),integer(detail.get("lane_count")));
        }
    }

    private void replaceRoads(long assetId,List<Long> roadEdgeIds){
        jdbc.update("DELETE FROM asset_road_relation WHERE asset_id=?",assetId);
        int sequence=1;
        for(Long roadEdgeId:roadEdgeIds){
            jdbc.update("INSERT INTO asset_road_relation(asset_id,road_edge_id,relation_type,sequence_no) VALUES(?,?,?,?)",
                assetId,roadEdgeId,sequence==1?"PRIMARY":"ADJACENT",sequence++);
        }
    }

    public void updateAssetStatus(long id,Object value){
        String status=text(value);
        if(status==null||!List.of("IN_SERVICE","CLOSED").contains(status))bad("状态只能是 IN_SERVICE 或 CLOSED");
        if(jdbc.update("UPDATE transport_asset SET service_status=? WHERE id=?",status,id)==0)notFound();
    }

    @Transactional("platformTransactionManager")
    public void deleteAsset(long id){
        jdbc.update("DELETE FROM analysis_result WHERE result_scope='ASSET' AND target_key=CAST(? AS CHAR) COLLATE utf8mb4_unicode_ci",id);
        if(jdbc.update("DELETE FROM transport_asset WHERE id=?",id)==0)notFound();
    }

    public Map<String,Object> analysisTasks(int page,int size,String query,String type){
        List<Object> args=new ArrayList<>();List<String> conditions=new ArrayList<>();
        if(hasText(query)){
            conditions.add("(t.task_name LIKE ? OR CAST(t.id AS CHAR) LIKE ?)");
            String like="%"+query.trim()+"%";args.add(like);args.add(like);
        }
        if(hasText(type)){
            String normalized=type.trim().toUpperCase();
            if(!List.of("HEAVY","DISASTER","RESILIENCE","OTHER").contains(normalized))bad("分析类型筛选值不合法");
            conditions.add("t.task_type=?");args.add(normalized);
        }
        String where=conditions.isEmpty()?"":" WHERE "+String.join(" AND ",conditions);
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM analysis_task t"+where,Long.class,args.toArray());
        List<Object> dataArgs=new ArrayList<>(args);dataArgs.add(size);dataArgs.add(page*size);
        List<Map<String,Object>> content=jdbc.queryForList("""
            SELECT t.id,CONCAT(t.task_type,'-',LPAD(t.id,6,'0')) taskCode,
                   t.task_name taskName,t.task_type taskType,t.status,
                   t.created_at createdAt,t.completed_at completedAt,
                   JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.source')) source,
                   COALESCE(x.resultCount,0) resultCount,
                   COALESCE(x.assetCount,0) assetCount,COALESCE(x.regionCount,0) regionCount
            FROM analysis_task t LEFT JOIN (
                SELECT task_id,COUNT(*) resultCount,
                       SUM(result_scope='ASSET') assetCount,SUM(result_scope='REGION') regionCount
                FROM analysis_result GROUP BY task_id
            ) x ON x.task_id=t.id
            """+where+" ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?",dataArgs.toArray());
        return page(content,page,size,total);
    }

    public Map<String,Object> analysisTask(long id,int page,int size){
        Map<String,Object> task=queryOne("""
            SELECT t.id,CONCAT(t.task_type,'-',LPAD(t.id,6,'0')) taskCode,
                   t.task_name taskName,t.task_type taskType,t.status,
                   t.created_at createdAt,t.started_at startedAt,t.completed_at completedAt,
                   t.error_message errorMessage,CAST(t.input_json AS CHAR) inputJson
            FROM analysis_task t WHERE t.id=?
            """,id);
        List<Map<String,Object>> summaries=jdbc.queryForList("""
            SELECT CAST(result_json AS CHAR) resultJson FROM analysis_result
            WHERE task_id=? AND result_scope='SUMMARY' ORDER BY id DESC LIMIT 1
            """,id);
        task.put("summaryJson",summaries.isEmpty()?null:summaries.get(0).get("resultJson"));
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM analysis_result WHERE task_id=? AND result_scope<>'SUMMARY'",Long.class,id);
        List<Map<String,Object>> results=jdbc.queryForList("""
            SELECT ar.id,ar.result_scope resultScope,ar.target_type targetType,ar.target_key targetKey,
                   ar.status_code statusCode,ar.score,CAST(ar.result_json AS CHAR) resultJson,
                   CASE WHEN ar.target_key='CHONGQING' THEN '重庆市总体'
                        WHEN ar.result_scope='ASSET' THEN a.asset_name
                        WHEN ar.result_scope='REGION' THEN rg.region_name
                        ELSE NULL END targetName
            FROM analysis_result ar
            LEFT JOIN transport_asset a ON ar.result_scope='ASSET' AND a.id=CAST(ar.target_key AS UNSIGNED)
            LEFT JOIN region rg ON ar.result_scope='REGION' AND rg.region_code=ar.target_key COLLATE utf8mb4_unicode_ci
            WHERE ar.task_id=? AND ar.result_scope<>'SUMMARY'
            ORDER BY ar.id LIMIT ? OFFSET ?
            """,id,size,page*size);
        task.put("results",page(results,page,size,total));
        return task;
    }

    @Transactional("platformTransactionManager")
    public void deleteAnalysisTask(long id){
        if(jdbc.update("DELETE FROM analysis_task WHERE id=?",id)==0)notFound();
    }
    private Map<String,Object> page(List<Map<String,Object>> c,int p,int s,long t){return Map.of("content",c,"page",p,"size",s,"totalElements",t,"totalPages",(t+s-1)/s);}
    private Map<String,Object> queryOne(String sql,Object...args){List<Map<String,Object>> rows=jdbc.queryForList(sql,args);if(rows.isEmpty())notFound();return new LinkedHashMap<>(rows.get(0));}
    private Map<String,Object> optionalOne(String sql,Object...args){List<Map<String,Object>> rows=jdbc.queryForList(sql,args);return rows.isEmpty()?new LinkedHashMap<>():new LinkedHashMap<>(rows.get(0));}
    private static boolean hasText(String s){return s!=null&&!s.isBlank();}
    private static String required(Map<String,Object>b,String k){String v=text(b.get(k));if(v==null)bad(k+"不能为空");return v;}
    private static String text(Object v){return v==null||String.valueOf(v).isBlank()?null:String.valueOf(v).trim();}
    private static String defaultText(Object v,String fallback){String s=text(v);return s==null?fallback:s;}
    private static BigDecimal decimal(Object v){String s=text(v);return s==null?null:new BigDecimal(s);}
    private static Integer integer(Object v){String s=text(v);return s==null?null:new BigDecimal(s).intValue();}
    private static Long longValue(Object v){String s=text(v);return s==null?null:new BigDecimal(s).longValue();}
    private static java.sql.Date date(Object v){String s=text(v);return s==null?null:java.sql.Date.valueOf(s);}
    @SuppressWarnings("unchecked") private static Map<String,Object> map(Object v){return v instanceof Map<?,?>?(Map<String,Object>)v:new LinkedHashMap<>();}
    private static List<Long> roadIds(Object v){
        LinkedHashSet<Long> ids=new LinkedHashSet<>();
        if(v instanceof List<?> values)for(Object value:values){Long id=longValue(value);if(id!=null)ids.add(id);}
        return new ArrayList<>(ids);
    }
    private static Boolean bool(Object v){String s=text(v);return s==null?null:("true".equalsIgnoreCase(s)||"1".equals(s));}
    private static void bind(PreparedStatement ps,Object...v)throws java.sql.SQLException{for(int i=0;i<v.length;i++)ps.setObject(i+1,v[i]);}
    private static void bad(String m){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,m);}
    private static void notFound(){throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据不存在");}
}
