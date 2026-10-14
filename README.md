# 交通网络多灾韧性评价可视化平台

以本地路网为基础数据底座，展示重车通行、灾害影响和灾后路网韧性分析流程。行政区和路网保持只读，桥隧设施可维护；三类分析的汇总与设施/区域级结果均持久化到通用任务结果表。

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

数字人助手使用智谱 GLM 大模型（glm-4-flash，支持联网搜索与数据库只读工具调用），后端代码预留 Kimi 等兼容模型接口。API Key 通过环境变量 `PLANT_LLM_API_KEY` 注入，不将真实密钥写入仓库；未配置时助手自动回退预置问答。

本地密钥可保存在 Git 忽略的 `.env.llm.local` 中；启动后端前，在项目根目录执行以下命令加载到当前 PowerShell 会话（不会自动加载）：

```powershell
$env:PLANT_LLM_API_KEY = (Get-Content -LiteralPath .env.llm.local -Raw).Trim() -replace '^PLANT_LLM_API_KEY=', ''
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
