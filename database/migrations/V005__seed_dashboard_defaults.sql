-- 首页完整默认数据，可重复执行。

USE transport_resilience_v2;

INSERT INTO vehicle_profile (
    id, profile_name, gross_weight_ton, vehicle_length_m, vehicle_width_m,
    vehicle_height_m, axle_count, axle_loads_json, axle_spacings_json,
    planned_speed_kmh, minimum_turning_radius_m, is_default
)
VALUES (
    1, '默认100吨重型运输车', 100.00, 18.00, 3.20,
    4.50, 6, JSON_ARRAY(12, 16, 18, 18, 18, 18), JSON_ARRAY(3.2, 1.5, 1.5, 1.5, 1.5),
    30, 15.00, TRUE
)
ON DUPLICATE KEY UPDATE
    gross_weight_ton = VALUES(gross_weight_ton),
    vehicle_length_m = VALUES(vehicle_length_m),
    vehicle_width_m = VALUES(vehicle_width_m),
    vehicle_height_m = VALUES(vehicle_height_m),
    axle_count = VALUES(axle_count),
    axle_loads_json = VALUES(axle_loads_json),
    axle_spacings_json = VALUES(axle_spacings_json),
    planned_speed_kmh = VALUES(planned_speed_kmh),
    is_default = TRUE;

INSERT INTO evaluation_task (
    task_code, task_name, module_type, status, algorithm_mode, algorithm_version,
    vehicle_profile_id, input_snapshot_json, created_at, started_at, completed_at, created_by
)
VALUES
(
    'HEAVY-DEFAULT-100T', '首页默认100吨重车通行评估', 'HEAVY_PASSAGE', 'SUCCESS', 'PRESET', 'preset-v1',
    1,
    JSON_OBJECT('profileName','默认100吨重型运输车','grossWeightTon',100,'vehicleLengthM',18,'vehicleWidthM',3.2,'vehicleHeightM',4.5,'axleCount',6,'plannedSpeedKmh',30),
    '2026-08-15 09:00:00', '2026-08-15 09:00:00', '2026-08-15 09:00:02', 'system'
),
(
    'DASHBOARD-DEFAULT-2026', '首页区域综合指标默认快照', 'DASHBOARD', 'SUCCESS', 'PRESET', 'preset-v1',
    NULL,
    JSON_OBJECT('description','用于首页风险、韧性和通行等级的完整预设快照','regionCount',37),
    '2026-08-15 09:00:00', '2026-08-15 09:00:00', '2026-08-15 09:00:02', 'system'
)
ON DUPLICATE KEY UPDATE
    task_name = VALUES(task_name),
    status = 'SUCCESS',
    algorithm_mode = VALUES(algorithm_mode),
    algorithm_version = VALUES(algorithm_version),
    vehicle_profile_id = VALUES(vehicle_profile_id),
    input_snapshot_json = VALUES(input_snapshot_json),
    completed_at = VALUES(completed_at);

INSERT INTO heavy_passage_result (
    task_id, asset_id, structural_failure_probability, load_utilization_ratio,
    clearance_check_result, passability_status, restriction_reason,
    recommended_speed_kmh, recommended_action, result_details_json
)
SELECT
    t.id,
    a.id,
    CASE a.asset_code
        WHEN 'BRIDGE-CQ-004' THEN 0.18000
        WHEN 'BRIDGE-CQ-002' THEN 0.07500
        WHEN 'TUNNEL-CQ-002' THEN 0.03000
        ELSE 0.01500
    END,
    CASE a.asset_code
        WHEN 'BRIDGE-CQ-004' THEN 1.12000
        WHEN 'BRIDGE-CQ-002' THEN 0.92000
        WHEN 'TUNNEL-CQ-002' THEN 0.76000
        ELSE 0.68000
    END,
    CASE WHEN a.asset_code = 'TUNNEL-CQ-002' THEN 'LIMITED' ELSE 'PASS' END,
    CASE a.asset_code
        WHEN 'BRIDGE-CQ-004' THEN 'BLOCKED'
        WHEN 'BRIDGE-CQ-002' THEN 'CONDITIONAL'
        WHEN 'TUNNEL-CQ-002' THEN 'CONDITIONAL'
        ELSE 'PASS'
    END,
    CASE a.asset_code
        WHEN 'BRIDGE-CQ-004' THEN '车辆总重超过当前预设安全通行阈值'
        WHEN 'BRIDGE-CQ-002' THEN '荷载利用率偏高，需限速并复核轴载'
        WHEN 'TUNNEL-CQ-002' THEN '车辆高度接近隧道净空限制'
        ELSE '结构承载与净空指标满足预设要求'
    END,
    CASE
        WHEN a.asset_code = 'BRIDGE-CQ-004' THEN NULL
        WHEN a.asset_code IN ('BRIDGE-CQ-002','TUNNEL-CQ-002') THEN 15
        ELSE 30
    END,
    CASE a.asset_code
        WHEN 'BRIDGE-CQ-004' THEN '建议绕行或调整车辆编组'
        WHEN 'BRIDGE-CQ-002' THEN '限速15km/h，单车居中通行'
        WHEN 'TUNNEL-CQ-002' THEN '复核实际车高并安排引导通行'
        ELSE '按默认方案通行'
    END,
    JSON_OBJECT('dataType','preset','vehicleWeightTon',100)
FROM evaluation_task t
CROSS JOIN transport_asset a
WHERE t.task_code = 'HEAVY-DEFAULT-100T'
ON DUPLICATE KEY UPDATE
    structural_failure_probability = VALUES(structural_failure_probability),
    load_utilization_ratio = VALUES(load_utilization_ratio),
    clearance_check_result = VALUES(clearance_check_result),
    passability_status = VALUES(passability_status),
    restriction_reason = VALUES(restriction_reason),
    recommended_speed_kmh = VALUES(recommended_speed_kmh),
    recommended_action = VALUES(recommended_action),
    result_details_json = VALUES(result_details_json);

INSERT INTO region_assessment_result (
    task_id, region_code, dominant_hazard, risk_score, risk_level,
    resilience_score, resilience_level, passability_score, passability_level,
    connectivity, network_efficiency, accessibility, redundancy, robustness,
    recovery_capacity, guarantee_rate
)
SELECT
    t.id,
    x.region_code,
    CASE MOD(CRC32(x.region_code), 4)
        WHEN 0 THEN '滑坡'
        WHEN 1 THEN '泥石流'
        WHEN 2 THEN '地震'
        ELSE '崩塌'
    END,
    x.risk_score,
    CASE
        WHEN x.risk_score < 50 THEN '低风险'
        WHEN x.risk_score < 65 THEN '中风险'
        WHEN x.risk_score < 80 THEN '高风险'
        ELSE '极高风险'
    END,
    x.resilience_score,
    CASE
        WHEN x.resilience_score >= 86 THEN '高韧性'
        WHEN x.resilience_score >= 76 THEN '较高韧性'
        WHEN x.resilience_score >= 66 THEN '中等韧性'
        ELSE '低韧性'
    END,
    x.passability_score,
    CASE
        WHEN x.passability_score >= 88 THEN '畅通'
        WHEN x.passability_score >= 76 THEN '条件通行'
        WHEN x.passability_score >= 64 THEN '受限'
        ELSE '阻断'
    END,
    ROUND(x.resilience_score / 100, 4),
    LEAST(96, x.resilience_score + MOD(CRC32(CONCAT(x.region_code,'E')), 8)),
    LEAST(97, x.resilience_score + MOD(CRC32(CONCAT(x.region_code,'A')), 10)),
    GREATEST(52, x.resilience_score - MOD(CRC32(CONCAT(x.region_code,'D')), 16)),
    LEAST(95, x.resilience_score + MOD(CRC32(CONCAT(x.region_code,'B')), 7)),
    GREATEST(55, x.resilience_score - MOD(CRC32(CONCAT(x.region_code,'R')), 12)),
    x.passability_score
FROM evaluation_task t
CROSS JOIN (
    SELECT
        region_code,
        38 + MOD(CRC32(CONCAT(region_code,'risk')), 52) AS risk_score,
        62 + MOD(CRC32(CONCAT(region_code,'resilience')), 32) AS resilience_score,
        60 + MOD(CRC32(CONCAT(region_code,'passability')), 38) AS passability_score
    FROM region
) x
WHERE t.task_code = 'DASHBOARD-DEFAULT-2026'
ON DUPLICATE KEY UPDATE
    dominant_hazard = VALUES(dominant_hazard),
    risk_score = VALUES(risk_score),
    risk_level = VALUES(risk_level),
    resilience_score = VALUES(resilience_score),
    resilience_level = VALUES(resilience_level),
    passability_score = VALUES(passability_score),
    passability_level = VALUES(passability_level),
    connectivity = VALUES(connectivity),
    network_efficiency = VALUES(network_efficiency),
    accessibility = VALUES(accessibility),
    redundancy = VALUES(redundancy),
    robustness = VALUES(robustness),
    recovery_capacity = VALUES(recovery_capacity),
    guarantee_rate = VALUES(guarantee_rate);

INSERT INTO dashboard_publication (module_code, published_task_id, published_at)
SELECT 'HEAVY_PASSAGE', id, '2026-08-15 09:00:02'
FROM evaluation_task WHERE task_code = 'HEAVY-DEFAULT-100T'
ON DUPLICATE KEY UPDATE published_task_id = VALUES(published_task_id), published_at = VALUES(published_at);

INSERT INTO dashboard_publication (module_code, published_task_id, published_at)
SELECT 'REGION_ASSESSMENT', id, '2026-08-15 09:00:02'
FROM evaluation_task WHERE task_code = 'DASHBOARD-DEFAULT-2026'
ON DUPLICATE KEY UPDATE published_task_id = VALUES(published_task_id), published_at = VALUES(published_at);

INSERT INTO hazard_notice (id, event_time, region_code, hazard_type, warning_level, content)
VALUES
    (1, '2026-08-15 08:42:00', '500243', '滑坡',   'ORANGE', '彭水县局部边坡出现滑坡风险，请关注沿线道路通行状态'),
    (2, '2026-08-15 07:18:00', '500156', '泥石流', 'YELLOW', '武隆区持续降雨，部分沟谷泥石流风险升高'),
    (3, '2026-08-14 22:35:00', '500236', '崩塌',   'YELLOW', '奉节县山区道路发现小型崩塌隐患'),
    (4, '2026-08-14 19:06:00', '500240', '滑坡',   'BLUE',   '石柱县地质灾害巡查发现边坡变形迹象'),
    (5, '2026-08-14 16:20:00', '500101', '地震',   'BLUE',   '万州区记录到轻微地震动，路网运行正常'),
    (6, '2026-08-14 13:15:00', '500119', '泥石流', 'BLUE',   '南川区局部强降雨，建议加强沟谷巡查')
ON DUPLICATE KEY UPDATE
    event_time = VALUES(event_time),
    region_code = VALUES(region_code),
    hazard_type = VALUES(hazard_type),
    warning_level = VALUES(warning_level),
    content = VALUES(content);

INSERT INTO assistant_qa (question_code, question_text, answer_text, display_order)
VALUES
    ('platform', '平台有哪些功能？', '平台集中展示路网、桥梁、隧道和行政区信息，并提供重车通行、灾害风险与路网韧性评价入口。', 1),
    ('map', '地图颜色代表什么？', '地图默认展示灾害风险等级，也可以切换为韧性等级和通行等级；每种颜色对应右下角图例中的等级。', 2),
    ('heavy', '如何进行重车评估？', '进入重车通行评估模块，选择或填写车辆参数，再指定起点和终点，即可评价沿线桥隧并规划保通路径。', 3)
ON DUPLICATE KEY UPDATE
    question_text = VALUES(question_text),
    answer_text = VALUES(answer_text),
    display_order = VALUES(display_order);
