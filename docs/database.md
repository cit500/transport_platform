# 数据库说明

数据库名称为 `transport_platform`，使用 MySQL 8 和空间类型。当前只保留 9 张表：

| 数据域 | 表 |
| --- | --- |
| 行政区 | `region` |
| 路网 | `road_node`、`road_edge` |
| 桥隧 | `transport_asset`、`bridge_detail`、`tunnel_detail`、`asset_road_relation` |
| 分析 | `analysis_task`、`analysis_result` |

`road_node.id` 和 `road_edge.id` 是平台内部稳定标识；节点连接度、边长度和边的统计行政区属于可由几何与拓扑重新计算的派生属性。灾害影响、通行状态和韧性结果不直接写回基础路网，而是随任务存入 `analysis_result`，从而保留历史且避免污染固定底图。

脚本用途：

- `database/schema.sql`：从零创建当前结构
- `database/seed.sql`：可选的最小默认数据入口，当前不写入虚构业务数据
- `database/maintenance/refresh_road.sql`：统一刷新路网派生属性
- `database/validation/check_database.sql`：检查表数量、拓扑、长度、连接度和行政归属

后端不会在启动时自动创建额外业务表。专业方法确定后，优先继续使用通用 JSON 结果；只有出现稳定查询需求时，才新增少量专业结果表。
