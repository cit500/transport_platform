# 数据库脚本

当前数据库为 `transport_platform`，不再维护版本迁移链。

桥隧设施采用“公共信息 + 类型详情 + 路网边绑定”的结构：一个桥隧可以绑定多条路网边，但每条路网边只能属于一个桥隧。已有数据库升级到当前结构时，先备份数据库并确认没有边归属冲突，再执行 `maintenance/enforce_exclusive_road_asset.sql`；新建数据库直接使用 `schema.sql`，无需执行该脚本。

新环境按以下顺序执行：

1. `schema.sql`
2. 导入经核验的行政区、路网和桥隧基础数据
3. `maintenance/refresh_road.sql`
4. `maintenance/seed_dashboard_analysis_data.sql`（可选，写入可重复生成的首页预置分析结果）
5. `validation/check_database.sql`

基础路网一般保持只读。若重新导入或修正了节点、边或行政区几何，应再次运行刷新和校验脚本。分析历史位于 `analysis_task`、`analysis_result`，不要将动态灾害或韧性状态直接写入 `road_edge`。

`seed_dashboard_analysis_data.sql` 只删除并重建 `input_json.source=SYSTEM_SEED` 的任务，不影响用户实际运行的分析历史；可在基础桥隧变更后重新执行。

已有分析结果若仍使用“极低/低/中/高/极高”受损等级，可在备份 `analysis_task`、`analysis_result` 后执行 `maintenance/normalize_damage_levels.sql`，按受损概率统一为 DS0–DS4。该脚本不替换任务或其他结果。

行政区目录和几何派生属性已经定稿，运行时只读。`check_database.sql` 内置 37 条正式代码与名称用于一致性校验；如未来行政区划确有官方调整，应先同步评估 `road_edge`、`transport_asset` 的外键影响，再单独迁移。
