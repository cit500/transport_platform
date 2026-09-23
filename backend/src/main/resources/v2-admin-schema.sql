CREATE TABLE IF NOT EXISTS earthquake_scenario (
    id                    BIGINT        NOT NULL AUTO_INCREMENT,
    scenario_name         VARCHAR(120)  NOT NULL,
    event_time            DATETIME      NULL,
    region_code           VARCHAR(20)   NOT NULL,
    longitude             DECIMAL(10,7) NULL,
    latitude              DECIMAL(10,7) NULL,
    description           VARCHAR(500)  NULL,
    seismic_intensity     VARCHAR(20)   NOT NULL,
    pga_g                 DECIMAL(8,4)  NOT NULL,
    intensity_measure_type VARCHAR(30)  NOT NULL DEFAULT 'PGA',
    intensity_measure_value DECIMAL(10,4) NULL,
    duration_s            DECIMAL(10,2) NULL,
    magnitude             DECIMAL(5,2)  NULL,
    source_distance_km    DECIMAL(10,2) NULL,
    site_category         VARCHAR(20)   NULL,
    wave_file_path        VARCHAR(300)  NULL,
    is_default            BOOLEAN       NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uk_earthquake_scenario_name (scenario_name),
    KEY idx_earthquake_scenario_region (region_code),
    CONSTRAINT fk_earthquake_scenario_region FOREIGN KEY (region_code) REFERENCES region (region_code),
    CONSTRAINT ck_earthquake_scenario_pga CHECK (pga_g >= 0)
) ENGINE=InnoDB COMMENT='可复用地震场景方案';

CREATE TABLE IF NOT EXISTS debris_flow_scenario (
    id                       BIGINT        NOT NULL AUTO_INCREMENT,
    scenario_name            VARCHAR(120)  NOT NULL,
    event_time               DATETIME      NULL,
    region_code              VARCHAR(20)   NOT NULL,
    longitude                DECIMAL(10,7) NULL,
    latitude                 DECIMAL(10,7) NULL,
    description              VARCHAR(500)  NULL,
    rainfall_duration_h      DECIMAL(10,2) NOT NULL,
    average_rainfall_mm_h    DECIMAL(10,2) NOT NULL,
    accumulated_rainfall_mm  DECIMAL(10,2) NOT NULL,
    antecedent_rainfall_mm   DECIMAL(10,2) NULL,
    catchment_area_km2       DECIMAL(12,3) NULL,
    average_slope_degree     DECIMAL(8,3)  NULL,
    channel_condition        VARCHAR(100)  NULL,
    loose_material_level     VARCHAR(30)   NULL,
    soil_moisture_level      VARCHAR(30)   NULL,
    is_default               BOOLEAN       NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uk_debris_flow_scenario_name (scenario_name),
    KEY idx_debris_flow_scenario_region (region_code),
    CONSTRAINT fk_debris_flow_scenario_region FOREIGN KEY (region_code) REFERENCES region (region_code),
    CONSTRAINT ck_debris_flow_rainfall CHECK (
        rainfall_duration_h > 0 AND average_rainfall_mm_h >= 0 AND accumulated_rainfall_mm >= 0
    )
) ENGINE=InnoDB COMMENT='可复用泥石流诱发条件方案';

INSERT INTO earthquake_scenario (
    scenario_name,event_time,region_code,longitude,latitude,description,seismic_intensity,pga_g,
    intensity_measure_type,intensity_measure_value,duration_s,magnitude,source_distance_km,
    site_category,wave_file_path,is_default
)
SELECT '默认地震场景（VII度）',NULL,r.region_code,106.6300000,29.7200000,
       '用于平台演示和地震评估页面默认填充','VII度',0.2000,'PGA',0.2000,30.00,6.50,20.00,'II类',NULL,TRUE
FROM region r
WHERE r.region_code='500190' AND NOT EXISTS (SELECT 1 FROM earthquake_scenario);

INSERT INTO debris_flow_scenario (
    scenario_name,event_time,region_code,longitude,latitude,description,rainfall_duration_h,
    average_rainfall_mm_h,accumulated_rainfall_mm,antecedent_rainfall_mm,catchment_area_km2,
    average_slope_degree,channel_condition,loose_material_level,soil_moisture_level,is_default
)
SELECT '默认泥石流场景（持续降雨）',NULL,r.region_code,107.7600000,29.3300000,
       '用于平台演示和泥石流评估页面默认填充',24.00,10.00,240.00,80.00,5.500,28.000,
       '沟道发育','中等','潮湿',TRUE
FROM region r
WHERE r.region_code='500156' AND NOT EXISTS (SELECT 1 FROM debris_flow_scenario);
