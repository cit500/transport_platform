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

WITH official_region AS (
    SELECT '500101' region_code,'万州区' region_name UNION ALL
    SELECT '500102','涪陵区' UNION ALL SELECT '500103','渝中区' UNION ALL
    SELECT '500104','大渡口区' UNION ALL SELECT '500106','沙坪坝区' UNION ALL
    SELECT '500107','九龙坡区' UNION ALL SELECT '500108','南岸区' UNION ALL
    SELECT '500109','北碚区' UNION ALL SELECT '500110','綦江区' UNION ALL
    SELECT '500111','大足区' UNION ALL SELECT '500113','巴南区' UNION ALL
    SELECT '500114','黔江区' UNION ALL SELECT '500115','长寿区' UNION ALL
    SELECT '500116','江津区' UNION ALL SELECT '500117','合川区' UNION ALL
    SELECT '500118','永川区' UNION ALL SELECT '500119','南川区' UNION ALL
    SELECT '500120','璧山区' UNION ALL SELECT '500151','铜梁区' UNION ALL
    SELECT '500152','潼南区' UNION ALL SELECT '500153','荣昌区' UNION ALL
    SELECT '500154','开州区' UNION ALL SELECT '500155','梁平区' UNION ALL
    SELECT '500156','武隆区' UNION ALL SELECT '500157','两江新区' UNION ALL
    SELECT '500229','城口县' UNION ALL SELECT '500230','丰都县' UNION ALL
    SELECT '500231','垫江县' UNION ALL SELECT '500233','忠县' UNION ALL
    SELECT '500235','云阳县' UNION ALL SELECT '500236','奉节县' UNION ALL
    SELECT '500237','巫山县' UNION ALL SELECT '500238','巫溪县' UNION ALL
    SELECT '500240','石柱土家族自治县' UNION ALL
    SELECT '500241','秀山土家族苗族自治县' UNION ALL
    SELECT '500242','酉阳土家族苗族自治县' UNION ALL
    SELECT '500243','彭水苗族土家族自治县'
)
SELECT
    (SELECT COUNT(*) FROM official_region o LEFT JOIN region r ON r.region_code=o.region_code
      WHERE r.region_code IS NULL OR r.region_name<>o.region_name)
  + (SELECT COUNT(*) FROM region r LEFT JOIN official_region o ON o.region_code=r.region_code
      WHERE o.region_code IS NULL) AS official_region_catalog_error_count;

SELECT COUNT(*) AS region_derived_attribute_error_count
FROM region
WHERE area_km2 IS NULL OR area_km2<=0
   OR center_longitude IS NULL OR center_latitude IS NULL;

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
