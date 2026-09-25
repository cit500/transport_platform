# 交通网络多灾韧性评价可视化平台

以本地路网为基础数据底座，展示重车通行、灾害风险和灾后路网韧性分析流程。当前阶段重点是跑通基础数据、地图与任务演示；专业分析方法确定后，再扩展通用任务结果。

## 技术栈

- 前端：Vue 3、Vue Router、Pinia、Vite、Leaflet、ECharts
- 后端：Java 17、Spring Boot 3.2、Spring Web、Spring JDBC
- 数据：MySQL 8、MySQL Spatial、GeoJSON
- 地图：Bigemap 本地瓦片服务，由 `src/config/map.js` 统一配置

## 运行

复制 `.env.example` 为 `.env.local`，填写 Bigemap 地址、令牌和图层 ID。无需停止 MySQL；后端通过连接池正常访问正在运行的服务。

```powershell
cd backend
$env:PLANT_DB_USERNAME = 'root'
$env:PLANT_DB_PASSWORD = 'your-password'
mvn spring-boot:run
```

```powershell
npm install
npm run dev
```

默认访问 `http://localhost:3000/`，开发服务器将 `/api` 转发到 `http://localhost:8080`。

## 主要目录

- `src/`：Vue 3 前端源码
- `backend/`：Spring Boot 后端源码
- `database/`：当前数据库结构、维护和校验脚本
- `tools/`：可选的数据导出工具
- `docs/`：架构、数据库、接口和部署说明

数据库只使用 `transport_platform`。完整结构见 [数据库说明](docs/database.md)，接口见 [接口说明](docs/api.md)。
