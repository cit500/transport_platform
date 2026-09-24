-- 将运行时路网收敛为独立的本地数据模型。
-- OSM 编码只参与过首次迁移，不再保留在正式业务表中；本地 id 必须稳定且不可重排。

USE transport_resilience_v2;

SET @drop_node_code = IF(
    EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'road_node' AND column_name = 'node_code'
    ),
    'ALTER TABLE road_node DROP COLUMN node_code',
    'DO 0'
);
PREPARE stmt FROM @drop_node_code;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_edge_code = IF(
    EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'road_edge' AND column_name = 'edge_code'
    ),
    'ALTER TABLE road_edge DROP COLUMN edge_code',
    'DO 0'
);
PREPARE stmt FROM @drop_edge_code;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE road_node
    COMMENT = '本地路网节点；id为稳定主键，street_count为脚本刷新得到的无向连接度';

ALTER TABLE road_edge
    COMMENT = '本地路网有向边；from/to、geom为固定拓扑，region_code和length_m为可刷新派生属性';

-- 灾害和韧性结果仍分别保存完整历史。本视图只提供统一的按任务、按道路查询入口，
-- 不把动态结果回写到静态 road_edge，也不复制结果数据。
CREATE OR REPLACE VIEW v_road_edge_task_state AS
SELECT
    r.road_edge_id,
    r.task_id,
    t.module_type,
    'DISASTER' AS result_type,
    t.completed_at,
    r.passability_status,
    CASE r.passability_status
        WHEN 'BLOCKED' THEN 0.0000
        WHEN 'CONDITIONAL' THEN 0.5000
        ELSE 1.0000
    END AS remaining_capacity_ratio,
    r.impact_score AS hazard_impact_score,
    r.risk_level AS hazard_risk_level,
    CAST(NULL AS DECIMAL(7,2)) AS resilience_criticality_score
FROM disaster_road_result r
JOIN evaluation_task t ON t.id = r.task_id
WHERE t.status = 'SUCCESS'

UNION ALL

SELECT
    r.road_edge_id,
    r.task_id,
    t.module_type,
    'RESILIENCE' AS result_type,
    t.completed_at,
    CASE r.road_status
        WHEN 'BLOCKED' THEN 'BLOCKED'
        WHEN 'REDUCED' THEN 'CONDITIONAL'
        ELSE 'PASS'
    END AS passability_status,
    r.remaining_capacity_ratio,
    CAST(NULL AS DECIMAL(7,4)) AS hazard_impact_score,
    CAST(NULL AS CHAR(20)) AS hazard_risk_level,
    r.criticality_score AS resilience_criticality_score
FROM resilience_road_result r
JOIN evaluation_task t ON t.id = r.task_id
WHERE t.status = 'SUCCESS';
