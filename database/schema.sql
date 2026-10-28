-- 交通平台最小数据库结构：7张基础数据表 + 2张通用分析表。

CREATE DATABASE IF NOT EXISTS transport_platform
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE transport_platform;

CREATE TABLE IF NOT EXISTS region (
    region_code       VARCHAR(20)  NOT NULL,
    region_name       VARCHAR(60)  NOT NULL,
    area_km2          DECIMAL(12,2) NULL COMMENT '由geom椭球面积一次性计算，单位km²',
    center_longitude  DECIMAL(10,7) NULL COMMENT '由geom平面质心一次性计算',
    center_latitude   DECIMAL(10,7) NULL COMMENT '由geom平面质心一次性计算',
    geom              GEOMETRY SRID 4326 NOT NULL,
    PRIMARY KEY (region_code),
    UNIQUE KEY uk_region_name (region_name),
    SPATIAL INDEX sp_region_geom (geom)
) ENGINE=InnoDB COMMENT='固定且业务只读的行政区基础数据';

CREATE TABLE IF NOT EXISTS road_node (
    id            BIGINT   NOT NULL,
    street_count  SMALLINT NULL COMMENT '忽略方向后的相邻节点数量，由维护脚本刷新',
    geom          POINT SRID 4326 NOT NULL,
    PRIMARY KEY (id),
    SPATIAL INDEX sp_road_node_geom (geom)
) ENGINE=InnoDB COMMENT='固定的本地路网节点';

CREATE TABLE IF NOT EXISTS road_edge (
    id                    BIGINT        NOT NULL,
    from_node_id          BIGINT        NOT NULL,
    to_node_id            BIGINT        NOT NULL,
    region_code           VARCHAR(20)   NOT NULL COMMENT '道路唯一统计行政区',
    road_name             VARCHAR(255)  NULL,
    road_ref              VARCHAR(100)  NULL,
    road_class            VARCHAR(50)   NOT NULL,
    one_way               BOOLEAN       NOT NULL DEFAULT FALSE,
    lane_count            SMALLINT      NULL,
    design_speed_kmh      SMALLINT      NULL,
    length_m              DECIMAL(14,3) NOT NULL,
    source_bridge_flag    BOOLEAN       NOT NULL DEFAULT FALSE,
    source_tunnel_flag    BOOLEAN       NOT NULL DEFAULT FALSE,
    geom                  LINESTRING SRID 4326 NOT NULL,
    PRIMARY KEY (id),
    KEY idx_road_edge_from (from_node_id),
    KEY idx_road_edge_to (to_node_id),
    KEY idx_road_edge_region (region_code),
    KEY idx_road_edge_ref (road_ref),
    SPATIAL INDEX sp_road_edge_geom (geom),
    CONSTRAINT fk_road_edge_from FOREIGN KEY (from_node_id) REFERENCES road_node (id),
    CONSTRAINT fk_road_edge_to FOREIGN KEY (to_node_id) REFERENCES road_node (id),
    CONSTRAINT fk_road_edge_region FOREIGN KEY (region_code) REFERENCES region (region_code),
    CONSTRAINT ck_road_edge_length CHECK (length_m > 0)
) ENGINE=InnoDB COMMENT='固定的本地有向路网边';

CREATE TABLE IF NOT EXISTS transport_asset (
    id                         BIGINT        NOT NULL AUTO_INCREMENT,
    asset_code                 VARCHAR(50)   NOT NULL,
    asset_name                 VARCHAR(200)  NOT NULL,
    asset_type                 VARCHAR(20)   NOT NULL COMMENT 'BRIDGE或TUNNEL',
    region_code                VARCHAR(20)   NULL,
    longitude                  DECIMAL(10,7) NULL,
    latitude                   DECIMAL(10,7) NULL,
    geom                       POINT SRID 4326 NULL,
    construction_year          SMALLINT      NULL,
    design_grade               VARCHAR(50)   NULL,
    design_speed_kmh           SMALLINT      NULL,
    baseline_condition_level   VARCHAR(30)   NULL,
    baseline_inspection_date   DATE          NULL,
    service_status             VARCHAR(20)   NOT NULL DEFAULT 'IN_SERVICE',
    PRIMARY KEY (id),
    UNIQUE KEY uk_transport_asset_code (asset_code),
    KEY idx_transport_asset_region (region_code),
    KEY idx_transport_asset_type (asset_type),
    CONSTRAINT fk_transport_asset_region FOREIGN KEY (region_code) REFERENCES region (region_code),
    CONSTRAINT ck_transport_asset_type CHECK (asset_type IN ('BRIDGE', 'TUNNEL')),
    CONSTRAINT ck_transport_asset_status CHECK (service_status IN ('IN_SERVICE', 'MAINTENANCE', 'CLOSED'))
) ENGINE=InnoDB COMMENT='桥梁和隧道公共信息';

CREATE TABLE IF NOT EXISTS bridge_detail (
    asset_id                     BIGINT        NOT NULL,
    bridge_type                  VARCHAR(50)   NULL,
    total_length_m               DECIMAL(12,2) NULL,
    deck_width_m                 DECIMAL(10,2) NULL,
    span_count                   SMALLINT      NULL,
    max_span_m                   DECIMAL(10,2) NULL,
    pier_count                   SMALLINT      NULL,
    representative_pier_height_m DECIMAL(10,2) NULL,
    pier_section_type            VARCHAR(30)   NULL,
    pier_section_width_m         DECIMAL(10,2) NULL,
    pier_section_height_m        DECIMAL(10,2) NULL,
    concrete_strength_mpa        DECIMAL(10,2) NULL,
    steel_strength_mpa           DECIMAL(10,2) NULL,
    reinforcement_ratio          DECIMAL(8,5)  NULL,
    bearing_type                 VARCHAR(30)   NULL,
    bearing_count                SMALLINT      NULL,
    bearing_stiffness_kn_m       DECIMAL(14,2) NULL,
    has_restrainer               BOOLEAN       NULL,
    design_load_grade            VARCHAR(50)   NULL,
    design_load_ton              DECIMAL(10,2) NULL,
    vertical_clearance_m         DECIMAL(8,2)  NULL,
    horizontal_clearance_m       DECIMAL(8,2)  NULL,
    PRIMARY KEY (asset_id),
    CONSTRAINT fk_bridge_detail_asset FOREIGN KEY (asset_id) REFERENCES transport_asset (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='桥梁专业详情';

CREATE TABLE IF NOT EXISTS tunnel_detail (
    asset_id                 BIGINT        NOT NULL,
    tunnel_type              VARCHAR(50)   NULL,
    total_length_m           DECIMAL(12,2) NULL,
    diameter_m               DECIMAL(8,2)  NULL,
    buried_depth_m           DECIMAL(10,2) NULL,
    section_type             VARCHAR(30)   NULL,
    lining_thickness_cm      DECIMAL(8,2)  NULL,
    concrete_strength_mpa    DECIMAL(10,2) NULL,
    steel_strength_mpa       DECIMAL(10,2) NULL,
    elastic_modulus_gpa      DECIMAL(10,2) NULL,
    surrounding_rock_grade   VARCHAR(20)   NULL,
    groundwater_level        VARCHAR(20)   NULL,
    site_category            VARCHAR(20)   NULL,
    vertical_clearance_m     DECIMAL(8,2)  NULL,
    horizontal_clearance_m   DECIMAL(8,2)  NULL,
    lane_count               SMALLINT      NULL,
    PRIMARY KEY (asset_id),
    CONSTRAINT fk_tunnel_detail_asset FOREIGN KEY (asset_id) REFERENCES transport_asset (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='隧道专业详情';

CREATE TABLE IF NOT EXISTS asset_road_relation (
    asset_id        BIGINT        NOT NULL,
    road_edge_id    BIGINT        NOT NULL,
    relation_type   VARCHAR(20)   NOT NULL DEFAULT 'PRIMARY',
    sequence_no     SMALLINT      NULL,
    direction       VARCHAR(20)   NULL,
    start_chainage  DECIMAL(12,3) NULL,
    end_chainage    DECIMAL(12,3) NULL,
    PRIMARY KEY (asset_id, road_edge_id),
    UNIQUE KEY uk_asset_road_edge (road_edge_id),
    CONSTRAINT fk_asset_road_asset FOREIGN KEY (asset_id) REFERENCES transport_asset (id) ON DELETE CASCADE,
    CONSTRAINT fk_asset_road_edge FOREIGN KEY (road_edge_id) REFERENCES road_edge (id),
    CONSTRAINT ck_asset_road_type CHECK (relation_type IN ('PRIMARY', 'ADJACENT'))
) ENGINE=InnoDB COMMENT='桥隧可绑定多边，每条道路边只能属于一个桥隧';

CREATE TABLE IF NOT EXISTS fragility_model (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    hazard_type    VARCHAR(20)  NOT NULL COMMENT 'EARTHQUAKE或DEBRIS_FLOW',
    asset_type     VARCHAR(20)  NOT NULL COMMENT 'BRIDGE或TUNNEL',
    asset_id       VARCHAR(80)  NOT NULL COMMENT '来源模型库中的资产标识，平台内不参与业务关联',
    platform_asset_id BIGINT    NULL COMMENT '绑定的平台设施 transport_asset.id；NULL 表示该资产类型的默认曲线',
    asset_name     VARCHAR(200) NOT NULL,
    model_id       VARCHAR(120) NOT NULL,
    model_version  VARCHAR(40)  NOT NULL,
    status         VARCHAR(30)  NOT NULL COMMENT 'PUBLISHED、RESEARCH_REFERENCE、UNREGISTERED_RESEARCH或PLATFORM_DEFAULT',
    evaluable      BOOLEAN      NOT NULL DEFAULT TRUE COMMENT 'false表示归档模型，禁止用于评估',
    published      BOOLEAN      NOT NULL DEFAULT FALSE,
    allow_research BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '未发布模型需界面显式授权后才可评估',
    im_type        VARCHAR(30)  NOT NULL COMMENT 'PGA、TARGET_INPUT_PGA或DEBRIS_INTENSITY',
    im_unit        VARCHAR(20)  NOT NULL DEFAULT 'g',
    valid_min      DOUBLE       NULL COMMENT '模型验证范围下限，超出即标记外推',
    valid_max      DOUBLE       NULL COMMENT '模型验证范围上限，超出即标记外推',
    theta_ds1      DOUBLE       NOT NULL COMMENT 'DS1中位值',
    theta_ds2      DOUBLE       NOT NULL,
    theta_ds3      DOUBLE       NOT NULL,
    theta_ds4      DOUBLE       NOT NULL,
    beta_ds1       DOUBLE       NOT NULL COMMENT 'DS1对数标准差',
    beta_ds2       DOUBLE       NOT NULL,
    beta_ds3       DOUBLE       NOT NULL,
    beta_ds4       DOUBLE       NOT NULL,
    source_label   VARCHAR(120) NULL COMMENT '冻结研究库来源或平台默认值标记',
    limitations    VARCHAR(1000) NULL COMMENT '模型适用边界，界面上随模型展示',
    PRIMARY KEY (id),
    UNIQUE KEY uk_fragility_model (hazard_type, asset_id, model_id, model_version),
    KEY idx_fragility_lookup (hazard_type, asset_type, evaluable),
    KEY idx_fragility_platform_asset (platform_asset_id),
    CONSTRAINT ck_fragility_hazard CHECK (hazard_type IN ('EARTHQUAKE', 'DEBRIS_FLOW')),
    CONSTRAINT ck_fragility_asset CHECK (asset_type IN ('BRIDGE', 'TUNNEL')),
    CONSTRAINT ck_fragility_im CHECK (im_type IN ('PGA', 'TARGET_INPUT_PGA', 'DEBRIS_INTENSITY'))
) ENGINE=InnoDB COMMENT='易损性模型；地震参数来自冻结研究库，泥石流为待标定的平台默认参数';

CREATE TABLE IF NOT EXISTS analysis_task (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    task_type      VARCHAR(20)  NOT NULL COMMENT 'HEAVY、DISASTER、RESILIENCE或OTHER',
    task_name      VARCHAR(150) NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    input_json     JSON         NOT NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at     DATETIME     NULL,
    completed_at   DATETIME     NULL,
    error_message  VARCHAR(500) NULL,
    PRIMARY KEY (id),
    KEY idx_analysis_task_type_time (task_type, created_at),
    CONSTRAINT ck_analysis_task_type CHECK (task_type IN ('HEAVY', 'DISASTER', 'RESILIENCE', 'OTHER')),
    CONSTRAINT ck_analysis_task_status CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED'))
) ENGINE=InnoDB COMMENT='通用分析任务及输入快照';

CREATE TABLE IF NOT EXISTS analysis_result (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    task_id       BIGINT       NOT NULL,
    result_scope  VARCHAR(20)  NOT NULL COMMENT 'SUMMARY、REGION、ROAD、ASSET、ROUTE或TIMELINE',
    target_type   VARCHAR(20)  NULL,
    target_key    VARCHAR(64)  NULL,
    sequence_no   INT          NULL,
    status_code   VARCHAR(30)  NULL,
    score         DECIMAL(10,4) NULL,
    result_json   JSON         NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_analysis_result_task (task_id, result_scope, sequence_no),
    KEY idx_analysis_result_target (target_type, target_key),
    CONSTRAINT fk_analysis_result_task FOREIGN KEY (task_id) REFERENCES analysis_task (id) ON DELETE CASCADE,
    CONSTRAINT ck_analysis_result_scope CHECK (result_scope IN ('SUMMARY', 'REGION', 'ROAD', 'ASSET', 'ROUTE', 'TIMELINE'))
) ENGINE=InnoDB COMMENT='通用分析结果；方法稳定后再拆分专业表';
