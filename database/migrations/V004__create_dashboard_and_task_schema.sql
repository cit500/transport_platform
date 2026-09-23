-- 第二阶段：首页展示、默认参数和评估任务历史

USE transport_resilience_v2;

CREATE TABLE IF NOT EXISTS vehicle_profile (
    id                       BIGINT        NOT NULL AUTO_INCREMENT,
    profile_name             VARCHAR(100)  NOT NULL,
    gross_weight_ton         DECIMAL(10,2) NOT NULL,
    vehicle_length_m         DECIMAL(8,2)  NOT NULL,
    vehicle_width_m          DECIMAL(8,2)  NOT NULL,
    vehicle_height_m         DECIMAL(8,2)  NOT NULL,
    axle_count               SMALLINT      NOT NULL,
    axle_loads_json          JSON          NULL,
    axle_spacings_json       JSON          NULL,
    planned_speed_kmh        SMALLINT      NULL,
    minimum_turning_radius_m DECIMAL(8,2)  NULL,
    is_default               BOOLEAN       NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_profile_name (profile_name),
    CONSTRAINT ck_vehicle_weight CHECK (gross_weight_ton > 0),
    CONSTRAINT ck_vehicle_size CHECK (vehicle_length_m > 0 AND vehicle_width_m > 0 AND vehicle_height_m > 0),
    CONSTRAINT ck_vehicle_axles CHECK (axle_count > 0)
) ENGINE=InnoDB COMMENT='可复用的重车参数方案';

CREATE TABLE IF NOT EXISTS evaluation_task (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    task_code           VARCHAR(64)  NOT NULL,
    task_name           VARCHAR(150) NOT NULL,
    module_type         VARCHAR(30)  NOT NULL COMMENT 'HEAVY_PASSAGE、EARTHQUAKE、DEBRIS_FLOW、RESILIENCE、DASHBOARD',
    status              VARCHAR(20)  NOT NULL COMMENT 'PENDING、RUNNING、SUCCESS、FAILED、PENDING_DATA',
    algorithm_mode      VARCHAR(20)  NOT NULL COMMENT 'PRESET、RULE、EXTERNAL',
    algorithm_version   VARCHAR(40)  NULL,
    vehicle_profile_id  BIGINT       NULL,
    input_snapshot_json JSON         NOT NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at          DATETIME     NULL,
    completed_at        DATETIME     NULL,
    created_by          VARCHAR(50)  NOT NULL DEFAULT 'system',
    error_message       VARCHAR(500) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_evaluation_task_code (task_code),
    KEY idx_evaluation_task_module_time (module_type, created_at),
    CONSTRAINT fk_task_vehicle_profile FOREIGN KEY (vehicle_profile_id) REFERENCES vehicle_profile (id),
    CONSTRAINT ck_task_status CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'PENDING_DATA')),
    CONSTRAINT ck_task_algorithm_mode CHECK (algorithm_mode IN ('PRESET', 'RULE', 'EXTERNAL'))
) ENGINE=InnoDB COMMENT='每次评价的任务、输入快照和执行日志';

CREATE TABLE IF NOT EXISTS heavy_passage_result (
    task_id                        BIGINT        NOT NULL,
    asset_id                       BIGINT        NOT NULL,
    structural_failure_probability DECIMAL(8,5) NULL,
    load_utilization_ratio         DECIMAL(8,5) NULL,
    clearance_check_result         VARCHAR(20)  NULL,
    passability_status             VARCHAR(20)  NOT NULL COMMENT 'PASS、CONDITIONAL、BLOCKED',
    restriction_reason             VARCHAR(300) NULL,
    recommended_speed_kmh          SMALLINT      NULL,
    recommended_action             VARCHAR(300) NULL,
    result_details_json            JSON          NULL,
    PRIMARY KEY (task_id, asset_id),
    KEY idx_heavy_result_asset (asset_id),
    CONSTRAINT fk_heavy_result_task FOREIGN KEY (task_id) REFERENCES evaluation_task (id) ON DELETE CASCADE,
    CONSTRAINT fk_heavy_result_asset FOREIGN KEY (asset_id) REFERENCES transport_asset (id),
    CONSTRAINT ck_heavy_passability CHECK (passability_status IN ('PASS', 'CONDITIONAL', 'BLOCKED'))
) ENGINE=InnoDB COMMENT='桥隧重车通行评价结果';

CREATE TABLE IF NOT EXISTS region_assessment_result (
    task_id                    BIGINT        NOT NULL,
    region_code                VARCHAR(20)   NOT NULL,
    dominant_hazard            VARCHAR(40)   NOT NULL,
    risk_score                 DECIMAL(6,2)  NOT NULL,
    risk_level                 VARCHAR(20)   NOT NULL,
    resilience_score           DECIMAL(6,2)  NOT NULL,
    resilience_level           VARCHAR(20)   NOT NULL,
    passability_score          DECIMAL(6,2)  NOT NULL,
    passability_level          VARCHAR(20)   NOT NULL,
    connectivity               DECIMAL(7,4)  NOT NULL,
    network_efficiency         DECIMAL(6,2)  NOT NULL,
    accessibility              DECIMAL(6,2)  NOT NULL,
    redundancy                 DECIMAL(6,2)  NOT NULL,
    robustness                 DECIMAL(6,2)  NOT NULL,
    recovery_capacity          DECIMAL(6,2)  NOT NULL,
    guarantee_rate             DECIMAL(6,2)  NOT NULL,
    PRIMARY KEY (task_id, region_code),
    KEY idx_region_assessment_region (region_code),
    CONSTRAINT fk_region_result_task FOREIGN KEY (task_id) REFERENCES evaluation_task (id) ON DELETE CASCADE,
    CONSTRAINT fk_region_result_region FOREIGN KEY (region_code) REFERENCES region (region_code)
) ENGINE=InnoDB COMMENT='首页地图和区域风险、韧性、通行等级快照';

CREATE TABLE IF NOT EXISTS dashboard_publication (
    module_code      VARCHAR(30) NOT NULL,
    published_task_id BIGINT      NOT NULL,
    published_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (module_code),
    CONSTRAINT fk_dashboard_publication_task FOREIGN KEY (published_task_id) REFERENCES evaluation_task (id)
) ENGINE=InnoDB COMMENT='首页各模块当前采用的已发布任务';

CREATE TABLE IF NOT EXISTS hazard_notice (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    event_time   DATETIME     NOT NULL,
    region_code  VARCHAR(20)  NOT NULL,
    hazard_type  VARCHAR(30)  NOT NULL,
    warning_level VARCHAR(20) NOT NULL,
    content      VARCHAR(300) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_hazard_notice_time (event_time),
    CONSTRAINT fk_hazard_notice_region FOREIGN KEY (region_code) REFERENCES region (region_code)
) ENGINE=InnoDB COMMENT='首页地质灾害滚动信息';

CREATE TABLE IF NOT EXISTS assistant_qa (
    question_code VARCHAR(30)  NOT NULL,
    question_text VARCHAR(100) NOT NULL,
    answer_text   VARCHAR(600) NOT NULL,
    display_order SMALLINT     NOT NULL,
    PRIMARY KEY (question_code),
    UNIQUE KEY uk_assistant_order (display_order)
) ENGINE=InnoDB COMMENT='静态数字人预设问答';
