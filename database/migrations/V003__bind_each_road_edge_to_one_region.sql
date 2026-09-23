-- 收敛为当前阶段的简洁模型：每条路网边只绑定一个行政区。
-- 绝大多数沿用旧数据的路段中点归属；6条边界连接边按相交端点补齐。

USE transport_resilience_v2;

ALTER TABLE road_edge
    ADD COLUMN region_code VARCHAR(20) NULL AFTER to_node_id;

UPDATE road_edge e
JOIN road_edge_region r
  ON r.road_edge_id = e.id
 AND r.is_primary = TRUE
SET e.region_code = r.region_code;

-- 旧中点算法未匹配的6条边界连接边。
UPDATE road_edge
SET region_code = CASE id
    WHEN 2023  THEN '500156' -- 武隆区，武道高速
    WHEN 2071  THEN '500156' -- 武隆区，武道高速反向边
    WHEN 3080  THEN '500231' -- 垫江县，沪蓉高速
    WHEN 9719  THEN '500117' -- 合川区，银昆高速/伏龙大桥
    WHEN 9844  THEN '500116' -- 江津区，成渝环线高速
    WHEN 11932 THEN '500101' -- 万州区，恩广高速
    ELSE region_code
END
WHERE id IN (2023, 2071, 3080, 9719, 9844, 11932);

ALTER TABLE road_edge
    MODIFY COLUMN region_code VARCHAR(20) NOT NULL,
    ADD KEY idx_road_edge_region (region_code),
    ADD CONSTRAINT fk_road_edge_region
        FOREIGN KEY (region_code) REFERENCES region (region_code);

-- 归属已转入 road_edge.region_code，过渡关系表不再需要。
DROP TABLE road_edge_region;
