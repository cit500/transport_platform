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
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class AdminService {
    private final JdbcTemplate jdbc;

    public AdminService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Map<String,Object> summary(){
        Map<String,Object> result = Objects.requireNonNull(jdbc.queryForObject("""
            SELECT (SELECT COUNT(*) FROM region) regionCount,
                   (SELECT COUNT(*) FROM road_node) roadNodeCount,
                   (SELECT COUNT(*) FROM road_edge) roadEdgeCount,
                   (SELECT ROUND(COALESCE(SUM(length_m),0)/1000,2) FROM road_edge) roadLengthKm,
                   (SELECT COUNT(*) FROM transport_asset WHERE asset_type='BRIDGE') bridgeCount,
                   (SELECT COUNT(*) FROM transport_asset WHERE asset_type='TUNNEL') tunnelCount,
                   (SELECT COUNT(*) FROM analysis_task) taskCount
            """,(rs,n)->{
                Map<String,Object> row=new LinkedHashMap<>();
                row.put("行政区",rs.getLong("regionCount"));
                row.put("路网节点",rs.getLong("roadNodeCount"));
                row.put("路网边",rs.getLong("roadEdgeCount"));
                row.put("道路总长(km)",rs.getBigDecimal("roadLengthKm"));
                row.put("桥梁",rs.getLong("bridgeCount"));
                row.put("隧道",rs.getLong("tunnelCount"));
                row.put("分析任务",rs.getLong("taskCount"));
                return row;
            }));
        result.put("未绑定道路的桥隧",jdbc.queryForObject("""
            SELECT COUNT(*) FROM transport_asset a LEFT JOIN asset_road_relation r ON r.asset_id=a.id
            WHERE r.asset_id IS NULL AND a.service_status<>'CLOSED'
            """,Long.class));
        return result;
    }

    public List<Map<String,Object>> regions(){return jdbc.queryForList("""
        SELECT r.region_code regionCode,r.region_name regionName,r.area_km2 areaKm2,
               COALESCE(x.road_count,0) roadCount,COALESCE(x.road_length_km,0) roadLengthKm
        FROM region r LEFT JOIN (
          SELECT region_code,COUNT(*) road_count,ROUND(SUM(length_m)/1000,2) road_length_km
          FROM road_edge GROUP BY region_code
        ) x ON x.region_code=r.region_code ORDER BY r.region_code
        """);}

    public Map<String,Object> roads(int page,int size,String query){
        List<Object> args=new ArrayList<>(); String where="";
        if(hasText(query)){where=" WHERE e.road_name LIKE ? OR e.road_ref LIKE ? OR CAST(e.id AS CHAR) LIKE ?";String like="%"+query.trim()+"%";args.add(like);args.add(like);args.add(like);}
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM road_edge e"+where,Long.class,args.toArray());
        List<Object> dataArgs=new ArrayList<>(args);dataArgs.add(size);dataArgs.add(page*size);
        List<Map<String,Object>> content=jdbc.queryForList("""
            SELECT e.id,e.road_name roadName,e.road_ref roadRef,e.road_class roadClass,
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

    public Map<String,Object> assets(int page,int size,String query){
        List<Object> args=new ArrayList<>();String where="";
        if(hasText(query)){where=" WHERE a.asset_name LIKE ? OR a.asset_code LIKE ?";String like="%"+query.trim()+"%";args.add(like);args.add(like);}
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM transport_asset a"+where,Long.class,args.toArray());
        List<Object> dataArgs=new ArrayList<>(args);dataArgs.add(size);dataArgs.add(page*size);
        List<Map<String,Object>> content=jdbc.queryForList("""
            SELECT a.id,a.asset_code assetCode,a.asset_name assetName,a.asset_type assetType,
                   a.region_code regionCode,r.region_name regionName,a.longitude,a.latitude,
                   a.construction_year constructionYear,a.design_grade designGrade,
                   a.service_status serviceStatus,COUNT(ar.road_edge_id) bindingCount
            FROM transport_asset a LEFT JOIN region r ON r.region_code=a.region_code
            LEFT JOIN asset_road_relation ar ON ar.asset_id=a.id
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
            SELECT e.id roadEdgeId,e.road_name roadName,e.road_ref roadRef,ar.relation_type relationType,
                   ar.sequence_no sequenceNo,ar.direction,ar.start_chainage startChainage,ar.end_chainage endChainage
            FROM asset_road_relation ar JOIN road_edge e ON e.id=ar.road_edge_id
            WHERE ar.asset_id=? ORDER BY COALESCE(ar.sequence_no,32767),e.id
            """,id));
        return result;
    }

    @Transactional("platformTransactionManager")
    public long saveAsset(Long id,Map<String,Object> body){
        String code=required(body,"assetCode"),name=required(body,"assetName"),type=required(body,"assetType");
        if(!List.of("BRIDGE","TUNNEL").contains(type))bad("设施类型必须是 BRIDGE 或 TUNNEL");
        Object[] values={code,name,type,text(body.get("regionCode")),decimal(body.get("longitude")),decimal(body.get("latitude")),
            integer(body.get("constructionYear")),text(body.get("designGrade")),integer(body.get("designSpeedKmh")),
            text(body.get("baselineConditionLevel")),date(body.get("baselineInspectionDate")),defaultText(body.get("serviceStatus"),"IN_SERVICE")};
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
        replaceRoads(id,list(body.get("roads")));
        return id;
    }

    private void replaceRoads(long assetId,List<Map<String,Object>> roads){
        jdbc.update("DELETE FROM asset_road_relation WHERE asset_id=?",assetId);int sequence=1;
        for(Map<String,Object> road:roads){Long roadId=longValue(road.get("roadEdgeId"));if(roadId==null)continue;
            jdbc.update("INSERT INTO asset_road_relation(asset_id,road_edge_id,relation_type,sequence_no) VALUES(?,?,?,?)",
                assetId,roadId,defaultText(road.get("relationType"),sequence==1?"PRIMARY":"ADJACENT"),sequence++);}
    }

    public void closeAsset(long id){if(jdbc.update("UPDATE transport_asset SET service_status='CLOSED' WHERE id=?",id)==0)notFound();}
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
    @SuppressWarnings("unchecked") private static List<Map<String,Object>> list(Object v){return v instanceof List<?>?(List<Map<String,Object>>)v:new ArrayList<>();}
    private static void bind(PreparedStatement ps,Object...v)throws java.sql.SQLException{for(int i=0;i<v.length;i++)ps.setObject(i+1,v[i]);}
    private static void bad(String m){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,m);}
    private static void notFound(){throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据不存在");}
}
