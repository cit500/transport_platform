-- 首页发布数据：重车通行、灾害影响、区域韧性和灾害动态。
-- 可重复执行；只替换 source=SYSTEM_SEED 的预置任务，不影响用户运行的分析任务。
SET NAMES utf8mb4;
START TRANSACTION;

DELETE FROM analysis_task
WHERE JSON_UNQUOTE(JSON_EXTRACT(input_json,'$.source'))='SYSTEM_SEED';

INSERT INTO analysis_task(task_type,task_name,status,input_json,created_at,started_at,completed_at)
VALUES('HEAVY','预置重车通行评估','SUCCESS',JSON_OBJECT('source','SYSTEM_SEED','profileName','默认100吨重型运输车'),
       '2026-09-19 09:00:00','2026-09-19 09:00:00','2026-09-19 09:02:00');
SET @heavy_task=LAST_INSERT_ID();

INSERT INTO analysis_result(task_id,result_scope,target_type,target_key,sequence_no,status_code,score,result_json)
SELECT @heavy_task,'ASSET','HEAVY_PASS',CAST(x.id AS CHAR),x.id,x.pass_status,x.pass_score,
       JSON_OBJECT('assetId',x.id,'passabilityStatus',x.pass_status,'restrictionReason',
         CASE x.pass_status WHEN 'PASS' THEN '当前车辆荷载与设施净空满足通行条件'
              WHEN 'CONDITIONAL' THEN '建议限速通过，并在通行前复核设施状态'
              ELSE '当前车辆参数超过设施通行控制条件' END,'score',x.pass_score)
FROM (
  SELECT ranked.id,
         CASE WHEN ranked.row_no<=GREATEST(1,FLOOR(ranked.total_count*.60)) THEN 'PASS'
              WHEN ranked.row_no<=FLOOR(ranked.total_count*.85) THEN 'CONDITIONAL' ELSE 'DENY' END pass_status,
         CASE WHEN ranked.row_no<=GREATEST(1,FLOOR(ranked.total_count*.60)) THEN 88+MOD(ranked.row_no,8)
              WHEN ranked.row_no<=FLOOR(ranked.total_count*.85) THEN 64+MOD(ranked.row_no,5) ELSE 28+MOD(ranked.row_no,8) END pass_score
  FROM (
    SELECT a.id,ROW_NUMBER() OVER(ORDER BY CRC32(CONCAT(a.asset_code,'dashboard-seed')),a.id) row_no,COUNT(*) OVER() total_count
    FROM transport_asset a
  ) ranked
) x;

INSERT INTO analysis_result(task_id,result_scope,result_json)
SELECT @heavy_task,'SUMMARY',
       JSON_OBJECT('profileName','默认100吨重型运输车',
                   'assetCount',COUNT(*),
                   'passCount',SUM(status_code='PASS'),
                   'conditionalCount',SUM(status_code='CONDITIONAL'),
                   'denyCount',SUM(status_code='DENY'))
FROM analysis_result WHERE task_id=@heavy_task AND target_type='HEAVY_PASS';

INSERT INTO analysis_task(task_type,task_name,status,input_json,created_at,started_at,completed_at)
VALUES('DISASTER','预置灾害事件·武隆地震','SUCCESS',JSON_OBJECT('source','SYSTEM_SEED','eventType','EARTHQUAKE','occurredAt','2026-09-20 14:35','regionCode','500156','regionName','武隆区','magnitude',4.5),
       '2026-09-20 14:35:00','2026-09-20 14:35:00','2026-09-20 14:40:00');

INSERT INTO analysis_task(task_type,task_name,status,input_json,created_at,started_at,completed_at)
VALUES('DISASTER','预置灾害事件·巫溪泥石流','SUCCESS',JSON_OBJECT('source','SYSTEM_SEED','eventType','DEBRIS_FLOW','occurredAt','2026-09-22 09:20','regionCode','500238','regionName','巫溪县','probability',67),
       '2026-09-22 09:20:00','2026-09-22 09:20:00','2026-09-22 09:26:00');

INSERT INTO analysis_task(task_type,task_name,status,input_json,created_at,started_at,completed_at)
VALUES('DISASTER','预置灾害事件·奉节地震','SUCCESS',JSON_OBJECT('source','SYSTEM_SEED','eventType','EARTHQUAKE','occurredAt','2026-09-24 06:48','regionCode','500236','regionName','奉节县','magnitude',3.8),
       '2026-09-24 06:48:00','2026-09-24 06:48:00','2026-09-24 06:54:00');

INSERT INTO analysis_task(task_type,task_name,status,input_json,created_at,started_at,completed_at)
VALUES('DISASTER','预置灾害事件·涪陵泥石流','SUCCESS',JSON_OBJECT('source','SYSTEM_SEED','eventType','DEBRIS_FLOW','occurredAt','2026-09-25 07:30','regionCode','500102','regionName','涪陵区','probability',54),
       '2026-09-25 07:30:00','2026-09-25 07:30:00','2026-09-25 07:38:00');
SET @damage_task=LAST_INSERT_ID();

INSERT INTO analysis_result(task_id,result_scope,target_type,target_key,sequence_no,status_code,score,result_json)
SELECT @damage_task,'ASSET','DISASTER_DAMAGE',CAST(x.id AS CHAR),x.id,
       CASE WHEN x.damage_probability<20 THEN 'DS0' WHEN x.damage_probability<40 THEN 'DS1'
            WHEN x.damage_probability<60 THEN 'DS2' WHEN x.damage_probability<80 THEN 'DS3' ELSE 'DS4' END,
       x.damage_probability,
       JSON_OBJECT('assetId',x.id,'damageProbability',x.damage_probability,'damageLevel',
         CASE WHEN x.damage_probability<20 THEN 'DS0' WHEN x.damage_probability<40 THEN 'DS1'
              WHEN x.damage_probability<60 THEN 'DS2' WHEN x.damage_probability<80 THEN 'DS3' ELSE 'DS4' END)
FROM (
  SELECT a.id,CASE MOD(a.id,8) WHEN 1 THEN 12 WHEN 2 THEN 27 WHEN 3 THEN 43 WHEN 4 THEN 58
         WHEN 5 THEN 66 WHEN 6 THEN 74 WHEN 7 THEN 83 ELSE 36 END damage_probability
  FROM transport_asset a
) x;

INSERT INTO analysis_result(task_id,result_scope,result_json)
SELECT t.id,'SUMMARY',
       JSON_OBJECT('eventType',JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.eventType')),
                   'occurredAt',JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.occurredAt')),
                   'regionName',JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.regionName')),
                   'affectedAssetCount',(SELECT COUNT(*) FROM analysis_result r
                                         WHERE r.task_id=t.id AND r.target_type='DISASTER_DAMAGE'))
FROM analysis_task t
WHERE t.task_type='DISASTER' AND JSON_UNQUOTE(JSON_EXTRACT(t.input_json,'$.source'))='SYSTEM_SEED';

INSERT INTO analysis_task(task_type,task_name,status,input_json,created_at,started_at,completed_at)
VALUES('RESILIENCE','预置重庆市区域韧性评估','SUCCESS',JSON_OBJECT('source','SYSTEM_SEED','disasterTaskId',@damage_task),
       '2026-09-25 08:00:00','2026-09-25 08:00:00','2026-09-25 08:08:00');
SET @resilience_task=LAST_INSERT_ID();

INSERT INTO analysis_result(task_id,result_scope,target_type,target_key,sequence_no,status_code,score,result_json)
SELECT @resilience_task,'REGION','RESILIENCE',r.region_code,ROW_NUMBER() OVER(ORDER BY r.region_code),'PUBLISHED',
       58+MOD(CRC32(r.region_code),38),
       JSON_OBJECT('resilienceIndex',58+MOD(CRC32(r.region_code),38),
                   'connectivityScore',54+MOD(CRC32(CONCAT(r.region_code,'C')),43),
                   'recoveryCapacity',56+MOD(CRC32(CONCAT(r.region_code,'R')),40))
FROM region r;

INSERT INTO analysis_result(task_id,result_scope,target_type,target_key,status_code,score,result_json)
SELECT @resilience_task,'REGION','RESILIENCE','CHONGQING','PUBLISHED',ROUND(AVG(score),1),
       JSON_OBJECT('resilienceIndex',ROUND(AVG(score),1),
                   'connectivityScore',ROUND(AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(result_json,'$.connectivityScore')) AS DECIMAL(10,2))),1),
                   'recoveryCapacity',ROUND(AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(result_json,'$.recoveryCapacity')) AS DECIMAL(10,2))),1))
FROM analysis_result WHERE task_id=@resilience_task AND target_type='RESILIENCE' AND target_key<>'CHONGQING';

INSERT INTO analysis_result(task_id,result_scope,result_json)
SELECT @resilience_task,'SUMMARY',
       JSON_OBJECT('regionCount',(SELECT COUNT(*) FROM analysis_result r
                                  WHERE r.task_id=@resilience_task AND r.target_type='RESILIENCE' AND r.target_key<>'CHONGQING'),
                   'resilienceIndex',score,
                   'connectivityScore',JSON_EXTRACT(result_json,'$.connectivityScore'),
                   'recoveryCapacity',JSON_EXTRACT(result_json,'$.recoveryCapacity'))
FROM analysis_result
WHERE task_id=@resilience_task AND target_type='RESILIENCE' AND target_key='CHONGQING'
LIMIT 1;

COMMIT;
