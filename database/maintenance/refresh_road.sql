USE transport_platform;

START TRANSACTION;

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

UPDATE road_edge
SET length_m = ROUND(ST_Length(geom, 'metre'), 3)
WHERE ST_IsValid(ST_SRID(geom, 0));

DROP TEMPORARY TABLE IF EXISTS tmp_road_edge_region;
CREATE TEMPORARY TABLE tmp_road_edge_region (
    road_edge_id BIGINT NOT NULL PRIMARY KEY,
    region_code VARCHAR(20) NOT NULL
);

INSERT INTO tmp_road_edge_region (road_edge_id, region_code)
SELECT e.id, MIN(r.region_code)
FROM road_edge e
JOIN region r ON ST_Intersects(ST_SRID(r.geom, 0), ST_Centroid(ST_SRID(e.geom, 0)))
GROUP BY e.id;

DROP TEMPORARY TABLE IF EXISTS tmp_unmatched_road_edge;
CREATE TEMPORARY TABLE tmp_unmatched_road_edge (road_edge_id BIGINT NOT NULL PRIMARY KEY);

INSERT INTO tmp_unmatched_road_edge
SELECT e.id FROM road_edge e
LEFT JOIN tmp_road_edge_region matched ON matched.road_edge_id=e.id
WHERE matched.road_edge_id IS NULL;

INSERT INTO tmp_road_edge_region (road_edge_id, region_code)
SELECT e.id, MIN(r.region_code)
FROM tmp_unmatched_road_edge unmatched
JOIN road_edge e ON e.id=unmatched.road_edge_id
JOIN region r ON ST_Intersects(ST_SRID(r.geom,0),ST_SRID(ST_StartPoint(e.geom),0))
              OR ST_Intersects(ST_SRID(r.geom,0),ST_SRID(ST_EndPoint(e.geom),0))
GROUP BY e.id;

UPDATE road_edge e
JOIN tmp_road_edge_region x ON x.road_edge_id=e.id
SET e.region_code=x.region_code;

DROP TEMPORARY TABLE tmp_unmatched_road_edge;
DROP TEMPORARY TABLE tmp_road_edge_region;

COMMIT;
