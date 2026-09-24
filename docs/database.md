# 数据库说明

数据库名称为 `transport_resilience_v2`，使用 MySQL 8 和空间类型。

完整迁移脚本位于 `database/migrations/`，应按版本号顺序执行。校验脚本位于 `database/validation/`。

主要数据域：

- 行政区、路网节点、路网边
- 桥梁、隧道及道路绑定
- 车辆参数、灾害场景和恢复方案
- 通行、灾害、韧性评估任务与结果
- 首页发布、灾害动态和预设问答

当前后端启动时还会通过 `V2AdminSchemaInitializer` 确保场景、灾害结果和韧性结果表存在。完整迁移和启动初始化暂时并存，后续若引入 Flyway，应统一为单一迁移机制。

详细迁移顺序见 `database/README.md`。

路网已经收敛为平台独立维护的本地数据模型，不再依赖 OSM 编码。节点与边 id、拓扑和几何是固定基础事实；连接度、长度和道路统计归属区由维护脚本统一刷新。详细口径见 `docs/road-network-data-model.md`。
