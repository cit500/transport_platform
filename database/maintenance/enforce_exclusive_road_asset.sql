-- 关系约束：一个桥隧可以绑定多条路网边，但一条路网边只能属于一个桥隧。
-- 执行前应确认下方冲突检查结果为 0。
USE transport_platform;

SELECT road_edge_id,COUNT(*) binding_count,GROUP_CONCAT(asset_id ORDER BY asset_id) asset_ids
FROM asset_road_relation
GROUP BY road_edge_id
HAVING COUNT(*)>1;

-- 当前项目确认不存在冲突后执行以下结构调整。
ALTER TABLE asset_road_relation
    DROP INDEX idx_asset_road_edge,
    ADD UNIQUE KEY uk_asset_road_edge (road_edge_id);

SELECT COUNT(*) relation_count,
       COUNT(DISTINCT asset_id) bound_asset_count,
       COUNT(DISTINCT road_edge_id) occupied_edge_count
FROM asset_road_relation;
