# 架构说明

## 前端

项目只有一套 Vue 3 单页应用。`src/main.js` 是应用入口，`src/router/index.js` 管理首页、重车、灾害和韧性页面。

- `views/`：业务页面
- `components/`：地图、图表、页头和数据管理组件
- `stores/`：平台数据与界面状态
- `services/`：REST API 与地图服务封装
- `config/map.js`：Bigemap 地址、令牌和图层 ID 的唯一配置入口

## 后端

后端按 Controller、Service、Config 组织。基础数据接口真实读取行政区、路网和桥隧；灾害与韧性模块当前采用可替换的演示算法，并把输入、结果整体写入通用分析表。

前端统一访问 `/api`，开发环境由 Vite 代理至 Spring Boot 8080 端口。

## 数据边界

运行数据只来自 MySQL `transport_platform`。路网是平台自己的本地数据模型，不再兼容或依赖 OSM 编码。`exports/` 是可再生成的离线导出，不是运行时数据源。
