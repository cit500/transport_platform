USE transport_resilience_v2;

-- 期望：37 / 8488 / 11742 / 8 / 5 / 3
SELECT 'region_count' AS check_name, COUNT(*) AS actual_value FROM region
UNION ALL SELECT 'road_node_count', COUNT(*) FROM road_node
UNION ALL SELECT 'road_edge_count', COUNT(*) FROM road_edge
UNION ALL SELECT 'transport_asset_count', COUNT(*) FROM transport_asset
UNION ALL SELECT 'bridge_detail_count', COUNT(*) FROM bridge_detail
UNION ALL SELECT 'tunnel_detail_count', COUNT(*) FROM tunnel_detail;

-- 每条边必须直接绑定一个合法行政区，缺失值应为0。
SELECT COUNT(*) AS edge_without_region
FROM road_edge
WHERE region_code IS NULL;

-- 各区域道路数量之和应与全市路网边总数相等。
SELECT
    (SELECT COUNT(*) FROM road_edge) AS total_edge_count,
    (SELECT SUM(region_edge_count)
     FROM (SELECT region_code, COUNT(*) AS region_edge_count
           FROM road_edge GROUP BY region_code) region_counts) AS summed_region_edge_count;

-- 设施详情类型错误。两项结果都应为0。
SELECT COUNT(*) AS bridge_detail_type_error
FROM bridge_detail b
JOIN transport_asset a ON a.id = b.asset_id
WHERE a.asset_type <> 'BRIDGE';

SELECT COUNT(*) AS tunnel_detail_type_error
FROM tunnel_detail t
JOIN transport_asset a ON a.id = t.asset_id
WHERE a.asset_type <> 'TUNNEL';

-- 当前人工绑定数量；初始值应为0。
SELECT COUNT(*) AS confirmed_asset_road_binding_count
FROM asset_road_relation;
