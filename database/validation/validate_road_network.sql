-- 本地路网完整性与派生属性一致性检查；所有 *_error_count 理想值均为 0。

USE transport_resilience_v2;

SELECT 'node_code_column_count' AS check_name, COUNT(*) AS actual_value
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'road_node' AND column_name = 'node_code'
UNION ALL
SELECT 'edge_code_column_count', COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'road_edge' AND column_name = 'edge_code'
UNION ALL
SELECT 'node_type_column_count', COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'road_node' AND column_name = 'node_type';

SELECT COUNT(*) AS invalid_node_geometry_error_count
FROM road_node
WHERE geom IS NULL OR NOT ST_IsValid(ST_SRID(geom, 0));

SELECT COUNT(*) AS invalid_edge_geometry_error_count
FROM road_edge
WHERE geom IS NULL OR NOT ST_IsValid(ST_SRID(geom, 0)) OR ST_NumPoints(geom) < 2;

SELECT COUNT(*) AS topology_endpoint_error_count
FROM road_edge e
JOIN road_node from_node ON from_node.id = e.from_node_id
JOIN road_node to_node ON to_node.id = e.to_node_id
WHERE ST_Distance_Sphere(ST_StartPoint(e.geom), from_node.geom) > 2
   OR ST_Distance_Sphere(ST_EndPoint(e.geom), to_node.geom) > 2;

SELECT COUNT(*) AS derived_length_error_count
FROM road_edge
WHERE ABS(length_m - ST_Length(geom, 'metre'))
      > GREATEST(5, ST_Length(geom, 'metre') * 0.01);

WITH calculated_degree AS (
    SELECT node_id, COUNT(DISTINCT adjacent_node_id) AS connection_count
    FROM (
        SELECT from_node_id AS node_id, to_node_id AS adjacent_node_id FROM road_edge
        UNION ALL
        SELECT to_node_id AS node_id, from_node_id AS adjacent_node_id FROM road_edge
    ) adjacency
    WHERE node_id <> adjacent_node_id
    GROUP BY node_id
)
SELECT COUNT(*) AS derived_street_count_error_count
FROM road_node n
LEFT JOIN calculated_degree d ON d.node_id = n.id
WHERE COALESCE(n.street_count, 0) <> COALESCE(d.connection_count, 0);

SELECT COUNT(*) AS region_assignment_error_count
FROM road_edge e
JOIN region r ON r.region_code = e.region_code
WHERE NOT ST_Intersects(
    ST_SRID(r.geom, 0),
    ST_Centroid(ST_SRID(e.geom, 0))
)
AND NOT ST_Intersects(ST_SRID(r.geom, 0), ST_SRID(ST_StartPoint(e.geom), 0))
AND NOT ST_Intersects(ST_SRID(r.geom, 0), ST_SRID(ST_EndPoint(e.geom), 0));

-- 以下为信息性统计，不一定代表错误；平行道路、匝道或重复采集都可能共享同一对端点。
SELECT from_node_id, to_node_id, COUNT(*) AS parallel_edge_count
FROM road_edge
GROUP BY from_node_id, to_node_id
HAVING COUNT(*) > 1
ORDER BY parallel_edge_count DESC, from_node_id, to_node_id;
