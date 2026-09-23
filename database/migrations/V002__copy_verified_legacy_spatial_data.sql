-- 从旧库 plant_platform 复制已经核对过的稳定数据。
-- 可重复执行；不会删除或修改旧库数据。

USE transport_resilience_v2;

INSERT INTO region (
    region_code, region_name, area_km2, center_longitude, center_latitude, geom
)
SELECT
    division_key,
    display_name,
    NULL,
    NULL,
    NULL,
    geom
FROM plant_platform.administrative_divisions
WHERE is_active = TRUE
ON DUPLICATE KEY UPDATE
    region_name = VALUES(region_name),
    geom = VALUES(geom);

INSERT INTO road_node (id, node_code, node_type, street_count, geom)
SELECT
    id,
    CAST(osmid AS CHAR),
    NULL,
    street_count,
    geom
FROM plant_platform.road_nodes
ON DUPLICATE KEY UPDATE
    node_code = VALUES(node_code),
    street_count = VALUES(street_count),
    geom = VALUES(geom);

INSERT INTO road_edge (
    id, edge_code, from_node_id, to_node_id, road_name, road_ref, road_class,
    one_way, lane_count, design_speed_kmh, length_m,
    source_bridge_flag, source_tunnel_flag, geom
)
SELECT
    e.id,
    CONCAT('OSM-', e.source_u_osmid, '-', e.source_v_osmid, '-', e.edge_key),
    e.u_node_id,
    e.v_node_id,
    e.name,
    e.ref,
    e.highway,
    COALESCE(e.oneway, FALSE),
    CASE
        WHEN e.lanes REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(e.lanes, '^[0-9]+') AS UNSIGNED)
        ELSE NULL
    END,
    CASE
        WHEN e.maxspeed REGEXP '[0-9]+' THEN CAST(REGEXP_SUBSTR(e.maxspeed, '[0-9]+') AS UNSIGNED)
        ELSE NULL
    END,
    e.length_m,
    COALESCE(e.is_bridge, FALSE),
    COALESCE(e.is_tunnel, FALSE),
    e.geom
FROM plant_platform.road_edges e
ON DUPLICATE KEY UPDATE
    road_name = VALUES(road_name),
    road_ref = VALUES(road_ref),
    road_class = VALUES(road_class),
    one_way = VALUES(one_way),
    lane_count = VALUES(lane_count),
    design_speed_kmh = VALUES(design_speed_kmh),
    length_m = VALUES(length_m),
    source_bridge_flag = VALUES(source_bridge_flag),
    source_tunnel_flag = VALUES(source_tunnel_flag),
    geom = VALUES(geom);

-- 旧路网采用路段中点归属行政区。第一阶段将其作为“主归属”，
-- 后续空间切分后可以为跨区边补充多个关系，并修正各区内长度。
INSERT INTO road_edge_region (
    road_edge_id, region_code, length_in_region_m, length_ratio, is_primary
)
SELECT
    e.id,
    d.division_key,
    e.length_m,
    1.0000000,
    TRUE
FROM plant_platform.road_edges e
JOIN plant_platform.administrative_divisions d ON d.id = e.division_id
ON DUPLICATE KEY UPDATE
    length_in_region_m = VALUES(length_in_region_m),
    length_ratio = VALUES(length_ratio),
    is_primary = TRUE;

INSERT INTO transport_asset (
    id, asset_code, asset_name, asset_type, region_code,
    longitude, latitude, geom, construction_year,
    design_grade, design_speed_kmh, baseline_condition_level,
    baseline_inspection_date, service_status
)
SELECT
    a.id,
    a.asset_code,
    a.asset_name,
    a.asset_type,
    d.division_key,
    a.longitude,
    a.latitude,
    a.geom,
    COALESCE(b.construction_year, t.construction_year),
    NULL,
    NULL,
    NULL,
    NULL,
    'IN_SERVICE'
FROM plant_platform.transport_assets a
LEFT JOIN plant_platform.administrative_divisions d ON d.id = a.division_id
LEFT JOIN plant_platform.bridge_attributes b ON b.asset_id = a.id
LEFT JOIN plant_platform.tunnel_attributes t ON t.asset_id = a.id
WHERE a.is_active = TRUE
ON DUPLICATE KEY UPDATE
    asset_name = VALUES(asset_name),
    asset_type = VALUES(asset_type),
    region_code = VALUES(region_code),
    longitude = VALUES(longitude),
    latitude = VALUES(latitude),
    geom = VALUES(geom),
    construction_year = VALUES(construction_year);

INSERT INTO bridge_detail (
    asset_id, bridge_type, total_length_m, deck_width_m, max_span_m,
    design_load_grade, design_load_ton, vertical_clearance_m, horizontal_clearance_m
)
SELECT
    asset_id,
    structure_type,
    total_length_m,
    deck_width_m,
    max_span_m,
    design_load,
    design_load_t,
    design_clearance_height_m,
    design_clearance_width_m
FROM plant_platform.bridge_attributes
ON DUPLICATE KEY UPDATE
    bridge_type = VALUES(bridge_type),
    total_length_m = VALUES(total_length_m),
    deck_width_m = VALUES(deck_width_m),
    max_span_m = VALUES(max_span_m),
    design_load_grade = VALUES(design_load_grade),
    design_load_ton = VALUES(design_load_ton),
    vertical_clearance_m = VALUES(vertical_clearance_m),
    horizontal_clearance_m = VALUES(horizontal_clearance_m);

INSERT INTO tunnel_detail (
    asset_id, tunnel_type, total_length_m, vertical_clearance_m,
    horizontal_clearance_m, lane_count
)
SELECT
    asset_id,
    tunnel_type,
    tunnel_length_m,
    design_clearance_height_m,
    design_clearance_width_m,
    lane_count
FROM plant_platform.tunnel_attributes
ON DUPLICATE KEY UPDATE
    tunnel_type = VALUES(tunnel_type),
    total_length_m = VALUES(total_length_m),
    vertical_clearance_m = VALUES(vertical_clearance_m),
    horizontal_clearance_m = VALUES(horizontal_clearance_m),
    lane_count = VALUES(lane_count);

-- 旧库目前没有人工确认过的 asset_road_relations，因此这里不自动创建绑定。
-- 开源路网中的 bridge/tunnel 标签仅保留在 road_edge 的参考字段中。
