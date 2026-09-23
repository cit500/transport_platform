CREATE TABLE IF NOT EXISTS disaster_task_result (
    task_id                  BIGINT        NOT NULL,
    hazard_type              VARCHAR(20)   NOT NULL COMMENT 'EARTHQUAKE、DEBRIS_FLOW',
    occurrence_probability   DECIMAL(7,4)  NULL,
    risk_score               DECIMAL(6,2)  NOT NULL,
    risk_level               VARCHAR(20)   NOT NULL,
    source_longitude         DECIMAL(10,7) NOT NULL,
    source_latitude          DECIMAL(10,7) NOT NULL,
    influence_radius_km      DECIMAL(8,2)  NOT NULL,
    impact_area_km2          DECIMAL(12,2) NOT NULL,
    max_intensity            DECIMAL(10,3) NULL,
    affected_road_length_km  DECIMAL(12,2) NOT NULL DEFAULT 0,
    affected_bridge_count    INT           NOT NULL DEFAULT 0,
    affected_tunnel_count    INT           NOT NULL DEFAULT 0,
    summary_json             JSON          NULL,
    PRIMARY KEY (task_id),
    CONSTRAINT fk_disaster_summary_task FOREIGN KEY (task_id) REFERENCES evaluation_task (id) ON DELETE CASCADE,
    CONSTRAINT ck_disaster_hazard_type CHECK (hazard_type IN ('EARTHQUAKE','DEBRIS_FLOW'))
) ENGINE=InnoDB COMMENT='灾害评估任务总体结果';

CREATE TABLE IF NOT EXISTS disaster_asset_result (
    task_id BIGINT NOT NULL,
    asset_id BIGINT NOT NULL,
    distance_km DECIMAL(10,3) NOT NULL,
    hazard_intensity DECIMAL(10,4) NULL,
    hazard_level VARCHAR(20) NOT NULL,
    vulnerability_score DECIMAL(7,4) NULL,
    damage_probability DECIMAL(7,4) NULL,
    damage_state VARCHAR(10) NOT NULL COMMENT 'DS0—DS4',
    passability_status VARCHAR(20) NOT NULL COMMENT 'PASS、CONDITIONAL、BLOCKED、PENDING_DATA',
    assessment_reason VARCHAR(400) NULL,
    recommended_action VARCHAR(400) NULL,
    result_details_json JSON NULL,
    PRIMARY KEY (task_id, asset_id),
    KEY idx_disaster_asset (asset_id),
    CONSTRAINT fk_disaster_asset_task FOREIGN KEY (task_id) REFERENCES evaluation_task (id) ON DELETE CASCADE,
    CONSTRAINT fk_disaster_asset_asset FOREIGN KEY (asset_id) REFERENCES transport_asset (id),
    CONSTRAINT ck_disaster_damage_state CHECK (damage_state IN ('DS0','DS1','DS2','DS3','DS4')),
    CONSTRAINT ck_disaster_asset_pass CHECK (passability_status IN ('PASS','CONDITIONAL','BLOCKED','PENDING_DATA'))
) ENGINE=InnoDB COMMENT='灾害作用下逐桥隧易损性和通行结果';

CREATE TABLE IF NOT EXISTS disaster_road_result (
    task_id BIGINT NOT NULL,
    road_edge_id BIGINT NOT NULL,
    distance_km DECIMAL(10,3) NOT NULL,
    impact_score DECIMAL(7,4) NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    passability_status VARCHAR(20) NOT NULL,
    assessment_reason VARCHAR(300) NULL,
    PRIMARY KEY (task_id, road_edge_id),
    KEY idx_disaster_road (road_edge_id),
    CONSTRAINT fk_disaster_road_task FOREIGN KEY (task_id) REFERENCES evaluation_task (id) ON DELETE CASCADE,
    CONSTRAINT fk_disaster_road_edge FOREIGN KEY (road_edge_id) REFERENCES road_edge (id),
    CONSTRAINT ck_disaster_road_pass CHECK (passability_status IN ('PASS','CONDITIONAL','BLOCKED'))
) ENGINE=InnoDB COMMENT='灾害影响路段结果';
