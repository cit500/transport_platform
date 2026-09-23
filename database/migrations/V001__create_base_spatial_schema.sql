-- 交通网络多灾韧性评价可视化平台 V2
-- 第一阶段：基础空间与桥隧资产
-- 本脚本只创建全新的 transport_resilience_v2，不修改 legacy 数据库 plant_platform。

CREATE DATABASE IF NOT EXISTS transport_resilience_v2
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE transport_resilience_v2;

CREATE TABLE IF NOT EXISTS region (
    region_code       VARCHAR(20)  NOT NULL COMMENT '平台固定行政区编码',
    region_name       VARCHAR(60)  NOT NULL COMMENT '平台统一展示名称',
    area_km2          DECIMAL(12,2) NULL COMMENT '区域面积，后续由空间数据核算',
    center_longitude  DECIMAL(10,7) NULL COMMENT '地图中心经度',
    center_latitude   DECIMAL(10,7) NULL COMMENT '地图中心纬度',
    geom              GEOMETRY SRID 4326 NOT NULL COMMENT '行政区 Polygon 或 MultiPolygon',
    PRIMARY KEY (region_code),
    UNIQUE KEY uk_region_name (region_name),
    SPATIAL INDEX sp_region_geom (geom)
) ENGINE=InnoDB COMMENT='平台固定37个行政区';

CREATE TABLE IF NOT EXISTS road_node (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    node_code     VARCHAR(64)  NOT NULL COMMENT '稳定的源节点编码，当前为 OSM node id',
    node_type     VARCHAR(30)  NULL COMMENT '普通节点、交叉口、出入口等',
    street_count  SMALLINT     NULL COMMENT '连接道路数量',
    geom          POINT SRID 4326 NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_road_node_code (node_code),
    SPATIAL INDEX sp_road_node_geom (geom)
) ENGINE=InnoDB COMMENT='路网节点';

CREATE TABLE IF NOT EXISTS road_edge (
    id                    BIGINT        NOT NULL AUTO_INCREMENT,
    edge_code             VARCHAR(160)  NOT NULL COMMENT '稳定路网边编码',
    from_node_id          BIGINT        NOT NULL,
    to_node_id            BIGINT        NOT NULL,
    road_name             VARCHAR(255)  NULL,
    road_ref              VARCHAR(100)  NULL COMMENT '如 G65、G50',
    road_class            VARCHAR(50)   NOT NULL COMMENT 'motorway、trunk 等',
    one_way               BOOLEAN       NOT NULL DEFAULT FALSE,
    lane_count            SMALLINT      NULL,
    design_speed_kmh      SMALLINT      NULL,
    length_m              DECIMAL(14,3) NOT NULL,
    source_bridge_flag    BOOLEAN       NOT NULL DEFAULT FALSE COMMENT '开源路网桥梁标记，仅供参考',
    source_tunnel_flag    BOOLEAN       NOT NULL DEFAULT FALSE COMMENT '开源路网隧道标记，仅供参考',
    geom                  LINESTRING SRID 4326 NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_road_edge_code (edge_code),
    KEY idx_road_edge_from (from_node_id),
    KEY idx_road_edge_to (to_node_id),
    KEY idx_road_edge_ref (road_ref),
    SPATIAL INDEX sp_road_edge_geom (geom),
    CONSTRAINT fk_road_edge_from FOREIGN KEY (from_node_id) REFERENCES road_node (id),
    CONSTRAINT fk_road_edge_to FOREIGN KEY (to_node_id) REFERENCES road_node (id),
    CONSTRAINT ck_road_edge_length CHECK (length_m > 0)
) ENGINE=InnoDB COMMENT='路网有向边；不强制只属于一个行政区';

CREATE TABLE IF NOT EXISTS road_edge_region (
    road_edge_id       BIGINT        NOT NULL,
    region_code        VARCHAR(20)   NOT NULL,
    length_in_region_m DECIMAL(14,3) NOT NULL COMMENT '该边位于本区内的长度',
    length_ratio       DECIMAL(8,7)  NOT NULL COMMENT '区内长度占整条边的比例',
    is_primary         BOOLEAN       NOT NULL DEFAULT FALSE COMMENT '用于区域道路数量归属统计',
    PRIMARY KEY (road_edge_id, region_code),
    KEY idx_edge_region_region (region_code, is_primary),
    CONSTRAINT fk_edge_region_edge FOREIGN KEY (road_edge_id) REFERENCES road_edge (id) ON DELETE CASCADE,
    CONSTRAINT fk_edge_region_region FOREIGN KEY (region_code) REFERENCES region (region_code),
    CONSTRAINT ck_edge_region_length CHECK (length_in_region_m >= 0),
    CONSTRAINT ck_edge_region_ratio CHECK (length_ratio > 0 AND length_ratio <= 1)
) ENGINE=InnoDB COMMENT='路网边与行政区空间关系；跨区边允许多行';

CREATE TABLE IF NOT EXISTS transport_asset (
    id                         BIGINT        NOT NULL AUTO_INCREMENT,
    asset_code                 VARCHAR(50)   NOT NULL,
    asset_name                 VARCHAR(200)  NOT NULL,
    asset_type                 VARCHAR(20)   NOT NULL COMMENT 'BRIDGE 或 TUNNEL',
    region_code                VARCHAR(20)   NULL COMMENT '设施代表点所在行政区',
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
) ENGINE=InnoDB COMMENT='参与评价的桥梁和隧道公共主表';

CREATE TABLE IF NOT EXISTS bridge_detail (
    asset_id                    BIGINT        NOT NULL,
    bridge_type                 VARCHAR(50)   NULL,
    total_length_m              DECIMAL(12,2) NULL,
    deck_width_m                DECIMAL(10,2) NULL,
    span_count                  SMALLINT      NULL,
    max_span_m                  DECIMAL(10,2) NULL,
    pier_count                  SMALLINT      NULL,
    representative_pier_height_m DECIMAL(10,2) NULL,
    pier_section_type           VARCHAR(30)   NULL,
    pier_section_width_m        DECIMAL(10,2) NULL,
    pier_section_height_m       DECIMAL(10,2) NULL,
    concrete_strength_mpa       DECIMAL(10,2) NULL,
    steel_strength_mpa          DECIMAL(10,2) NULL,
    reinforcement_ratio        DECIMAL(8,5)  NULL,
    bearing_type                VARCHAR(30)   NULL,
    bearing_count               SMALLINT      NULL,
    bearing_stiffness_kn_m      DECIMAL(14,2) NULL,
    has_restrainer              BOOLEAN       NULL,
    design_load_grade           VARCHAR(50)   NULL,
    design_load_ton             DECIMAL(10,2) NULL,
    vertical_clearance_m        DECIMAL(8,2)  NULL,
    horizontal_clearance_m      DECIMAL(8,2)  NULL,
    PRIMARY KEY (asset_id),
    CONSTRAINT fk_bridge_detail_asset FOREIGN KEY (asset_id) REFERENCES transport_asset (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='桥梁专有评价参数';

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
) ENGINE=InnoDB COMMENT='隧道专有评价参数';

CREATE TABLE IF NOT EXISTS asset_road_relation (
    asset_id        BIGINT       NOT NULL,
    road_edge_id    BIGINT       NOT NULL,
    relation_type   VARCHAR(20)  NOT NULL DEFAULT 'PRIMARY' COMMENT 'PRIMARY 或 ADJACENT',
    sequence_no     SMALLINT     NULL,
    direction       VARCHAR(20)  NULL,
    start_chainage  DECIMAL(12,3) NULL,
    end_chainage    DECIMAL(12,3) NULL,
    PRIMARY KEY (asset_id, road_edge_id),
    KEY idx_asset_road_edge (road_edge_id),
    CONSTRAINT fk_asset_road_asset FOREIGN KEY (asset_id) REFERENCES transport_asset (id) ON DELETE CASCADE,
    CONSTRAINT fk_asset_road_edge FOREIGN KEY (road_edge_id) REFERENCES road_edge (id),
    CONSTRAINT ck_asset_road_type CHECK (relation_type IN ('PRIMARY', 'ADJACENT'))
) ENGINE=InnoDB COMMENT='由管理员确认的桥隧与路网边绑定关系';
