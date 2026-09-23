CREATE TABLE IF NOT EXISTS resilience_od_profile (
    id BIGINT NOT NULL AUTO_INCREMENT,
    profile_name VARCHAR(120) NOT NULL,
    profile_type VARCHAR(30) NOT NULL DEFAULT 'DAILY',
    description VARCHAR(400) NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uk_resilience_od_profile_name (profile_name)
) ENGINE=InnoDB COMMENT='路网韧性评价可复用OD需求方案';

CREATE TABLE IF NOT EXISTS resilience_od_demand (
    id BIGINT NOT NULL AUTO_INCREMENT,
    profile_id BIGINT NOT NULL,
    origin_node_id BIGINT NOT NULL,
    destination_node_id BIGINT NOT NULL,
    demand_veh_h DECIMAL(12,2) NOT NULL,
    is_priority BOOLEAN NOT NULL DEFAULT FALSE,
    description VARCHAR(240) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_resilience_od_pair (profile_id,origin_node_id,destination_node_id),
    CONSTRAINT fk_resilience_od_profile FOREIGN KEY (profile_id) REFERENCES resilience_od_profile(id) ON DELETE CASCADE,
    CONSTRAINT fk_resilience_od_origin FOREIGN KEY (origin_node_id) REFERENCES road_node(id),
    CONSTRAINT fk_resilience_od_destination FOREIGN KEY (destination_node_id) REFERENCES road_node(id),
    CONSTRAINT ck_resilience_od_demand CHECK (demand_veh_h > 0)
) ENGINE=InnoDB COMMENT='OD交通需求';

CREATE TABLE IF NOT EXISTS resilience_recovery_plan (
    id BIGINT NOT NULL AUTO_INCREMENT,
    plan_name VARCHAR(120) NOT NULL,
    description VARCHAR(400) NULL,
    time_unit VARCHAR(20) NOT NULL DEFAULT 'HOUR',
    target_accessibility DECIMAL(6,4) NOT NULL DEFAULT 0.9900,
    target_travel_time_ratio DECIMAL(6,3) NOT NULL DEFAULT 1.050,
    time_points_json JSON NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uk_resilience_recovery_plan_name (plan_name)
) ENGINE=InnoDB COMMENT='道路抢通和恢复时间方案';

CREATE TABLE IF NOT EXISTS resilience_task_result (
    task_id BIGINT NOT NULL,
    source_disaster_task_id BIGINT NULL,
    od_profile_id BIGINT NOT NULL,
    recovery_plan_id BIGINT NOT NULL,
    baseline_total_travel_time DECIMAL(18,3) NOT NULL,
    post_total_travel_time DECIMAL(18,3) NOT NULL,
    accessibility_rate DECIMAL(7,4) NOT NULL,
    efficiency_rate DECIMAL(7,4) NOT NULL,
    function_retention_rate DECIMAL(7,4) NOT NULL,
    recovery_time_h DECIMAL(10,2) NULL,
    resilience_score DECIMAL(6,2) NOT NULL,
    resilience_level VARCHAR(20) NOT NULL,
    isolated_node_count INT NOT NULL DEFAULT 0,
    unreachable_od_count INT NOT NULL DEFAULT 0,
    blocked_road_count INT NOT NULL DEFAULT 0,
    reduced_road_count INT NOT NULL DEFAULT 0,
    affected_road_length_km DECIMAL(14,2) NOT NULL DEFAULT 0,
    summary_json JSON NULL,
    PRIMARY KEY (task_id),
    CONSTRAINT fk_resilience_task FOREIGN KEY (task_id) REFERENCES evaluation_task(id) ON DELETE CASCADE,
    CONSTRAINT fk_resilience_disaster_task FOREIGN KEY (source_disaster_task_id) REFERENCES evaluation_task(id),
    CONSTRAINT fk_resilience_result_od FOREIGN KEY (od_profile_id) REFERENCES resilience_od_profile(id),
    CONSTRAINT fk_resilience_result_plan FOREIGN KEY (recovery_plan_id) REFERENCES resilience_recovery_plan(id)
) ENGINE=InnoDB COMMENT='路网韧性评价总体结果';

CREATE TABLE IF NOT EXISTS resilience_road_result (
    task_id BIGINT NOT NULL,
    road_edge_id BIGINT NOT NULL,
    remaining_capacity_ratio DECIMAL(7,4) NOT NULL,
    baseline_capacity_veh_h DECIMAL(12,2) NOT NULL,
    post_capacity_veh_h DECIMAL(12,2) NOT NULL,
    baseline_flow_veh_h DECIMAL(12,2) NOT NULL,
    post_flow_veh_h DECIMAL(12,2) NOT NULL,
    baseline_travel_time_min DECIMAL(12,4) NOT NULL,
    post_travel_time_min DECIMAL(12,4) NULL,
    volume_capacity_ratio DECIMAL(8,4) NULL,
    road_status VARCHAR(20) NOT NULL,
    criticality_score DECIMAL(7,2) NOT NULL DEFAULT 0,
    recommended_action VARCHAR(300) NULL,
    PRIMARY KEY (task_id,road_edge_id),
    KEY idx_resilience_road_edge (road_edge_id),
    CONSTRAINT fk_resilience_road_task FOREIGN KEY (task_id) REFERENCES evaluation_task(id) ON DELETE CASCADE,
    CONSTRAINT fk_resilience_road_edge FOREIGN KEY (road_edge_id) REFERENCES road_edge(id)
) ENGINE=InnoDB COMMENT='韧性任务逐道路运行结果';

CREATE TABLE IF NOT EXISTS resilience_od_result (
    task_id BIGINT NOT NULL,
    od_demand_id BIGINT NOT NULL,
    reachable BOOLEAN NOT NULL,
    demand_veh_h DECIMAL(12,2) NOT NULL,
    baseline_travel_time_min DECIMAL(12,3) NULL,
    post_travel_time_min DECIMAL(12,3) NULL,
    detour_ratio DECIMAL(8,4) NULL,
    PRIMARY KEY (task_id,od_demand_id),
    CONSTRAINT fk_resilience_od_task FOREIGN KEY (task_id) REFERENCES evaluation_task(id) ON DELETE CASCADE,
    CONSTRAINT fk_resilience_od_demand FOREIGN KEY (od_demand_id) REFERENCES resilience_od_demand(id)
) ENGINE=InnoDB COMMENT='韧性任务逐OD可达性和效率结果';

CREATE TABLE IF NOT EXISTS resilience_timeline_result (
    task_id BIGINT NOT NULL,
    time_h DECIMAL(10,2) NOT NULL,
    accessibility_rate DECIMAL(7,4) NOT NULL,
    efficiency_rate DECIMAL(7,4) NOT NULL,
    function_retention_rate DECIMAL(7,4) NOT NULL,
    travel_time_ratio DECIMAL(8,4) NOT NULL,
    isolated_node_count INT NOT NULL DEFAULT 0,
    unreachable_od_count INT NOT NULL DEFAULT 0,
    blocked_road_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id,time_h),
    CONSTRAINT fk_resilience_timeline_task FOREIGN KEY (task_id) REFERENCES evaluation_task(id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='恢复过程各时间节点结果';

INSERT INTO resilience_od_profile(profile_name,profile_type,description,is_default)
SELECT '默认日常交通OD方案','DAILY','根据当前高速和快速路网自动生成的演示OD需求',TRUE
WHERE NOT EXISTS (SELECT 1 FROM resilience_od_profile);

INSERT INTO resilience_recovery_plan(plan_name,description,time_unit,target_accessibility,target_travel_time_ratio,time_points_json,is_default)
SELECT '72小时分阶段抢通方案','0—72小时逐步恢复道路通行能力','HOUR',0.9900,1.050,
       JSON_ARRAY(0,6,12,24,48,72),TRUE
WHERE NOT EXISTS (SELECT 1 FROM resilience_recovery_plan);
