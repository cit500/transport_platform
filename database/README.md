# V2 数据库

数据库名称：`transport_resilience_v2`

当前已包含基础空间数据、首页发布、数据管理、重车参数、灾害评估和路网韧性评估所需表结构。运行时只使用本数据库；旧库仅在最初执行 `V002` 时作为一次性只读迁移来源。

## 执行顺序

1. `migrations/V001__create_base_spatial_schema.sql`
2. `migrations/V002__copy_verified_legacy_spatial_data.sql`
3. `migrations/V003__bind_each_road_edge_to_one_region.sql`
4. `migrations/V004__create_dashboard_and_task_schema.sql`
5. `migrations/V005__seed_dashboard_defaults.sql`
6. `migrations/V006__create_admin_scenario_schema.sql`
7. `migrations/V007__create_disaster_assessment_schema.sql`
8. `migrations/V008__create_resilience_assessment_schema.sql`
9. `migrations/V009__simplify_local_road_network_schema.sql`
10. `maintenance/refresh_road_derived_attributes.sql`
11. `maintenance/fill_road_default_attributes.sql`（仅在需要补齐默认值时执行）
12. `validation/validate_base_spatial.sql`
13. `validation/validate_road_network.sql`
14. `validation/validate_dashboard_data.sql`

迁移脚本均采用可重复执行方式。已完成迁移的日常运行不依赖旧数据库或本地 GeoJSON 文件。

V009 执行后，运行时路网不再保留 OSM 节点编码和边编码，`road_node.id`、`road_edge.id` 是平台稳定标识。旧库只承担首次数据迁移来源，不再构成兼容边界。字段口径和维护方式见 `docs/road-network-data-model.md`。

## 路网与行政区统计口径

- 全市道路总数：直接统计 `road_edge`，每条边只计算一次。
- 区域道路数：按 `road_edge.region_code` 分组统计。
- 区域道路里程：按 `road_edge.region_code` 分组汇总 `length_m`。
- 当前采用路段中点归属；6条边界连接边按相交端点补齐。

V002先复制旧路网的中点归属到过渡关系表，V003将归属写入 `road_edge.region_code` 并移除过渡表。最终每条边只绑定一个行政区，所以37区道路数量之和严格等于全市路网边总数。

## 桥隧绑定规则

- `transport_asset` 保存桥梁和隧道公共信息。
- `bridge_detail`、`tunnel_detail` 与资产主表一对一。
- `asset_road_relation` 保存管理员人工确认的桥隧—路网边关系。
- 开源路网自带的桥梁、隧道标签只作为筛选提示，不能自动生成正式评估设施或正式绑定。
- 一个设施可以绑定多条路网边，适用于双向路段、长桥和长隧道。

## 初始迁移数据来源

- 行政区：旧库中已经核验的37区数据。
- 路网节点：旧库 `road_nodes`，对应8,488个节点。
- 路网边：旧库 `road_edges`，对应11,742条边。
- 设施：旧库中8个预设桥隧，仅迁移明确字段，不自动绑定道路。

这些来源说明用于追溯首次迁移口径；当前页面和后端接口均直接读取 `transport_resilience_v2`。
