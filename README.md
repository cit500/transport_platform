# 交通网络多灾韧性评价可视化平台

面向交通路网与桥隧设施的数据管理、重车通行检查、灾害影响展示和路网韧性分析平台。平台以重庆地区的行政区划、道路节点与道路边为基础，将设施档案、空间地图、分析任务和历史结果集中展示，并提供可查询业务数据的数字人助手。

## 功能模块

| 模块 | 主要功能 |
| --- | --- |
| 首页大屏 | 基础数据概览、桥隧通行概况、灾害受损分布、区域韧性指标、灾害动态和数字人助手 |
| 地图展示 | 行政区划、卫星、电子地图切换；道路与桥隧叠加；区县查询、指标着色及地图与图表联动 |
| 重车通行评估 | 车辆参数输入，按设施状态、桥梁设计荷载和隧道净空进行规则检查，保存任务与设施级结论 |
| 灾害风险评估 | 地震与泥石流场景输入，展示桥隧受损概率、DS0–DS4 分级及道路影响结果，支持历史结果恢复 |
| 路网韧性评估 | 正常、灾后与恢复阶段展示，可达性、功能保持、区域韧性和恢复曲线，支持历史结果恢复 |
| 数据管理 | 行政区和路网查询，桥隧档案及专业详情维护、道路绑定、运营状态切换、分析任务查询与删除 |
| 数字人助手 | 大模型对话、平台知识说明及数据库只读工具查询，提供快捷问题和服务失败提示 |

## 实现范围

基础数据查询、桥隧维护以及分析输入和结果的持久化已接入 MySQL。行政区与路网在业务界面中只读，桥隧设施可维护；首页按设施或区域读取最近一次成功分析结果。
当前重车评估采用简化荷载与净空规则，路线展示与距离包含示例数据；灾害与韧性计算仍采用可替换的演示方法，尚不代表最终专业分析模型。数字人形象由 CSS 绘制，对话以文本交互为主。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3、JavaScript、Vue Router 4、Pinia 3、Vite 5、原生 CSS |
| 地图与图表 | Leaflet 1.9、ECharts 6、GeoJSON、Bigemap 离线瓦片服务 |
| 后端 | Java 17、Spring Boot 3.2.5、Spring Web、Spring JDBC、HikariCP、Maven |
| 数据库 | MySQL 8、空间类型与空间索引、JSON 分析结果 |
| 模型接口 | Java HttpClient、智谱 GLM，预留 Kimi 等兼容接口配置 |
| 部署 | Ubuntu、Nginx、systemd；Bigemap Server 使用 Docker |
| 辅助工具 | Python、mysql-connector-python，支持路网 CSV、JSON、GeoJSON 与邻接表导出 |

## 系统架构

开发环境中，Vite 提供前端页面并将 `/api` 转发到 Spring Boot。云端部署中，Nginx 托管前端构建产物，将 `/api/` 转发给后端，将 `/bigemap/` 转发给地图服务。

```text
浏览器 → Nginx
          ├─ /           → Vue 静态页面
          ├─ /api/       → Spring Boot → MySQL
          │                           → 大模型 API
          └─ /bigemap/   → Bigemap Server（Docker）
```

后端按 Controller、Service、Config 组织，使用 JdbcTemplate 和显式 SQL 访问数据库。地图瓦片与业务空间数据分别由 Bigemap 和 MySQL 提供；大模型调用需要服务器能够访问外部服务。

## 数据组织

数据库统一使用 `transport_platform`，包含 9 张表：

| 数据域 | 表 |
| --- | --- |
| 行政区 | `region` |
| 路网 | `road_node`、`road_edge` |
| 桥隧设施 | `transport_asset`、`bridge_detail`、`tunnel_detail`、`asset_road_relation` |
| 分析历史 | `analysis_task`、`analysis_result` |

路网节点与边使用平台内部稳定 ID。一个桥隧可绑定多条道路边，每条道路边只允许绑定一个设施。分析任务保存输入快照，结果表保存汇总及设施或区域级结果，避免覆盖基础路网或丢失历史。完整定义见 [数据库说明](docs/database.md) 和 [schema.sql](database/schema.sql)。

## 本地开发

### 环境准备

准备 Java 17、Maven、兼容 Vite 5 的 Node.js 与 npm、MySQL 8，以及可用的 Bigemap 服务。当前仓库未固定 Node.js 版本。
首次搭建可执行 `database/schema.sql` 创建结构，再导入匹配的行政区、路网和设施数据。仓库不附带完整业务数据和离线瓦片；`database/seed.sql` 不生成完整演示数据。已有数据库无需重复初始化或停止 MySQL。

### 前端配置与启动

在项目根目录创建本地开发配置：

```powershell
Copy-Item .env.example .env.development.local
npm ci
npm run dev
```

根据实际 Bigemap 服务修改配置：

```dotenv
VITE_API_ROOT=/api
VITE_BIGEMAP_URL=http://127.0.0.1:9000
VITE_BIGEMAP_TOKEN=<本地地图访问令牌>
VITE_BIGEMAP_SATELLITE_LAYER=<本地卫星图层ID>
VITE_BIGEMAP_ELECTRONIC_LAYER=<本地电子图层ID>
```

默认访问 `http://localhost:3000/`；开发代理目标为 `http://localhost:8080`。地图配置统一入口是 `src/config/map.js`。

### 后端配置与启动

在另一个 PowerShell 会话中执行：

```powershell
$env:PLANT_DB_USERNAME = 'your-db-user'
$env:PLANT_DB_PASSWORD = 'your-db-password'
# 可选：覆盖默认的本机 transport_platform 数据库地址
# $env:PLANT_DB_URL = 'jdbc:mysql://localhost:3306/transport_platform?...'
# 可选：启用数字人助手的大模型调用
# $env:PLANT_LLM_API_KEY = 'your-llm-api-key'
cd backend
mvn spring-boot:run
```

后端默认端口为 8080。数据库连接及模型参数在 `backend/src/main/resources/application.yml` 中通过环境变量覆盖。

### 数字人助手

默认模型配置为智谱 `glm-4-flash`，支持通过服务商联网搜索配置及五个预定义数据库只读工具获取信息。系统上下文由助手人设、平台知识库、实时数据摘要、最近 10 条历史消息和当前问题组成；最多执行 4 轮工具循环，回答采用非流式返回。
知识库位于 `backend/src/main/resources/kb/assistant-kb.md`，启动时加载，修改后需要重新启动后端；使用 JAR 部署时需重新打包并部署。
模型环境变量包括 `PLANT_LLM_API_KEY`、`PLANT_LLM_PROVIDER`、`PLANT_LLM_BASE_URL`、`PLANT_LLM_MODEL` 和 `PLANT_LLM_WEB_SEARCH`。模型不可用时，快捷问题可回退到预置答案，普通输入显示错误原因。工具接口的兼容性边界见阶段记录。
本地可将密钥保存为 Git 忽略的 `.env.llm.local`，内容为 `PLANT_LLM_API_KEY=实际密钥`。此文件不会由 Spring Boot 自动加载；启动前可在项目根目录执行：

```powershell
$env:PLANT_LLM_API_KEY = (Get-Content -LiteralPath .env.llm.local -Raw).Trim() -replace '^PLANT_LLM_API_KEY=', ''
```

## 构建与部署

```powershell
# 项目根目录：构建前端，输出 dist/
npm run build
# 构建后端，输出 backend/target/ 下的 JAR
mvn -f backend/pom.xml clean package
```

前端开发和生产配置分别使用 `.env.development` / `.env.production`，私有覆盖文件可用 `.env.development.local` / `.env.production.local`。这些环境文件均被 Git 忽略，需自行准备；生产构建会把 VITE_ 配置写入静态资源，不能用于存放大模型密钥或数据库密码。地图地址、令牌和图层 ID 需与对应环境的 Bigemap 服务一致，修改后重新构建。
云端采用单机部署：Nginx 托管页面并代理服务，systemd 管理后端，MySQL 保存业务数据，Docker 运行 Bigemap。详细安装、数据库迁移、配置和运维步骤见 [部署说明](DEPLOYMENT.md)。
当前代码未提供登录鉴权；管理页面包含数据修改与删除，公网运行时应通过部署层限制访问。数据库与地图管理凭据不应提交到 Git，业务数据和地图数据需单独备份。

## 项目目录

```text
src/                  Vue 页面、组件、状态、接口与样式
backend/              Spring Boot 服务、配置和助手知识库
database/             数据库结构、维护与校验 SQL
tools/data-export/    可选路网离线导出工具
docs/                 架构、接口、数据模型与阶段记录
DEPLOYMENT.md         云服务器部署与运维说明
```

## 文档索引

- [系统架构](docs/architecture.md)
- [REST API 与助手接口](docs/api.md)
- [数据库说明](docs/database.md)
- [本地路网数据模型](docs/road-network-data-model.md)
- [部署与运维](DEPLOYMENT.md)
- [2026-10-16 阶段版本记录](docs/releases/2026-10-16.md)
