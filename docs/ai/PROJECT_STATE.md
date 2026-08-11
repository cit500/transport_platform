# PROJECT_STATE.md — 交通网络安全韧性评估及可视化决策平台

> 最后更新: 2026-08-10 (V1.4F + DM-1 + HOME-1A + HOME-2 + HOME-2B 完成)

---

## 技术架构

| 层 | 技术 |
|----|------|
| 前端 | Vite 5.4, Leaflet 1.9, ECharts 6.1, Chart.js 4.4 |
| 后端 | Spring Boot 3.2.5, Java 17, Spring Data JPA, hibernate-spatial |
| 数据库 | MySQL 8.0, plant_platform 库 |
| 地图 | CARTO/ArcGIS 瓦片底图, Bigemap 本地服务(待切换) |
| 通信 | Vite proxy → Spring Boot :8080 → MySQL |

---

## 已冻结版本

| 版本 | 内容 | 状态 |
|------|------|------|
| V1.1 | 37行政区主数据 (administrative_divisions + aliases) | ✅ 冻结 |
| V1.2 | division_current_status + Overview API + 前端联动 | ✅ 冻结 |
| V1.3A | 路网数据调查 + Schema 设计 | ✅ 冻结 |
| V1.3B | road_nodes(8488) + road_edges(11742) 建表导入 | ✅ 冻结 |
| V1.3C | 路网统计 + DivisionOverview.roadSummary | ✅ 冻结 |
| V1.3D | 路网 API + DataManagement + 地图数据源切换 | ✅ 冻结 |
| V1.4A | 桥隧现状调查 + 数据管理架构设计 | ✅ 冻结 |
| V1.4B | 正式桥隧资产体系 + Asset API + DataManagement 重构 | ✅ 冻结 |
| V1.4C | 人工新增/编辑 + Road Edge绑定 + Current Status CRUD | ✅ 冻结 |
| V1.4D | 候选提取 + 候选审核 UI | ✅ 冻结 |
| V1.4E | 正式资产地图可视化 + AssetDetailWindow + DivisionOverview.assetSummary | ✅ 冻结 |
| V1.4F | 正式桥隧数据源收口 + HeavyVehicle接入transport_assets | ✅ 冻结 |
| DM-1 | 后台数据管理功能完善 + 桥隧正式档案录入流程修正 | ✅ 冻结 |
| HOME-1A | 首页数据源正式化检查 + 区县概况完整37区展示 | ✅ 完成 |
| HOME-2 | 首页总览与空间态势大屏重构 + 正式数据同步 + 桥隧图片上传 + Road/Asset交互完善 | ✅ 完成 |
| HOME-2B | 首页自适应满屏布局 + 正式Asset联动修复 + Seed状态数据补充 | ✅ 完成 |

---

## V1.1 行政区主数据

- **表**: `administrative_divisions` (37 rows), `administrative_division_aliases` (6 rows)
- **Entity**: AdministrativeDivision, AdministrativeDivisionAlias
- **名称体系**: canonical_name (全称), display_name (简称), division_key (编码)
- **空间数据**: GEOMETRY POINT/POLYGON SRID 4326
- **Seed**: data.sql UPSERT 模式, 每次启动执行
- **导入工具**: scripts/import-administrative-divisions.cjs

## V1.2 行政区当前状态

- **表**: `division_current_status` (37 rows)
- **字段**: resilience_score, disaster_risk_rate, traffic_guarantee_rate, risk_level, source_type
- **API**: GET /api/administrative-divisions/overview (37区聚合)
- **写入**: PUT /api/administrative-divisions/{id}/current-status
- **前端**: AdminDivisionLayer, LeftPanel, RightPanel 统一使用 Overview API
- **原则**: 不 fallback 到 mockData.districtMetrics

## V1.3 真实路网

### 数据

| 表 | 记录 | 说明 |
|----|------|------|
| road_nodes | 8,488 | OSM 节点, osmid 唯一, geom POINT SRID 4326 |
| road_edges | 11,742 | 路段, (source_u_osmid, source_v_osmid, edge_key) 唯一 |

### 关键指标

- assignedEdgeCount: 11,736 (division_id 非空)
- unassignedEdgeCount: 6 (边界路段, 无可归属行政区)
- edgeLengthKm: 24,904.92 km
- bridgeEdgeCount: 5,090 (is_bridge=1)
- tunnelEdgeCount: 868 (is_tunnel=1)

### API

| 端点 | 功能 |
|------|------|
| GET /api/road-network/edges | 分页查询 (支持 keyword/divisionId/highway/isBridge/isTunnel) |
| GET /api/road-network/edges/{id} | 详情 (含 GeoJSON Geometry) |
| GET /api/road-network/geojson | FeatureCollection (11742 Feature) |
| GET /api/road-network/summary | 全局统计 |

### 前端

- 地图路网图层: 从 API 加载 (不 fallback 到本地 GeoJSON)
- DataManagement 路网 Tab: 从 API 分页查询
- road-edge-selected 事件: 地图 ↔ DM 联动
- roadSummary: edgeCount + edgeLengthKm (DivisionOverview)

### 坐标规则

- MySQL SRID 4326: ST_X=latitude, ST_Y=longitude
- GeoJSON: [longitude, latitude]
- WKT: POINT(latitude longitude)
- ST_AsGeoJSON 在 SQL 层转换, 避免 JTS 反序列化问题

---

## V1.4A 桥隧现状

### 数据源 (4套)

| 数据源 | 记录 | 状态 |
|--------|------|------|
| bridges 表 (MySQL) | 8 | Legacy — type 混合资产+结构类型 |
| bridge_archives 表 (MySQL) | 8 | Legacy — 与 bridges 重复 |
| bridgeArchives (mockData.js) | 8 | Mock — 字段最丰富 |
| road_edges.is_bridge/is_tunnel | 5,090 + 868 | 正式 — 路网 Edge 桥隧标记 |

### 地图 Marker 驱动

bridges 表 (8条) → addAllBridgeMarkers() → Leaflet Marker → BridgeDetailWindow

### 重车模块

Mock/手动添加 → 内存临时数据 → 不绑定 Road Edge

### road_edges 候选特征

- Bridge Edge: name 多为高速名 (非具体桥梁名), 需拓扑聚类
- Tunnel Edge: 同上
- 候选提取规则: 按 (name + ref + division_id) 分组, 每组作为候选

---

## 当前 Legacy 数据

| 数据 | 表/来源 | 记录 | 处理 |
|------|---------|------|------|
| bridges | MySQL | 8 | 保留, 不扩展 |
| bridge_archives | MySQL | 8 | 保留, 不扩展 |
| bridgeArchives | mockData.js | 8 | 保留, 不扩展 |
| road_network | MySQL | 5 | 保留, 不扩展 |
| road_archives | MySQL | 5 | 保留, 不扩展 |
| county_bridge_counts | MySQL | 15 | 保留, 不扩展 |
| county_resilience_scores | MySQL | 15 | 保留, 不扩展 |

## 当前正式数据源

| 数据 | 表 | 记录 | 驱动 |
|------|-----|------|------|
| 行政区 | administrative_divisions | 37 | 地图/LeftPanel/RightPanel/Overview |
| 行政区别名 | administrative_division_aliases | 6 | 名称解析 |
| 行政区状态 | division_current_status | 37 | Overview API |
| 路网节点 | road_nodes | 8,488 | 路网拓扑 |
| 路网路段 | road_edges | 11,742 | 地图/DM/统计 |
| 正式资产 | transport_assets | 8 | 桥隧资产库 |
| 桥梁属性 | bridge_attributes | 5 | 资产详情 |
| 隧道属性 | tunnel_attributes | 3 | 资产详情 |
| 资产状态 | asset_current_status | 8 | 健康评分/风险 |
| 资产道路关联 | asset_road_relations | 0 | 道路绑定 |
| 资产候选 | asset_candidates | 0 | 待审核 |
| 候选Edge关联 | asset_candidate_edges | 0 | 候选关联 |

---

## 重要设计原则

1. **division_id 是正式关联键** — 不以 district_name 作为数据库关联
2. **不 fallback 到 mockData** — API 不可用时显示 `--` 或空数组
3. **Legacy 表保留不删除** — 但不作为正式页面数据源
4. **种子数据单一来源** — data.sql UPSERT 模式
5. **Geometry 顺序** — MySQL SRID 4326 需要坐标交换
6. **N+1 防止** — 批量查询 + GROUP BY, 不逐条查询
7. **幂等导入** — 重复执行不产生重复数据
8. **roadSummary 口径** — edgeLengthKm = SUM(length_m)/1000, 非物理里程

---

## V1.4B 完成内容

### 建表 (7张)

| 表 | 职责 | 状态 |
|----|------|------|
| transport_assets | 正式资产主表 (bridge/tunnel) | ✅ 已建 |
| bridge_attributes | 桥梁特有属性 | ✅ 已建 |
| tunnel_attributes | 隧道特有属性 | ✅ 已建 |
| asset_current_status | 当前状态 (health_score/truck_pass_status) | ✅ 已建 |
| asset_road_relations | 道路绑定 (asset ↔ edge) | ✅ 已建 |
| asset_candidates | 待审核候选 | ✅ 已建 |
| asset_candidate_edges | 候选 Edge 关联 | ✅ 已建 |

### Seed 数据 (V1.4C 修复后)

| 资产编码 | 类型 | 名称 | 行政区 | 绑定状态 |
|----------|------|------|--------|----------|
| BRIDGE-CQ-001 | 桥梁 | 重庆石板坡长江大桥 | 渝中区 | UNBOUND |
| BRIDGE-CQ-002 | 桥梁 | 重庆朝天门长江大桥 | 渝中区 | UNBOUND |
| BRIDGE-CQ-003 | 桥梁 | 重庆鱼洞长江大桥 | 巴南区 | UNBOUND |
| BRIDGE-CQ-004 | 桥梁 | 重庆菜园坝长江大桥 | 渝中区 | UNBOUND |
| BRIDGE-CQ-005 | 桥梁 | 重庆嘉华大桥 | 渝中区 | UNBOUND |
| TUNNEL-CQ-001 | 隧道 | 重庆中梁山隧道 | 沙坪坝区 | UNBOUND |
| TUNNEL-CQ-002 | 隧道 | 重庆明月山隧道 | 万州区 | UNBOUND |
| TUNNEL-CQ-003 | 隧道 | 重庆铜锣山隧道 | 南岸区 | UNBOUND |

### Asset API

| 端点 | 功能 |
|------|------|
| GET /api/assets | 分页查询 (支持 assetType/divisionId/keyword/sourceType/bindingStatus) |
| GET /api/assets/{id} | 详情 (合并 basicInfo/attributes/status/roadRelations) |
| GET /api/assets/summary | 统计摘要 (bridgeCount/tunnelCount/byBindingStatus/unboundCount) |
| GET /api/assets/candidates | 待审核候选查询 |
| GET /api/assets/candidates/stats | 候选统计 |

### DataManagement 一级结构

| Tab | 功能 | 数据源 |
|-----|------|--------|
| 📊 数据总览 | 统计卡片 | /api/assets/summary + /api/road-network/summary |
| 🏘️ 行政区域 | 区县表格 | /api/administrative-divisions/overview |
| 🛣️ 路网数据 | Edge 分页 | /api/road-network/edges |
| 🌉 桥梁隧道 | 正式资产 + 候选 | /api/assets |
| 🌊 灾害事件 | 页面框架 | 暂无数据 |
| 📊 分析任务 | 页面框架 | 暂无数据 |
| 🔍 数据质量 | 统计检查 | /api/assets/summary + /api/road-network/summary |

### 新增/修改文件

| 文件 | 类型 |
|------|------|
| backend/.../model/TransportAsset.java | 新增 |
| backend/.../model/BridgeAttributes.java | 新增 |
| backend/.../model/TunnelAttributes.java | 新增 |
| backend/.../model/AssetCurrentStatus.java | 新增 |
| backend/.../model/AssetRoadRelation.java | 新增 |
| backend/.../model/AssetCandidate.java | 新增 |
| backend/.../model/AssetCandidateEdge.java | 新增 |
| backend/.../repository/TransportAssetRepository.java | 新增 |
| backend/.../repository/BridgeAttributesRepository.java | 新增 |
| backend/.../repository/TunnelAttributesRepository.java | 新增 |
| backend/.../repository/AssetCurrentStatusRepository.java | 新增 |
| backend/.../repository/AssetRoadRelationRepository.java | 新增 |
| backend/.../repository/AssetCandidateRepository.java | 新增 |
| backend/.../repository/AssetCandidateEdgeRepository.java | 新增 |
| backend/.../dto/AssetListDTO.java | 新增 |
| backend/.../dto/AssetDetailDTO.java | 新增 |
| backend/.../dto/AssetSummaryDTO.java | 新增 |
| backend/.../dto/CandidateListDTO.java | 新增 |
| backend/.../service/AssetService.java | 新增 |
| backend/.../controller/AssetController.java | 新增 |
| backend/src/main/resources/data.sql | 修改 (新增 Seed) |
| src/api/index.js | 修改 (新增 API) |
| src/components/DataManagementModule.js | 修改 (重构 Tab) |

### Legacy 保持不变

| 表 | 状态 |
|----|------|
| bridges | 保留, 不扩展 |
| bridge_archives | 保留, 不扩展 |
| bridgeArchives (mockData.js) | 保留, 不扩展 |
| county_bridge_counts | 保留, 不扩展 |
| county_resilience_scores | 保留, 不扩展 |

---

## V1.4C 完成内容

### 核心变更

1. **Seed 绑定状态修复**: 将所有 Seed 资产的 `network_binding_status` 统一改为 `UNBOUND`，消除与 `asset_road_relations` 表的不一致
2. **人工新增 API**: `POST /api/assets` 支持一次性提交基本信息 + 属性 + 状态 + 道路绑定
3. **编辑 API**: `PUT /api/assets/{id}` 支持更新所有字段
4. **道路绑定 API**: `PUT /api/assets/{id}/edges` 支持绑定/解绑道路边
5. **前端 UI**: DataManagement 桥梁隧道 Tab 新增"新增桥梁/隧道"按钮，支持创建和编辑资产

### 新增 Asset API

| 端点 | 功能 |
|------|------|
| POST /api/assets | 创建资产 (事务: transport_assets → attributes → current_status → road_relations) |
| PUT /api/assets/{id} | 更新资产 (事务: 同上) |
| GET /api/assets/{id}/edges | 获取资产绑定的道路 |
| PUT /api/assets/{id}/edges | 更新资产绑定的道路 (事务) |

### 新增文件

| 文件 | 类型 |
|------|------|
| backend/.../dto/AssetCreateDTO.java | 新增 (创建/更新请求 DTO) |

### 修改文件

| 文件 | 变更 |
|------|------|
| backend/.../service/AssetService.java | 新增 createAsset, updateAsset, updateRoadEdges, syncBindingStatus |
| backend/.../controller/AssetController.java | 新增 POST, PUT, edges 端点 |
| backend/src/main/resources/data.sql | 修复 Seed 绑定状态 |
| src/api/index.js | 新增 createAsset, updateAsset, updateAssetEdges, getAssetEdges |
| src/components/DataManagementModule.js | 新增创建/编辑表单 UI, 编辑按钮 |

### 绑定状态一致性规则

- `asset_road_relations` 数量 = 0 → `UNBOUND`
- `asset_road_relations` 数量 > 0 → `BOUND`
- `PARTIAL` 枚举保留但当前不使用
- 每次道路绑定变更后自动同步 `network_binding_status`

### 状态枚举

| 字段 | 值 |
|------|-----|
| asset_type | BRIDGE, TUNNEL |
| risk_level | LOW, MEDIUM, HIGH, EXTREME |
| pass_status | NORMAL, RESTRICTED, BLOCKED, UNKNOWN |
| network_binding_status | BOUND, UNBOUND, PARTIAL |

---

## V1.4D 完成内容

### 核心变更

1. **拓扑候选提取**: 基于 `is_bridge`/`is_tunnel` + Connected Components 算法自动提取候选
2. **候选幂等**: `candidate_key` UNIQUE 字段，重复提取不产生重复候选
3. **候选审核**: 支持确认 (→ 正式 Asset) 和忽略操作
4. **事务转换**: 确认候选时一次性创建完整 Asset (含属性、状态、道路绑定)
5. **前端 UI**: DataManagement 桥梁隧道 Tab 新增候选列表、提取弹窗、查看/确认/忽略操作

### 拓扑提取算法 (TOPOLOGY_V1)

| 步骤 | 说明 |
|------|------|
| 1. 筛选 | `is_bridge=true` 或 `is_tunnel=true` |
| 2. 构图 | 以 `source_u_osmid` / `source_v_osmid` 构建无向邻接表 |
| 3. 聚类 | BFS 寻找 Connected Components |
| 4. 幂等 | `candidate_key = TYPE:<SHA-256 of sorted edgeIds>` |
| 5. 属性 | 行政区: 所有 Edge 同一 division → 该 division, 否则 NULL |
| 6. 名称 | 优先使用含"桥/隧道/高架"的 name, 否则 "道路ref + 桥梁候选" |
| 7. 置信度 | 基础 0.5 + 设施名称 0.2 + Edge 数量 0.1 + name 一致性 0.1 |

### 新增 Asset API

| 端点 | 功能 |
|------|------|
| POST /api/assets/candidates/extract | 提取候选 (支持 candidateType, divisionId, roadRef) |
| GET /api/assets/candidates/{id} | 候选详情 (含源 Edge 列表) |
| POST /api/assets/candidates/{id}/confirm | 确认候选 → 创建正式 Asset (事务) |
| POST /api/assets/candidates/{id}/ignore | 忽略候选 |

### 新增文件

| 文件 | 类型 |
|------|------|
| backend/.../dto/CandidateDetailDTO.java | 新增 (候选详情 DTO) |

### 修改文件

| 文件 | 变更 |
|------|------|
| backend/.../model/AssetCandidate.java | 新增 candidateKey 字段 |
| backend/.../service/AssetService.java | 新增 extractCandidates, getCandidateDetail, confirmCandidate, ignoreCandidate |
| backend/.../controller/AssetController.java | 新增 extract, detail, confirm, ignore 端点 |
| backend/.../repository/RoadEdgeRepository.java | 新增 findByIsBridgeTrue, findByIsTunnelTrue |
| backend/.../repository/AssetCandidateRepository.java | 新增 existsByCandidateKey |
| src/api/index.js | 新增 extractCandidates, getCandidateDetail, confirmCandidate, ignoreCandidate |
| src/components/DataManagementModule.js | 新增候选列表、提取弹窗、查看/确认/忽略 UI |

### 候选覆盖率目标

- `uncoveredEdgeCount` = 0 (每个符合条件的 Edge 恰好进入一个 Candidate)
- `duplicateCoveredEdgeCount` = 0

### Data Management 候选页

| 功能 | 状态 |
|------|------|
| 提取弹窗 (类型/行政区/道路编号) | ✅ 已实现 |
| 候选列表 (ID/类型/名称/行政区/Edge数/长度/可信度) | ✅ 已实现 |
| 查看详情 (含源 Edge 列表) | ✅ 已实现 |
| 确认创建 Asset (预填表单) | ✅ 已实现 |
| 忽略候选 | ✅ 已实现 |

---

## V1.4E 完成内容

### 核心变更

1. **正式资产 GeoJSON API**: `GET /api/assets/geojson` 返回标准 FeatureCollection
2. **正式资产地图图层**: 新增 `formalAssetLayer` 图层，支持桥梁/隧道 Marker 显示
3. **AssetDetailWindow.js**: 新建正式资产详情窗口组件
4. **asset-selected 事件**: 统一资产选择事件协议
5. **DivisionOverview.assetSummary**: 37区均包含正式资产统计
6. **AssetSummaryDTO 增强**: 新增 highRiskCount, restrictedCount, blockedCount, missingGeometryCount

### 新增 Asset API

| 端点 | 功能 |
|------|------|
| GET /api/assets/geojson | 正式资产 GeoJSON FeatureCollection (只返回有 Geometry 的 active 资产) |

### 新增文件

| 文件 | 类型 |
|------|------|
| src/components/AssetDetailWindow.js | 新增 (正式资产详情窗口) |

### 修改文件

| 文件 | 变更 |
|------|------|
| backend/.../service/AssetService.java | 新增 getAssetsGeoJson, 增强 getSummary |
| backend/.../controller/AssetController.java | 新增 GET /api/assets/geojson |
| backend/.../dto/AssetSummaryDTO.java | 新增 highRiskCount, restrictedCount, blockedCount, missingGeometryCount |
| backend/.../service/DivisionOverviewService.java | 新增资产统计填充 (assetSummary) |
| src/api/index.js | 新增 getAssetsGeoJson |
| src/utils/mapUtils.js | 新增 formalAssetLayer, loadFormalAssetLayer, toggleFormalAssetLayer |
| src/main.js | 新增 asset-selected 事件监听 |
| src/components/DataManagementModule.js | 更新 __dmViewAsset 使用 AssetDetailWindow, 更新 __dmLocateAsset |

### 地图图层

| 图层 | 数据源 | 状态 |
|------|--------|------|
| 桥梁 (Legacy) | bridges 表 (8条) | 保留, 不作为正式数据源 |
| 正式资产 | GET /api/assets/geojson | ✅ 已实现 |
| 路网 | GET /api/road-network/geojson | ✅ 已实现 |

### asset-selected 事件协议

```javascript
{
  assetId: number,    // 资产 ID
  source: string,     // 来源: 'map' | 'data-management' | 'detail'
  lat?: number,       // 纬度 (可选)
  lng?: number        // 经度 (可选)
}
```

### DivisionOverview.assetSummary

| 字段 | 说明 |
|------|------|
| bridgeCount | 桥梁数量 |
| tunnelCount | 隧道数量 |
| totalAssetCount | 总资产数量 |
| highRiskCount | 高风险资产数量 (risk_level IN HIGH, EXTREME) |

### Data Quality

| 检查项 | 说明 |
|--------|------|
| 缺少 Geometry Asset | geom IS NULL 或 longitude/latitude IS NULL |
| 缺少行政区 Asset | division_id IS NULL |

---

## V1.4F 完成内容

### 核心变更

1. **正式桥隧数据源收口**: 首页/区县统计统一使用 Asset Summary API
2. **HeavyVehicle 接入正式 Asset**: 通过 Road Edge ID 查询沿线正式桥隧资产
3. **通行判定 V1**: 使用 AssetCurrentStatus.passStatus 进行通行判定
4. **blockedAssetIds/blockedEdgeIds**: 不可通行资产映射到 Road Edge

### 新增 Asset API

| 端点 | 功能 |
|------|------|
| POST /api/assets/by-road-edges | 按 Road Edge ID 列表查询关联的正式资产 |

### 新增文件

| 文件 | 类型 |
|------|------|
| backend/.../dto/AssetByRoadEdgesRequest.java | 新增 (请求 DTO) |
| backend/.../dto/AssetByRoadEdgesDTO.java | 新增 (响应 DTO) |

### 修改文件

| 文件 | 变更 |
|------|------|
| backend/.../service/AssetService.java | 新增 getAssetsByRoadEdges 方法 |
| backend/.../controller/AssetController.java | 新增 POST /api/assets/by-road-edges 端点 |
| src/api/index.js | 新增 getAssetsByRoadEdges 方法 |
| src/components/HeavyVehicleModule.js | 接入正式 Asset, 通行判定, blockedEdgeIds |
| src/components/LeftPanel.js | 首页/区县统计使用 Asset Summary |

### HeavyVehicle 正式化

| 功能 | 变更 |
|------|------|
| 路线设置 | 新增 routeEdgeIds 输入框 |
| 设施搜索 | 支持从正式 Asset 查询 |
| 通行判定 | 使用 AssetCurrentStatus.passStatus |
| 不可通行映射 | blockedAssetIds + blockedEdgeIds |

### 通行判定规则

| passStatus | 判定 |
|------------|------|
| CLOSED/BLOCKED | 不可通行 |
| RESTRICTED | 结合当前限制参数判断 |
| OPEN/NORMAL | 正常通行 (如有限制参数则检查) |
| UNKNOWN | 需人工确认 |

### 首页/区县统计迁移

| 功能 | 数据源 |
|------|--------|
| 桥隧资产数量 | Asset Summary API |
| 区县桥隧排行 | DivisionOverview.assetSummary |
| 通行状态统计 | Asset Summary API |

### Legacy 保持不变

| 表 | 状态 |
|----|------|
| bridges | 保留, 不作为正式数据源 |
| bridge_archives | 保留 |
| mockData.bridgeArchives | 保留 |
| county_bridge_counts | 保留 |

---

## HOME-1A 完成内容

### 核心变更

1. **区县概况完整展示**: 显示全部37个行政区，0资产区显示0
2. **风险排名数据源修复**: 不再 fallback 到 mockData
3. **数据源指示器文案**: 后端离线时显示"🟡 后端数据服务离线"

### 首页数据源审计

| 首页元素 | 数据源 | 状态 |
|----------|--------|------|
| Header时钟/天气 | 本地生成 | ✅ 允许 |
| 数据源指示器 | checkBackendFast | ✅ 正式 |
| 区域总览 (asset-grid) | DivisionOverview + AssetSummary | ✅ 正式 |
| 区县概况 (county-bridge-list) | DivisionOverview (全部37区) | ✅ 正式 |
| 重车通行状态 (truck-overview) | AssetSummary | ✅ 正式 |
| 韧性指标 (gauge-value) | DivisionOverview | ✅ 正式 |
| 区县韧性与通行 (county-resilience-list) | DivisionOverview | ✅ 正式 |
| 风险信息 (weakness-list) | getRiskRankings → weak_rankings 表 | ✅ 正式 (MySQL) |
| 平台任务日志 (alert-table) | getAssessmentTaskLogs → 预留数据 | ✅ 允许预留 |
| 控制节点 | 硬编码"--" | ✅ 无数据来源 |

### 不再使用的 Legacy 数据源

| Legacy 数据 | 状态 |
|-------------|------|
| districtMetrics | ❌ 不再用于首页指标 |
| county_bridge_counts | ❌ 不再用于首页指标 |
| mockData.bridgeArchives | ❌ 不再用于首页指标 |
| bridges (API fallback) | ❌ 不再用于首页指标 |

---

## HOME-2 完成内容

### 核心变更

1. **首页布局重构**: 保持左中右结构，重新设计6个Panel
2. **主题色统一**: 主色 #142E66，标题白色，字号层级化
3. **正式数据同步**: 所有Panel使用正式API数据，API不可用时显示"--"
4. **桥隧图片上传**: 支持jpg/png/webp，≤10MB，服务器存储
5. **Road/Asset交互完善**: Road Edge Popup增加行政区/长度，Road→Asset自动预填
6. **图层管理重组**: 底图4选1 + 业务图层独立多选

### 首页Panel结构

| 位置 | Panel | 数据源 |
|------|-------|--------|
| 左1 | 区域总览 (2×2) | /api/road-network/summary + /api/assets/summary |
| 左2 | 区域风险概况 (柱状图) | /api/administrative-divisions/overview |
| 左3 | 重车通行概况 (双环形图) | /api/assets/summary |
| 右1 | 核心功能模块 (4按钮) | 本地配置 |
| 右2 | 区域灾害韧性概况 (表格) | /api/administrative-divisions/overview |
| 右3 | 桥隧状态监控 (选中Asset) | /api/assets/{id} |
| 中下 | 平台任务与评估日志 | 暂空 (折叠Panel) |

### 新增 Asset API

| 端点 | 功能 |
|------|------|
| POST /api/assets/{id}/image | 上传资产图片 (multipart/form-data) |

### AssetSummaryDTO 增强字段

| 字段 | 说明 |
|------|------|
| bridgeNormalCount | 桥梁可通行数量 |
| bridgeRestrictedCount | 桥梁受限数量 |
| bridgeBlockedCount | 桥梁不可通行数量 |
| bridgeUnknownCount | 桥梁状态未知数量 |
| tunnelNormalCount | 隧道可通行数量 |
| tunnelRestrictedCount | 隧道受限数量 |
| tunnelBlockedCount | 隧道不可通行数量 |
| tunnelUnknownCount | 隧道状态未知数量 |

### TransportAsset 新增字段

| 字段 | 说明 |
|------|------|
| image_path | 资产图片路径 (服务器相对URL) |

### 图层管理结构

| 组 | 类型 | 选项 |
|----|------|------|
| 底图 | 互斥单选 | 暗色底图, 卫星影像, 电子地图(Bigemap), 卫星地图(Bigemap) |
| 业务图层 | 独立多选 | 行政区划(默认开), 高速/快速路网, 显示桥梁隧道 |

### Road Edge Popup 增强

| 字段 | 来源 |
|------|------|
| 道路名称 | properties.name |
| Edge ID | properties.edgeId |
| 道路编号 | properties.ref |
| 道路等级 | properties.highway |
| 行政区 | properties.divisionName |
| 长度 | properties.lengthM (<1000m显示xxx m，≥1000m显示x.xx km) |
| 桥梁路段 | properties.isBridge |
| 隧道路段 | properties.isTunnel |
| [添加为桥梁] | → 打开Asset创建表单，预填edgeId/divisionId/坐标 |
| [添加为隧道] | → 打开Asset创建表单，预填edgeId/divisionId/坐标 |

### 修改文件

| 文件 | 变更 |
|------|------|
| src/style.css | 主题色#142E66，标题白色，字号层级，任务Panel样式 |
| index.html | 6个Panel结构，图层管理分组，任务折叠Panel |
| src/components/LeftPanel.js | 重写: 区域总览+风险柱状图+通行环形图 |
| src/components/RightPanel.js | 重写: 核心功能4按钮+韧性表格+桥隧监控 |
| src/main.js | 任务折叠Panel，refreshDashboardData，事件处理简化 |
| src/utils/mapUtils.js | Road Popup增强，Road→Asset函数，Asset图层重构 |
| src/components/AdminDivisionLayer.js | Hover增加桥隧总数 |
| src/api/index.js | 新增 uploadAssetImage |
| src/components/DataManagementModule.js | 图片上传，Road→Asset预填，关闭时刷新 |
| backend/.../model/TransportAsset.java | 新增 imagePath 字段 |
| backend/.../dto/AssetDetailDTO.java | 新增 imagePath 字段 |
| backend/.../dto/AssetSummaryDTO.java | 新增8个通行状态统计字段 |
| backend/.../service/AssetService.java | 新增 updateImagePath，通行状态分类统计 |
| backend/.../controller/AssetController.java | 新增图片上传端点 |
| backend/.../config/WebMvcConfig.java | 新增静态资源映射 |
| backend/.../resources/application.yml | 新增上传目录配置 |

### 首页数据刷新机制

| 触发时机 | 调用 |
|----------|------|
| 首次进入首页 | initLeftPanel + initRightPanel |
| 从任何模块返回首页 | refreshDashboardData() |
| DataManagement完成数据修改 | dataAssetUpdated 事件 → refreshDashboardData() |
| 地图点击Asset | asset-selected 事件 → 右侧监控Panel更新 |

### 非阻塞项

| 问题 | 状态 |
|------|------|
| 风险柱状图高级Tooltip效果 | 非核心，可后续优化 |
| Panel过渡动画 | 非核心，可后续优化 |
| 图片裁切样式 | 非核心，可后续优化 |
| 路网韧性评估模块入口 | 预留按钮，功能开发中 |

---

## HOME-2B 完成内容

### 核心变更

1. **自适应满屏布局**: 三列从Header延伸至页面底部，无大片空白
2. **正式Asset联动修复**: 移除Legacy Marker，formalAssetLayer点击→RightPanel监控
3. **Seed状态数据补充**: OPEN→NORMAL/RESTRICTED/BLOCKED 三分类，通行图表有效

### 布局改进

| 项目 | 旧值 | 新值 |
|------|------|------|
| --bottom-alert-h | clamp(110px,24vh,250px) | 42px (仅任务Panel标题栏) |
| 任务Panel默认 | 可能展开 | 强制收起 |
| 左侧Panel比例 | 固定px | 0.9fr/1.05fr/1.25fr |
| 右侧Panel比例 | 固定px | 0.8fr/1.25fr/1.35fr |
| 地图容器bottom | 含大块bottom-alert-h | 直接到任务Panel标题栏 |

### Legacy Marker 移除

- `addAllBridgeMarkers()` 从首页启动链中移除
- 首页只使用 `loadFormalAssetLayer()` (GET /api/assets/geojson)
- Legacy代码保留，但不在首页运行

### Asset联动修复

| 环节 | 修复 |
|------|------|
| 事件注册 | `initAssetMonitor` 添加一次性标志，防重复注册 |
| 点击链路 | formalAssetLayer Marker click → dispatchEvent('asset-selected') → RightPanel |
| 右侧监控 | 收到事件后 GET /api/assets/{id} → 更新Panel |
| 保持状态 | 选择A后关闭Popup，右侧仍显示A |

### Seed 状态数据

| 资产 | 旧pass_status | 新pass_status |
|------|--------------|--------------|
| BRIDGE-CQ-001 | OPEN | NORMAL |
| BRIDGE-CQ-002 | OPEN | RESTRICTED |
| BRIDGE-CQ-003 | OPEN | NORMAL |
| BRIDGE-CQ-004 | OPEN | BLOCKED |
| BRIDGE-CQ-005 | OPEN | NORMAL |
| TUNNEL-CQ-001 | OPEN | NORMAL |
| TUNNEL-CQ-002 | OPEN | RESTRICTED |
| TUNNEL-CQ-003 | OPEN | BLOCKED |

分布: 桥梁 NORMAL=3 RESTRICTED=1 BLOCKED=1 / 隧道 NORMAL=1 RESTRICTED=1 BLOCKED=1

### 区域总览新增

- 行政区数量(37)横跨2列显示在顶部
- 下方2×2: 路网里程/路网边数/桥梁数量/隧道数量
- 数据源: api.getDivisionOverviews().length

### 修改文件

| 文件 | 变更 |
|------|------|
| src/style.css | --bottom-alert-h:42px，twin-dock/map/search/controls高度重算，Panel flex比例，task-panel底部对齐 |
| src/main.js | 移除addAllBridgeMarkers，添加loadFormalAssetLayer，任务Panel强制收起，window resize handler |
| src/components/LeftPanel.js | 区域总览增加行政区数量，ECharts延迟resize，环形图容器自适应 |
| src/components/RightPanel.js | initAssetMonitor一次性注册标志 |
| index.html | truck-overview容器flex:1，risk-overview-chart容器flex:1 |
| backend/.../resources/data.sql | OPEN→NORMAL/RESTRICTED/BLOCKED 三分类 |

### 非阻塞项

| 问题 | 状态 |
|------|------|
| ECharts resize延迟 | 已加setTimeout(100ms)，极端resize可能需多次 |
| 风险柱状图高级Tooltip | 非核心 |

---

## 下一阶段: V1.5 目标

| 阶段 | 内容 |
|------|------|
| V1.5 | 真实结构计算算法 + 路径优化 |

---

## DM-1 完成内容 (V1.4F 后续)

### 核心变更

1. **DataManagement 一级 Tab 调整**: 从 8 个 Tab 调整为 6 个 Tab（删除"数据质量"）
2. **行政区表格增加 ID**: 显示 divisionId，支持按 ID/韧性/风险/时间排序
3. **行政区排序功能**: 支持 6 个维度排序（ID/韧性指数/灾害风险率/通行保障率/风险等级/更新时间）
4. **行政区 Reset 功能**: 支持单区重置和全部重置到 Seed 数据
5. **路网桥梁/隧道筛选**: 新增 isBridge/isTunnel 筛选条件
6. **从路网添加桥隧**: 替代原来的"提取桥隧候选"按钮
7. **资产名称唯一性检查**: 同类型同名资产不允许重复创建
8. **资产软删除**: 使用 is_active=false 而非物理删除

### DataManagement Tab 结构

| Tab | 功能 | 数据源 |
|-----|------|--------|
| 📊 数据总览 | 统计卡片 | /api/assets/summary + /api/road-network/summary |
| 🏘️ 行政区域 | 区县表格 (支持排序/Reset) | /api/administrative-divisions/overview |
| 🛣️ 路网数据 | Edge 分页 (支持桥梁/隧道筛选) | /api/road-network/edges |
| 🌉 桥梁隧道 | 正式资产 + 候选 | /api/assets |
| 🌊 灾害事件 | 页面框架 | 暂无数据 |
| 📊 分析任务 | 页面框架 | 暂无数据 |

### 新增 API

| 端点 | 功能 |
|------|------|
| POST /api/administrative-divisions/{id}/current-status/reset | 重置单个行政区到种子数据 |
| POST /api/administrative-divisions/current-status/reset | 重置全部37区到种子数据 |
| DELETE /api/assets/{id} | 软删除资产 (设置 is_active=false) |
| POST /api/assets/{id}/restore | 恢复已停用的资产 |
| GET /api/assets/check-duplicate | 检查同类型同名资产是否存在 |

### 修改文件

| 文件 | 变更 |
|------|------|
| backend/.../service/DivisionOverviewService.java | 新增 resetSingleDivision, resetAllDivisions, Seed 基线 |
| backend/.../controller/AdministrativeDivisionController.java | 新增 reset 单区/全区端点 |
| backend/.../service/AssetService.java | 新增 name uniqueness check, soft delete, restore |
| backend/.../controller/AssetController.java | 新增 DELETE/restore/check-duplicate 端点 |
| backend/.../repository/TransportAssetRepository.java | 新增 existsByAssetTypeAndAssetName, softDeleteById |
| src/api/index.js | 新增 deleteAsset, restoreAsset, checkDuplicateAsset |
| src/components/DataManagementModule.js | 重构 Tab 结构, 排序, Reset, 路网筛选, 删除, 从路网添加 |

### 行政区 Seed 基线

- Seed 数据硬编码在 DivisionOverviewService.SEED_BASELINE
- 37 区初始值与 data.sql 中的 division_current_status 一致
- Reset 操作恢复: resilience_score, disaster_risk_rate, traffic_guarantee_rate, risk_level, source_type=SEED

### 资产创建规则

1. **名称必填**: assetName 不能为空
2. **名称唯一性**: 同类型同名资产不允许重复创建
3. **软删除**: 删除操作设置 is_active=false，不物理删除
4. **从路网添加**: 支持选择 Road Edge 后直接创建资产

### 非阻塞项

| 问题 | 状态 |
|------|------|
| Road Edge 地图定位 | 待后续统一 UI 阶段处理 |
| 多选 Edge 视觉优化 | 推荐功能，可后续实现 |

---

## 文件资产

| 文件 | 用途 |
|------|------|
| data.sql | 种子数据 (行政区分+路网不在此) |
| scripts/import-administrative-divisions.cjs | 行政区导入 |
| scripts/import-road-network.cjs | 路网导入 (Node.js 备用) |
| gaosu/data/chongqing_roadnet/*.geojson | 路网原始数据源 |
| public/data/roadnet/*.geojson | 路网 Node GeoJSON |
| docs/ai/PROJECT_STATE.md | 本文件 |
