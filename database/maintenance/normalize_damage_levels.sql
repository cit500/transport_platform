-- 将旧版中文受损等级按受损概率映射为 DS0-DS4；不替换任务或逐项结果。
-- 执行前建议备份 analysis_task / analysis_result。
SET NAMES utf8mb4;
START TRANSACTION;

UPDATE analysis_result ar
JOIN analysis_task t ON t.id=ar.task_id
SET ar.status_code=CASE WHEN ar.score<20 THEN 'DS0' WHEN ar.score<40 THEN 'DS1'
                        WHEN ar.score<60 THEN 'DS2' WHEN ar.score<80 THEN 'DS3' ELSE 'DS4' END,
    ar.result_json=JSON_SET(ar.result_json,'$.damageLevel',
        CASE WHEN ar.score<20 THEN 'DS0' WHEN ar.score<40 THEN 'DS1'
             WHEN ar.score<60 THEN 'DS2' WHEN ar.score<80 THEN 'DS3' ELSE 'DS4' END)
WHERE ar.result_scope='ASSET' AND ar.target_type='DISASTER_DAMAGE'
  AND t.task_type='DISASTER' AND ar.score BETWEEN 0 AND 100
  AND ar.status_code IN ('极低','低','中','高','极高');

COMMIT;
