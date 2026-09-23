# 架构说明

## 前端

前端只有一套 Vue 3 单页应用。`src/main.js` 创建应用并注册 Pinia 和 Vue Router，`src/router/index.js` 管理四个业务页面。

- `views/`：业务页面
- `components/`：地图、图表、页头、数据管理等共享组件
- `stores/`：平台数据和 UI 状态
- `services/`：REST API 封装
- `styles/`：全局及业务页面样式

## 后端

后端按 Controller、Service、Config 三层组织：

- Dashboard：首页聚合数据和地图 GeoJSON
- Admin：道路、设施、参数、场景、任务和发布管理
- Disaster：地震、泥石流规则评估
- Resilience：OD 可达性、路网分配和恢复过程分析

前端统一访问 `/api/v2`，开发环境由 Vite 代理至 Spring Boot 8080 端口。

## 数据边界

正式运行数据来自 `transport_resilience_v2`。`exports/` 仅是维护工具生成的离线文件，不是运行时数据源。
