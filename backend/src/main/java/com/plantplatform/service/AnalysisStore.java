package com.plantplatform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** 将尚未定型的业务输入和输出集中存为 JSON，避免提前拆出大量专业表。 */
@Service
public class AnalysisStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public AnalysisStore(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc,ObjectMapper mapper){this.jdbc=jdbc;this.mapper=mapper;}

    public long start(String type,String name,Map<String,Object> input){
        KeyHolder key=new GeneratedKeyHolder();String json=write(input);
        jdbc.update(c->{PreparedStatement ps=c.prepareStatement("""
            INSERT INTO analysis_task(task_type,task_name,status,input_json,started_at)
            VALUES(?,?,'RUNNING',CAST(? AS JSON),NOW())
            """,Statement.RETURN_GENERATED_KEYS);ps.setString(1,type);ps.setString(2,name);ps.setString(3,json);return ps;},key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }

    public void complete(long id,Map<String,Object> result){
        jdbc.update("UPDATE analysis_task SET status='SUCCESS',completed_at=NOW() WHERE id=?",id);
        jdbc.update("INSERT INTO analysis_result(task_id,result_scope,result_json) VALUES(?,'SUMMARY',CAST(? AS JSON))",id,write(result));
    }

    public void addResult(long taskId,String scope,String targetType,String targetKey,String statusCode,Number score,Map<String,Object> result){
        jdbc.update("""
            INSERT INTO analysis_result(task_id,result_scope,target_type,target_key,status_code,score,result_json)
            VALUES(?,?,?,?,?,?,CAST(? AS JSON))
            """,taskId,scope,targetType,targetKey,statusCode,score,write(result));
    }

    public Map<String,Object> result(long id,String type){
        List<String> rows=jdbc.queryForList("""
            SELECT CAST(r.result_json AS CHAR) FROM analysis_result r JOIN analysis_task t ON t.id=r.task_id
            WHERE r.task_id=? AND t.task_type=? AND r.result_scope='SUMMARY' ORDER BY r.id DESC LIMIT 1
            """,String.class,id,type);
        if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"分析结果不存在");
        try{return mapper.readValue(rows.get(0),new TypeReference<>(){});}catch(Exception e){throw new IllegalStateException("无法读取分析结果",e);}
    }

    public List<Map<String,Object>> recent(String type){return jdbc.queryForList("""
        SELECT t.id,CONCAT(t.task_type,'-',LPAD(t.id,6,'0')) taskCode,t.task_name taskName,
               COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.hazardType')),
                        JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.eventType')),t.task_type) moduleType,
               t.status,t.created_at createdAt,t.completed_at completedAt,
               (SELECT JSON_UNQUOTE(JSON_EXTRACT(r.result_json,'$.riskLevel')) FROM analysis_result r
                WHERE r.task_id=t.id AND r.result_scope='SUMMARY' ORDER BY r.id DESC LIMIT 1) riskLevel
        FROM analysis_task t WHERE t.task_type=? ORDER BY t.created_at DESC,t.id DESC LIMIT 10
        """,type);}

    private String write(Object value){try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException("JSON 数据无效",e);}}
}
