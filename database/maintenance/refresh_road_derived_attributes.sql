-- 刷新由基础拓扑或空间几何确定的派生属性。
-- 本脚本不会修改 id、from_node_id、to_node_id、geom、道路名称、等级、车道数或设计速度。
-- 建议在首次导入、批量替换路网或修改行政区边界后执行；日常业务运行无需自动执行。

USE transport_resilience_v2;

START TRANSACTION;

-- street_count 的统一口径：忽略方向后，与该节点直接相邻的不同节点数量。
-- 双向道路的两条有向边不会被重复计数。
UPDATE road_node SET street_count = 0;

UPDATE road_node n
JOIN (
    SELECT node_id, COUNT(DISTINCT adjacent_node_id) AS connection_count
    FROM (
        SELECT from_node_id AS node_id, to_node_id AS adjacent_node_id FROM road_edge
        UNION ALL
        SELECT to_node_id AS node_id, from_node_id AS adjacent_node_id FROM road_edge
    ) adjacency
    WHERE node_id <> adjacent_node_id
    GROUP BY node_id
) degree_result ON degree_result.node_id = n.id
SET n.street_count = degree_result.connection_count;

-- SRID 4326 的线长度按米重新计算，数据库中的几何是唯一计算依据。
UPDATE road_edge
SET length_m = ROUND(ST_Length(geom, 'metre'), 3)
WHERE geom IS NOT NULL AND ST_IsValid(ST_SRID(geom, 0));

-- 每条边只保留一个统计归属区。优先使用线几何质心所在区；边界连接边的质心可能
-- 位于行政区覆盖范围之外，此时回退到任一端点所在区。多区同时命中时使用最小
-- region_code 保证结果稳定。跨区关系仍由 geom 表达，不从两个端点组合推导。
DROP TEMPORARY TABLE IF EXISTS tmp_road_edge_region;
CREATE TEMPORARY TABLE tmp_road_edge_region (
    road_edge_id BIGINT NOT NULL PRIMARY KEY,
    region_code VARCHAR(20) NOT NULL
);

INSERT INTO tmp_road_edge_region (road_edge_id, region_code)
SELECT e.id, MIN(r.region_code)
FROM road_edge e
JOIN region r ON ST_Intersects(
    ST_SRID(r.geom, 0),
    ST_Centroid(ST_SRID(e.geom, 0))
)
GROUP BY e.id;

DROP TEMPORARY TABLE IF EXISTS tmp_unmatched_road_edge;
CREATE TEMPORARY TABLE tmp_unmatched_road_edge (
    road_edge_id BIGINT NOT NULL PRIMARY KEY
);

INSERT INTO tmp_unmatched_road_edge (road_edge_id)
SELECT e.id
FROM road_edge e
LEFT JOIN tmp_road_edge_region matched ON matched.road_edge_id = e.id
WHERE matched.road_edge_id IS NULL;

INSERT INTO tmp_road_edge_region (road_edge_id, region_code)
SELECT e.id, MIN(r.region_code)
FROM tmp_unmatched_road_edge unmatched
JOIN road_edge e ON e.id = unmatched.road_edge_id
JOIN region r ON ST_Intersects(ST_SRID(r.geom, 0), ST_SRID(ST_StartPoint(e.geom), 0))
              OR ST_Intersects(ST_SRID(r.geom, 0), ST_SRID(ST_EndPoint(e.geom), 0))
GROUP BY e.id;

UPDATE road_edge e
JOIN tmp_road_edge_region x ON x.road_edge_id = e.id
SET e.region_code = x.region_code;

DROP TEMPORARY TABLE tmp_road_edge_region;
DROP TEMPORARY TABLE tmp_unmatched_road_edge;

COMMIT;

SELECT
    (SELECT COUNT(*) FROM road_node) AS node_count,
    (SELECT COUNT(*) FROM road_edge) AS edge_count,
    (SELECT COUNT(*) FROM road_node WHERE street_count IS NULL) AS node_without_street_count,
    (SELECT COUNT(*) FROM road_edge WHERE length_m <= 0) AS invalid_edge_length,
    (SELECT COUNT(*) FROM road_edge WHERE region_code IS NULL) AS edge_without_region;
