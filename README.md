# 交通网络多灾韧性评价可视化平台

面向交通网络的综合展示、重车通行评估、地震与泥石流风险评估、灾后路网韧性分析平台。前端为 Vue 3 单页应用，后端为 Spring Boot 服务，业务数据统一存储在 MySQL `transport_resilience_v2` 数据库。

## 技术栈

- 前端：Vue 3、Vue Router、Pinia、Vite、Leaflet、ECharts
- 后端：Java 17、Spring Boot 3.2、Spring Web、Spring JDBC
- 数据：MySQL 8、MySQL Spatial、GeoJSON
- 地图：Bigemap 本地瓦片服务

## 运行

复制 `.env.example` 为 `.env.local`，按本机环境填写 Bigemap 配置。

启动后端：

```powershell
cd backend
$env:PLANT_DB_USERNAME = 'root'
$env:PLANT_DB_PASSWORD = 'your-password'
mvn spring-boot:run
```

启动前端：

```powershell
npm install
npm run dev
```

默认访问 `http://localhost:3000/`，开发服务器把 `/api` 转发到 `http://localhost:8080`。

## 页面路由

| 路由 | 功能 |
| --- | --- |
| `/` | 综合态势首页与数据管理 |
| `/heavy` | 重车通行评估 |
| `/disaster` | 地震、泥石流风险评估 |
| `/resilience` | 路网韧性与恢复过程评估 |

## 目录

- `src/`：Vue 3 前端源码。
- `backend/`：Spring Boot 后端源码。
- `database/`：数据库迁移和校验脚本。
- `tools/`：非运行时的数据维护工具。
- `docs/`：架构、数据库、接口与部署说明。

`dist/`、`node_modules/`、`backend/target/`、运行日志和导出数据均为可再生成内容，不纳入源码维护。

## 文档

- [架构说明](docs/architecture.md)
- [数据库说明](docs/database.md)
- [接口说明](docs/api.md)
- [部署说明](docs/deployment.md)
