# 平台交接说明（Plant_v2）

> 交通网络多灾韧性评价可视化平台 · 交接包说明
> 交接日期：2026-11-05 · 代码基线：`62e0555`

## 0. 先读这一段

这个包是**给协作者对齐用的**，不是打包好的可执行安装程序。里面有三样东西：

1. **完整源码**（前端 Vue 3 + 后端 Spring Boot）：看清现有模块怎么分层、接口怎么定、地图怎么用；
2. **数据库全量导出**（`database/handoff/transport_platform_20261111.sql`，含 10 张表结构与全部数据）：导入后能直接复现当前界面的数据状态，也能看懂分析任务/结果如何落库；
3. **技术文档**（`docs/`）：总体架构、接口、数据模型、灾害模块实现基线。

**开发具体模块时请遵循两条约定**：专业算法口径以外部方法包为准（见 §9，本次未随包提供，需另索要）；数据与界面展示以本平台为准。

---

## 1. 项目定位与当前完成度

面向重庆地区**交通路网与桥隧设施**的数据管理、重车通行检查、灾害风险评估和路网韧性分析平台。

| 模块 | 当前状态 | 说明 |
|---|---|---|
| 首页大屏 | **可用** | 区县指标、桥隧统计、灾害分布、数字人助手 |
| 地图展示 | **可用** | Leaflet + Bigemap 瓦片（卫星/电子），区县/路网/桥隧多图层 |
| 数据管理 | **可用** | 路网节点与边 CRUD、桥隧台账、路网边绑定、参数方案、批量导入 |
| 灾害风险评估 | **已实现** | 地震（易损性曲线 + 损伤概率 + 风险分级）、泥石流（参数化强度模型）；支持上传地震动记录解析 PGA、大模型取环境参数 |
| 重车通行评估 | **简化演示** | 规则检查（限重/限高/限宽/轴数）+ 示例路线，**不是真实路径规划** |
| 路网韧性评估 | **占位演示** | `ResilienceService` 内为硬编码常量，仅演示交互；正式方法见外部方法包 |
| 登录鉴权 | **未实现** | 全站无鉴权，公网部署需在入口限制 |
| 异步任务调度 | **未实现** | 评估接口为同步调用 |
| 成果标准化导出 | **未实现** | 目前只有任务 JSON 落库 |

---

## 2. 目录职责

```
src/                      前端（Vue 3 + Vite）
  views/                  页面：HomeView / DisasterView / HeavyView / ResilienceView / DataManagementView
  components/             TransportMap（地图核心组件）、PlatformHeader、EChart、disaster/（灾害子面板）
  services/api.js         统一 fetch 封装
  stores/platform.js      Pinia 状态（含地图数据缓存）
  config/map.js           地图配置（走 VITE_BIGEMAP_* 环境变量）
  styles/                 8 个样式文件，main.js 全局引入
backend/src/main/java/    后端（Spring Boot 3.2.5 / Java 17）
  controller/             仅解析入参、调服务、返回 JSON，不含业务逻辑
  service/                业务与算法（DisasterService / DebrisFlowService / FragilityMath /
                          HeavyService / ResilienceService / LlmClient / AnalysisStore …）
  config/                 CORS、DataSource、EnvFileLoader（启动时读取 .env.llm.local）
  resources/application.yml   含环境变量占位，无真实密钥
database/                 数据库脚本（见 §4）
docs/                     技术文档（见 §3 阅读顺序）
```

---

## 3. 技术栈与本地跑起来

- 前端：Vue 3.4 / Vite 5 / Pinia / Leaflet 1.9 / ECharts 6
- 后端：Spring Boot 3.2.5 / Java 17 / JdbcTemplate（无 ORM）
- 数据库：MySQL 8，库名 `transport_platform`
- 地图：Bigemap Server 瓦片服务（需自备 token，见下）

**导入数据库**

```bash
mysql -uroot -p -e "CREATE DATABASE transport_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -uroot -p transport_platform < database/handoff/transport_platform_20261111.sql
```

**启动后端**（默认 `localhost:3306` / `root` / `root`，可用环境变量覆盖）

```bash
cd backend
mvn spring-boot:run        # 监听 8080
# 覆盖方式：PLANT_DB_URL / PLANT_DB_USERNAME / PLANT_DB_PASSWORD
```

**启动前端**

```bash
cp .env.example .env.development     # 按需填写 VITE_BIGEMAP_* （token 需自己申请）
npm install
npm run dev                          # 监听 3000，/api 代理到 8080
```

**不配大模型也能跑**：`PLANT_LLM_API_KEY` 留空时，数字人助手与泥石流「用大模型获取环境数据」会返回明确提示并回退默认参数，不影响其他功能。

**文档阅读顺序**：`docs/architecture.md` → `docs/road-network-data-model.md` → `docs/api.md` → `docs/database.md` → `docs/disaster-module-guide.md`（灾害模块最完整实现基线，改灾害必读）。

---

## 4. 数据库

**表结构与数据量**（本次导出实测）

| 表 | 行数 | 用途与口径 |
|---|---|---|
| `region` | 37 | 重庆区县，含中心点坐标与指标字段 |
| `road_node` | 8,488 | 路网节点（稳定编码、经纬度） |
| `road_edge` | 11,742 | 路网边（OSM 原始边，含方向、车道、限速、WKT 线形 `geom`（经度在前）、`source_bridge_flag`/`source_tunnel_flag`；单向 10,652 / 双向 1,090，无缺速度与车道数据；无 capacity_vph 列） |
| `transport_asset` | 11 | 桥隧设施台账（类型、名称、坐标、状态） |
| `bridge_detail` / `tunnel_detail` | 7 / 5 | 桥梁/隧道专业属性（结构类型、跨径、长度、等级等） |
| `asset_road_relation` | 21 | 桥隧 ↔ 路网边绑定。**规则：一条边只能被一个设施占用**，首条为主边并决定统计行政区 |
| `fragility_model` | 8 | 易损性模型（地震桥梁 4 + 地震隧道 2 + 泥石流桥/隧各 1），存对数正态中位值 θ、离散度 β、适用 IM 类型与来源标注 |
| `analysis_task` | 2 | 分析任务（`module_type` = HEAVY / DISASTER / RESILIENCE，输入快照 JSON） |
| `analysis_result` | 51 | 分析结果（输出 JSON，宽表不拆，便于新模块先落地再规范化） |

**约定**：新模块的输入输出**先放进 `analysis_task.input_json` / `analysis_result.result_json`**，等口径稳定后再拆专业表；每次写入保留 `import_batch` 审计行与数据版本递增的思路（见 `docs/database.md`）。

**脚本说明**

- `database/schema.sql`：10 张表的标准建表脚本（建空库用这个）
- `database/maintenance/`：**演进脚本，最值得读**——易损性平台字段、桥隧与路网边互斥绑定、损伤等级口径规范化、仪表盘示例数据、模型种子
- `database/validation/check_database.sql`：数据完整性自检
- `database/handoff/`：本次全量导出（结构与数据）

---

## 5. 接口清单

| 前缀 | 主要端点 | 用途 |
|---|---|---|
| `/api` | `/dashboard/bootstrap`、`/map/regions`、`/map/roads`、`/map/assets` | 首页大屏与地图数据 |
| `/api/disaster` | `/bootstrap`、`/evaluate`、`/save`、`/tasks/{id}`、`/models/{id}/curves`、`/debris-context`、`/parse-ground-motion` | 灾害风险评估全流程 |
| `/api/heavy` | `/evaluate`、`/tasks/{id}` | 重车通行评估 |
| `/api/resilience` | `/bootstrap`、`/evaluate`、`/tasks/{id}` | 路网韧性评估（当前为演示实现） |
| `/api/assistant` | `/chat` | 数字人助手（大模型，失败自动降级） |
| `/api/admin` | `/summary`、`/regions`、`/road-nodes`、`/roads`、`/road-options`、`/assets`、`/analysis-tasks` | 数据管理 CRUD |

详细字段见 `docs/api.md`。

---

## 6. 前端地图组件约定（改图必读）

`src/components/TransportMap.vue` 是全站唯一地图组件，各页面通过 props 决定显示什么：

- **底图**：`defaultBase` = `satellite` / `electronic` / `administrative`（无瓦片）
- **叠加层**：`regions`（区县 GeoJSON）、`roads`（路网 GeoJSON）、`assets`（桥隧标记）、`epicenter`（灾害源与影响圈）
- **结果着色**：`roadResults` —— 按 `roadEdgeId` 匹配，`status` 映射四色：`BLOCKED #ff5669` / `CONDITIONAL #efd253` / `REDUCED #ff9748` / `PASS #35da87`；无结果的路用中性蓝灰 `#8fb4cf`（表示"存在但无信息"）
- **参照层**：`outlineRegions` 开启时区县只用**灰白虚线轮廓**（`#9aa8b6`，dash 5 4），不带填充，避免与数据层抢色
- **交互**：`interactiveRegions=false` 时区县多边形不拦截点击（灾害页拾取震源依赖这一点）；`pickMode` 控制点选态
- **暴露方法**：`zoomIn / zoomOut / reset / focus / setBase / toggleLayer / drawRoutes / selectRegion`

**图层语义约定**：底图（中性）< 参照层（去彩色虚线）< 数据层（唯一允许彩色编码）< 突发层（高饱和橙红）。新增指标着色请沿用这个顺序，并配图例。

---

## 7. 接一个新模块的三个落点

1. **建表/改表**：SQL 一律写成文件放进 `database/`（命名参考 `maintenance/` 风格），不要只改数据库；
2. **业务代码**：`controller` 只做入参解析与返回，算法写在 `service/`，落库走 `AnalysisStore`；
3. **前端**：页面放 `src/views/`，复用 `TransportMap`，指标着色通过 `roadResults` 传入而不是改组件内部。

---

## 8. 已知简化：不要当作方法基准

- **重车通行**：结果是规则检查 + 示例路线，不构成路径优化结论；
- **路网韧性**：`ResilienceService` 内 `accessibility=0.91 / retention=0.78 / efficiency=0.82` 等为硬编码常量，仅用于演示交互；
- **泥石流**：参数化简化模型（推理公式 + 曼宁公式 + 加权强度指标），`fragility_model` 中泥石流曲线的 θ/β 标注为"待标定"；
- **地震**：易损性曲线为冻结研究库参数，未按桥型/年代/场地分类细化；
- **大模型取数**：模型自评置信度普遍偏低，结果仅供参考，不可当实测值；
- 无鉴权、无异步任务、无成果导出——这三项是合同待办，不是设计取舍。

---

## 9. 本包未包含的内容

| 未包含 | 原因 |
|---|---|
| `模块开发/` 外部方法包（`Seismic_Frontend_Fragility_Handoff_V1`、`路网韧性_程序网页工具代码_20261021`） | 专业算法口径的权威依据，体积 19 MB，需另行索要；**开发灾害/韧性算法前必须先读它** |
| `node_modules/`、`dist/`、`backend/target/` | 可再生成；且 `dist/` 会把地图 token 内联进产物 |
| `.env.development` / `.env.production` / `.env.llm.local` | 含 Bigemap token 与大模型密钥，不对外提供；请用 `.env.example` 自备 |
| `database/backups/` | 历史任务数据快照，与当前口径无关 |

如需复现线上环境，部署步骤见 `DEPLOYMENT.md`（前端 Nginx 静态托管 + `/api` 反代、后端 systemd、Bigemap 走 Docker）。
