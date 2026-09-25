USE transport_platform;

SELECT 'region' object_name, COUNT(*) row_count FROM region
UNION ALL SELECT 'road_node', COUNT(*) FROM road_node
UNION ALL SELECT 'road_edge', COUNT(*) FROM road_edge
UNION ALL SELECT 'transport_asset', COUNT(*) FROM transport_asset
UNION ALL SELECT 'bridge_detail', COUNT(*) FROM bridge_detail
UNION ALL SELECT 'tunnel_detail', COUNT(*) FROM tunnel_detail
UNION ALL SELECT 'asset_road_relation', COUNT(*) FROM asset_road_relation
UNION ALL SELECT 'analysis_task', COUNT(*) FROM analysis_task
UNION ALL SELECT 'analysis_result', COUNT(*) FROM analysis_result;

SELECT COUNT(*) AS topology_endpoint_error_count
FROM road_edge e
JOIN road_node n1 ON n1.id=e.from_node_id
JOIN road_node n2 ON n2.id=e.to_node_id
WHERE ST_Distance_Sphere(ST_StartPoint(e.geom),n1.geom)>2
   OR ST_Distance_Sphere(ST_EndPoint(e.geom),n2.geom)>2;

SELECT COUNT(*) AS derived_length_error_count
FROM road_edge
WHERE ABS(length_m-ST_Length(geom,'metre'))>GREATEST(5,ST_Length(geom,'metre')*0.01);

WITH calculated_degree AS (
    SELECT node_id,COUNT(DISTINCT adjacent_node_id) connection_count
    FROM (
        SELECT from_node_id node_id,to_node_id adjacent_node_id FROM road_edge
        UNION ALL
        SELECT to_node_id node_id,from_node_id adjacent_node_id FROM road_edge
    ) adjacency
    WHERE node_id<>adjacent_node_id
    GROUP BY node_id
)
SELECT COUNT(*) AS derived_street_count_error_count
FROM road_node n
LEFT JOIN calculated_degree d ON d.node_id=n.id
WHERE COALESCE(n.street_count,0)<>COALESCE(d.connection_count,0);

SELECT COUNT(*) AS region_assignment_error_count
FROM road_edge e
JOIN region r ON r.region_code=e.region_code
WHERE NOT ST_Intersects(ST_SRID(r.geom,0),ST_Centroid(ST_SRID(e.geom,0)))
  AND NOT ST_Intersects(ST_SRID(r.geom,0),ST_SRID(ST_StartPoint(e.geom),0))
  AND NOT ST_Intersects(ST_SRID(r.geom,0),ST_SRID(ST_EndPoint(e.geom),0));
