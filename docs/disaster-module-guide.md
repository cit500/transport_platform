# 灾害风险评估模块 · 实现细节说明

本文描述当前已实现版本的业务逻辑、算法口径、数据表、接口与前端交互，作为后续改造的参考基线。所有描述对应本仓库当前代码，不含尚未接入的内容。

## 1. 模块定位

灾害风险评估模块评估地震与泥石流两类灾害对桥梁、隧道的损伤，并把结论传导到道路通行状态。它是平台中第一个完成专业化改造的分析模块（2026-10-23 融入外部易损性算法，2026-10-24 完成界面重做），其形态可以作为后续模块（如路网韧性）改造的范本。

核心设计原则：

1. **统一链路**：两类灾害走同一条口径，即「强度指标 IM → 易损性曲线 → DS0–DS4 互斥状态概率」，而不是各自造一套严重度标量。
2. **参数外置**：易损性曲线的 θ/β 存在数据库表 `fragility_model` 里，不写进代码，新增/更换模型不需要改代码。
3. **宁缺不错**：曲线交叉、参数缺失、模型未授权时，该设施标记 `PENDING_DATA` 而不是给一个"看起来合理"的错值。
4. **如实标注**：数据的来源（研究库/平台默认/大模型估计）与可信边界（`limitations`、`extrapolated`）随结果一起返回并展示，不把估计值包装成实测值。

## 2. 核心计算链路

### 2.1 总口径

```
超越概率  P(DS ≥ DSi) = Φ( (ln IM − ln θi) / βi )     Φ 为标准正态 CDF
状态概率  DS0 = 1 − E1
         DS1 = E1 − E2
         DS2 = E2 − E3
         DS3 = E3 − E4
         DS4 = E4
```

其中 i = 1…4，`θi` 为该损伤状态的强度中位数，`βi` 为对数标准差。`FragilityMath.stateProbabilities()` 负责这段计算，`FragilityModelService.assess()` 负责取值、校验与组装。

### 2.2 强制校验（`FragilityMath`）

| 校验 | 行为 |
| --- | --- |
| θ/β 非正或非有限 | 抛异常 |
| 状态概率 < 0 或 > 1 或非有限 | 抛异常，**不做排序、截断或兜底** |
| 五项和与 1 之差 > 1e-12 | 抛异常 |

这套行为与冻结研究库 `Seismic_Frontend_Fragility_Handoff_V1` 的实现一致（其策略为 "no sorting/clipping/fallback"）。原因是四条曲线是独立拟合的，低强度段可能交叉，强制纠正会掩盖模型本身的问题。

正态 CDF 用自实现的 `erfc` 计算（a=0.5 的正则化不完全伽马，小宗量走全正项级数、大宗量走连分式），因此无需引入 `commons-math` 等第三方数学库。已用 15 组基准回归，最大误差 1.11e-16。

### 2.3 由状态概率到通行结论

```java
dominantDamageState = 状态概率最大者              // DS0 … DS4
damageProbability   = 1 − P(DS0)                  // "有损伤"的概率，界面按百分比展示
passabilityStatus   = DS4 → BLOCKED
                      DS3/DS2 → CONDITIONAL
                      DS0/DS1 → PASS
recommendedAction   = 按 ds 索引给出处置建议文案
```

`recommendation(ds)` 的文案：DS4「立即封闭并启动应急检测，禁止车辆通行」；DS3「优先现场复核并设置交通管制」；DS2「48 小时内专项检测，限载通行」；DS1「纳入近期巡检计划」；DS0「保持常规巡检」。

### 2.4 聚合指标

```java
avgDamage     = Σ damageProbability / 已评估设施数
affectedRatio = (DS≥1 的设施数) / 全部设施数
riskScore     = 100 × (0.5 × avgDamage + 0.5 × affectedRatio)
riskLevel     = ≥60 高风险 / ≥30 中风险 / 其余低风险
```

> 注意：`riskScore` 是平台为便于排序与展示而自定义的加权，不是行业公认的风险指标。若后续引入正式的风险分级方法，这一层是最应该替换的地方，且替换不影响下游（下游只读 `riskLevel` 字符串与 `riskScore` 数值）。

## 3. 地震分支

### 3.1 三种强度指标模式（`imMode`）

| 模式 | 取值逻辑 |
| --- | --- |
| `UNIFORM_PGA` | 全部设施取同一个 `pgaG`，**不乘场地放大系数** |
| `GROUND_MOTION` | 由上传记录解析出的 PGA × 场地放大系数 |
| `ATTENUATION` | 按震级、震源深度、震中距算出 PGA × 场地放大系数 |

> 已知不一致：`UNIFORM_PGA` 分支不套用场地系数，另两个分支套用。若希望三者口径统一，需要明确 `UNIFORM_PGA` 的语义是"自由场 PGA"还是"结构处 PGA"，再统一处理。

### 3.2 简化衰减关系

```
ln(PGA_g) = A + B·Mw + C·ln(R + D)
R = √(震中距² + 震源深度²)
A = −2.329   B = 0.803   C = −1.323   D = 10.0
```

参数按 Mw6.5/R20km≈0.20g、R50km≈0.08g、Mw5.0/R20km≈0.06g 反算，仅为输出随距离变化的强度场，服务层注释已标明"接入重庆地区正式衰减关系后可整体替换"。

场地放大系数：`I=1.00、II=1.15、III=1.35、IV=1.50`。场地类别取 `tunnel_detail.site_category`（LEFT JOIN 取得），**桥梁没有该字段，统一用表单传来的默认类别**。这意味着桥梁的空间差异目前不参与计算。

震中距用 Haversine 球面距离，地球半径 6371 km。

### 3.3 地震动记录解析（`GroundMotionParser`）

支持 PEER AT2 与纯数值 TXT，规则与冻结库 `src/ground_motion_reader.py` 一致：

- AT2：前 20 行内查找含 `NPTS` 与 `DT` 的表头（兼容新式 `NPTS= 2800, DT= .0100` 与旧式 `2800 0.0100 NPTS, DT`），表头区必须含 `ACCELERATION` 关键字，实际数据点数必须等于 `NPTS`；
- TXT：无表头、每行一个有限数值，**单位必须由调用方显式给出**，不猜测；
- 单位归一化支持 `g / m/s2 / cm/s2`（`gal` 视为 `cm/s²`），内部统一为 g，`GRAVITY = 9.81`；表头单位与调用方声明冲突时报错；
- `PGA = max(|a|) × 单位系数`，持时 `= (NPTS − 1) × DT`，缺 DT 时仅出 PGA 并在 `warnings` 中说明；
- 文件上限 20 MB，不做滤波、归一化或动力分析。

> 已知不一致：模型表的 `im_type` 里，隧道是 `TARGET_INPUT_PGA`（目标输入 PGA，语义上不等于实测自由场地表 PGA），但服务层把同一个从地震动/衰减关系得到的 PGA 直接喂给隧道模型。这是语义层面待明确的问题。

### 3.4 影响半径

不传 `influenceRadiusKm` 时自动推导：`max(20, Mw × 9)` km，并在结果中标记 `influenceRadiusAuto = true`。

地震模式下**半径不参与逐设施计算**，只用于展示 `impactAreaKm2 = πr²`。这一点在 2026-10-24 的界面调整中已确认，前端也因此删掉了半径输入框。

## 4. 泥石流分支

冻结研究库只有地震易损性曲线，没有泥石流模型。因此泥石流侧是一套**参数化、可替换的简化模型**（`DebrisFlowService`），目标是"先给出可比对的相对结果"，模型表中明确标注"待标定"。

### 4.1 环境参数获取

`POST /disaster/debris-context` 由大模型按固定 JSON Schema 给出降雨、地形与物源条件：

- 未配置密钥或调用失败 → `source = FALLBACK`，回退到偏保守的重庆山区常见量级；
- 解析结果逐字段做**范围钳制**（如流域面积 0.1–500 km²、坡度 1–60°）与枚举校验，非法值回退默认；
- 返回 `raw` 原文以便人工核对，前端提供"查看模型原始输出"开关。

> 注意：如果前端已由场景方案填好 `debrisContext`（泥石流模式下默认会填），`evaluate` 会直接使用它而**不再调用大模型**。只有 `debrisContext` 为空时才由后端自行获取。

### 4.2 强度合成

```
径流系数     ψ = 0.30 + 含水修正(饱和+0.20/潮湿+0.10) + 物源修正(丰富+0.05)
清水峰值流量 Qb = 0.278 · ψ · i · A                    i: 雨强 mm/h，A: 流域面积 km²
泥石流流量   Qc = Qb · (1 + Cv) · 沟道系数 · 含水系数    Cv: 丰富2.5 / 中等1.2 / 较少0.5
沟宽概化     B  = 6 + 3·√A                              (m)
流速与流深   由曼宁公式 v = (1/n)·h^(2/3)·√S 与 Qc = B·h·v 迭代求解，n = 0.05，松弛 0.5，最多 40 次
淤埋         burial = min(h, 3.0)
冲刷         scour  = min(3.0, 0.35·h·(v/3))
冲击         impact = v²·h / 30

桥梁  I = 0.5·impact + 0.3·(burial/2) + 0.2·scourRatio
隧道  I = 0.3·impact + 0.6·(burial/2) + 0.1·scourRatio     （隧道以洞口淤埋为主）
发生概率 P = Φ( (i − Ic) / (0.35·Ic) )，其中雨强阈值 Ic = 15·D^(−0.4) mm/h，D 取 6 h（≈7.33 mm/h）
```

> 已知缺口：前端采集并落库了 `last6hMm / last24hMm / antecedentMm / channelLengthKm / reliefM` 五个字段，但 `intensity()` **只使用其中的 `intensityMmH`、`catchmentAreaKm2`、`averageSlopeDegree` 三个数值 + 三个物源枚举**。前期降雨与降雨历时未参与任何计算，这是泥石流模型最值得优先补齐的部分（前期降雨对物源饱和度的影响在专业方法里权重很高）。

### 4.3 距离衰减与影响半径

泥石流半径参与计算（这点与地震不同）：未显式指定时 `max(10, 4·√A)` km；强度按 `I(d) = I × (0.4 + 0.6 × proximity)` 衰减，`proximity = clamp(1 − d / r, 0, 1)`，即半径外仍保留 40%。

## 5. 易损性模型（`fragility_model` 表）

### 5.1 准入规则

| 字段 | 作用 |
| --- | --- |
| `hazard_type` | `EARTHQUAKE` / `DEBRIS_FLOW` |
| `asset_type` | `BRIDGE` / `TUNNEL` |
| `evaluable` | `false` = 归档模型，禁止用于评估 |
| `published` | 是否已发布 |
| `allow_research` | 未发布模型是否可在界面勾选授权后使用 |
| `valid_min` / `valid_max` | IM 验证范围，超出则在结果中标记 `extrapolated = true` |
| `im_type` | `PGA` / `TARGET_INPUT_PGA` / `DEBRIS_INTENSITY` |
| `theta_ds1…4`、`beta_ds1…4` | 曲线参数 |
| `source_label`、`limitations` | 来源标注与适用边界，界面随模型展示 |

唯一键 `(hazard_type, asset_id, model_id, model_version)`，导入脚本按此幂等更新。

`assess()` 的前置校验顺序：模型为空 → 不可评估 → 未发布且未授权 → 参数不全。

### 5.2 当前已入库的 8 条模型

| 灾害 | 类型 | 名称 | 状态 | IM | 范围 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 地震 | 桥梁 | 示例桥梁 B | PUBLISHED | PGA | 0.05–1.00 | θ 逐值来自冻结研究库 |
| 地震 | 桥梁 | 示例桥梁 C | PUBLISHED | PGA | 0.05–1.20 | 同上 |
| 地震 | 桥梁 | Bridge D 管理员建库验证桥 | PUBLISHED | PGA | 0.05–1.00 | 用于建库流程验证 |
| 地震 | 桥梁 | Bridge C 流水线验证模型 | UNREGISTERED_RESEARCH | PGA | 0.05–1.20 | `evaluable=false`，**禁止评估** |
| 地震 | 隧道 | 九顶山 S4 | RESEARCH_REFERENCE | TARGET_INPUT_PGA | 0.10–1.00 | 未发布，需 `allowResearch` |
| 地震 | 隧道 | BCT-01 基准圆形隧道 | RESEARCH_REFERENCE | TARGET_INPUT_PGA | 0.10–1.00 | 未发布，需 `allowResearch` |
| 泥石流 | 桥梁 | 桥梁泥石流默认曲线（待标定） | PLATFORM_DEFAULT | DEBRIS_INTENSITY | 0–3 | 平台预设，未经标定 |
| 泥石流 | 隧道 | 隧道泥石流默认曲线（待标定） | PLATFORM_DEFAULT | DEBRIS_INTENSITY | 0–3 | 平台预设，曲线更晚进入损伤 |

导入时必须 `mysql --default-character-set=utf8mb4`，否则中文 `limitations` 会报 1366。

### 5.3 模型选择策略（`resolveModel`）

1. 界面显式指定 `bridgeModelId` / `tunnelModelId` → 直接 load，失败则报错终止；
2. 未指定 → `defaultFor(hazard, assetType, allowResearch)`：取 `evaluable=true` 且 (`published=true` 或 (`allow_research=true` 且已授权)) 的模型，按 `published DESC, id` 排取第一条；
3. 该类型完全没有可用模型 → 返回 `null`，**这些设施标记 PENDING_DATA，整个任务不失败**。

这一点很重要：隧道目前只有两条未发布的研究参考模型，用户未勾选"允许使用研究参考模型"时，隧道全部设施会是 `PENDING_DATA`，而桥梁正常出结果。

`assess()` 结果中还返回 `matchBasis = "按资产类型默认匹配，结构参数尚未参与"`——结构形式（梁桥/拱桥/斜拉桥等）目前不参与模型匹配，这是主要的模型精细化空间。

## 6. 道路影响的传导

`roadImpacts()` 把设施结论映射到道路边：

```
遍历 bridge_detail_flags: road_edge 中 source_bridge_flag=TRUE 或 source_tunnel_flag=TRUE 的边（LIMIT 300）
  经 asset_road_relation 找到该边绑定的全部设施
  取这些设施中最差的 passabilityStatus
```

状态排序 rank：`BLOCKED(3) > CONDITIONAL(2) > PASS(1) > 其他(0)`。`PENDING_DATA` 的 rank 是 0，因此**不会压制已确定的状态**，避免出现"未知覆盖阻断"。

> 已知数据缺口：`asset_road_relation` 目前无数据，所以道路影响全部为 PASS（逻辑正确但无绑定数据）。另外 `LIMIT 300` 是硬截断，路网边数超过后只处理前 300 条。

## 7. 数据落库

### 7.1 表结构

| 表 | 用途 |
| --- | --- |
| `analysis_task` | 任务主表。`task_type='DISASTER'`，`input_json` 存完整输入快照，含 `started_at` / `completed_at` / `status` |
| `analysis_result` | 结果明细。`result_scope` 区分 `SUMMARY` 与 `ASSET` |
| `fragility_model` | 易损性模型参数 |

`AnalysisStore` 把尚未定型的输入输出集中存为 JSON，避免过早拆出大量专业表——这是当前平台的统一约定，三个分析模块共用。

### 7.2 一次评估产生的行

```
analysis_task        1 行     status RUNNING → SUCCESS
analysis_result      N 行     result_scope='ASSET'
                              target_type='DISASTER_DAMAGE'
                              target_key = 设施 id
                              status_code = DS0…DS4 或 PENDING_DATA
                              score = damageProbability（百分比）
                              result_json = 该设施完整结果
analysis_result      1 行     result_scope='SUMMARY'，result_json 为整个评估响应
```

### 7.3 输入快照的内容

由 `baseInput()` 组装：前端原始入参 + `eventType` + `taskName` + `occurredAt`（yyyy-MM-dd HH:mm）+ `regionName`（按 `regionCode` 反查，查不到默认"重庆市"）。地震额外存 `imMode` / `magnitude`；泥石流额外存 `debrisContext` 与 `probability`。

历史任务列表 `AnalysisStore.recent()` 用 `COALESCE($.hazardType, $.eventType, task_type)` 作为 `moduleType`，用子查询取最新 `SUMMARY` 的 `$.riskLevel`。

### 7.4 事务与失败处理

`evaluate()` 标注 `@Transactional("platformTransactionManager")`，任务与结果在同一事务内写入。任务一旦 `store.start()` 就会产生 `analysis_task` 行；设施级异常在循环内被捕获为 `PENDING_DATA`，因此通常不会因为单个设施失败导致整单回滚。

> 注意：`ANALYSIS_TASK.ERROR_MESSAGE` 字段存在但当前未被写入，失败任务的错误信息不会落库。

## 8. 接口清单

前缀 `/api/disaster`，控制器 `DisasterController`。

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/disaster/bootstrap` | GET | 场景示例、区县、设施总数、最近 10 条任务、按灾害分组的模型清单、IM 模式、衰减说明 |
| `/disaster/evaluate` | POST | 执行评估并落库 |
| `/disaster/tasks/{id}` | GET | 读取历史 `SUMMARY` 结果 |
| `/disaster/models/{id}/curves?points=401` | GET | 易损性曲线采样，返回逐点 `{im, exceedanceDS1-4, stateDS0-4}`，无效点标 `invalid` |
| `/disaster/debris-context` | POST | 由大模型获取泥石流环境参数，返回 `{source, data, raw, message}` |
| `/disaster/parse-ground-motion` | POST | 解析 AT2/TXT，**不落库**，返回 PGA、持时与告警 |

异常：`IllegalArgumentException` / `IllegalStateException` 由控制器内的 `@ExceptionHandler` 统一转成 400 + `{message}`，不返回堆栈。

`bootstrap()` 中的 `modelCatalog()` 做了兜底：模型表读取失败时返回空清单与错误信息，而不是让整个页面不可用。

### `POST /disaster/evaluate` 主要入参

| 字段 | 说明 |
| --- | --- |
| `hazardType` | `EARTHQUAKE` / `DEBRIS_FLOW`，决定走哪条分支 |
| `taskName`、`regionCode`、`regionName` | 任务元信息 |
| `longitude`、`latitude` | 灾害源位置，缺省值重庆主城 / 渝东南 |
| `imMode` | 地震三选一 |
| `pgaG`、`magnitudeMw`、`depthKm`、`siteCategory` | 地震参数 |
| `groundMotion` | `{filename, content, unit, dt}`，评估时重新解析一遍 |
| `bridgeModelId`、`tunnelModelId` | 指定模型，缺省按类型取默认 |
| `allowResearch` | 是否允许未发布的研究参考模型 |
| `debrisContext` | 泥石流环境参数，缺省时后端自行调大模型 |
| `influenceRadiusKm` | 可选；不传则自动推导 |

前端构造 payload 时**不传** `influenceRadiusKm`（表单已无此字段），因此实际总是走自动推导。

## 9. 前端结构

### 9.1 文件

```
src/views/DisasterView.vue                    页面主体，状态中枢与结果编排
src/components/disaster/ModelSelectPanel.vue  模型选择，展示状态徽章与适用边界
src/components/disaster/EarthquakeInputPanel.vue  地震动输入，含文件上传与解析预览
src/components/disaster/DebrisInputPanel.vue       降雨与沟道条件，含大模型取数
src/components/disaster/FragilityCurveChart.vue    ECharts 超越概率曲线 + 当前 IM 标线
src/components/disaster/RiskDetailPanel.vue        设施结果列表，按 DS 过滤
src/components/disaster/AssetDetailModal.vue       Teleport 弹窗，单设施完整结果
src/styles/disaster.css                            深色科技风样式
```

### 9.2 布局

顶部 `disaster-mode-bar` 统筹「模式切换 / 任务名称 / 场景方案 / 历史任务」，三栏主体：左列为模型+输入+控制三个面板（flex 自适应，模型面板可滚动且标题 sticky），中列为地图 + 可拖拽分隔条 + 底部指标栏（默认 230px，范围 120px 至 55%），右列为影响摘要 + 风险详情。

模式为用户切换时会清空结果、重置过滤与底栏页签，并通过 `router.replace` 同步 query（`?type=earthquake|debris`）。

### 9.3 关键交互

- **模型 → 曲线联动**：`activeModelId` 变化时请求 `/models/{id}/curves?points=401`，底部默认页签展示曲线；选中模型时自动拉曲线并画当前 IM 竖线。
- **模型自动预选**：`currentModels` 长度变化时，若桥梁/隧道模型未选，自动挑第一个满足 `evaluable && (published || allow_research)` 的候选。
- **地震动上传**：先调 `/parse-ground-motion` 预览，**前端保留 `__content` 原文**，评估时连同解析结果一起提交让后端重新解析。
- **泥石流取数**：点一次按钮拉一次 LLM 结果，回填表单并可查看原文；不点则沿用场景方案预设的参数。
- **地图与列表联动**：结果中的设施映射到 `mapAssets`（含 `status` / `damageState`），道路五色通行状态传给 `TransportMap`。
- **结果消费**：评估成功后 `platform.rememberTask('disaster', …)` 并 `loadDashboard(true)` 刷新首页。

### 9.4 底部五个页签

易损性曲线 / 损伤分布（DS0–DS4 + PENDING_DATA 计数）/ 道路影响（正常·限行·阻断）/ 推演过程 / 任务日志。

「推演过程」按灾害类型切换内容：地震展示强度模式、PGA 峰值均值、影响半径与面积、参与设施数、待补数据数、衰减说明；泥石流展示清水与泥石流峰值流量、概化沟宽、流速流深、桥梁/隧道强度指标、影响半径与面积、发生概率。

## 10. 与其他模块的衔接

- **首页大屏**：`DashboardDataService` 读取最近一次成功的 DISASTER 结果，按设施逐个取自己的最近结论；`damageDistribution` 按 `damageProbability` 百分比统计五级分布（DS0 0–<20%、DS1 20–<40%、DS2 40–<60%、DS3 60–<80%、DS4 80–100%），从未评估的设施不计入。
- **路网韧性模块**：`/resilience/bootstrap` 的 `disasterTasks` 来自 `store.recent("DISASTER")`，韧性评估可引用某次灾害结果作为灾后受损路网输入。
- **数字人助手**：提供 `damage_results`（最近灾害受损结果）只读工具供 function calling 查询。
- **数据管理**：灾害任务与其他任务一样可在「分析任务」菜单按类型检索、查看明细、整项删除（级联删 `analysis_result`）。

## 11. 已知缺口与改造切入点

按影响面从大到小排列：

1. **模型匹配过于粗糙**：目前只按 `hazard_type + asset_type` 匹配，`matchBasis` 已如实标注"结构参数尚未参与"。桥梁的表里有 `bridge_type`（如连续梁桥）、`design_load_ton` 等字段，但没有按结构形式、跨径、墩高、建造年代等分型的易损性曲线。这是从"代表性模型"走向"针对具体设施的定制化模型"的关键一步。
2. **泥石流模型是占位实现**：θ/β 为平台预设值（`source_label = platform default`），且 `intensity()` 只用到了三个数值字段，前期降雨/降雨历时未参与任何计算。该整条链路都可替换。
3. **隧道 IM 语义未打通**：模型表语义是 `TARGET_INPUT_PGA`，但服务层喂的是由地震动衰减算出的自由场 PGA。需要明确是做场地-结构传递修正（如乘以传递函数），还是改表的 IM 定义。
4. **`UNIFORM_PGA` 不乘场地系数**：与另两种模式口径不一致，需明确语义后统一。
5. **桥梁无场地类别**：只用表单里的默认 II 类，`bridge_detail` 没有 `site_category` 字段，桥梁的空间差异目前完全不参与计算。
6. **`asset_road_relation` 无绑定数据**：道路影响恒定 PASS， facilities → road 的传导链路在真实数据上尚未被验证过。
7. **`roadImpacts` 硬截断 300 条**：路网边数增加后会丢数据。
8. **`riskScore` 是自定义加权**：不构成专业风险指标，且地震侧的 `occurrenceProbability` 实际存的是"平均损伤概率"而非"灾害发生概率"，命名与语义不符（泥石流侧才是真正的发生概率）。两者同名不同义，容易被下游误用。
9. **错误不落库**：`analysis_task.error_message` 从未写入，失败任务无法追溯原因。
10. **模型缺少生命周期管理**：`status` 之外没有状态流转机制，也没有模型版本的有效期管理；多条 PUBLISHED 桥梁模型并存时，取哪一条完全由 `ORDER BY published DESC, id` 决定。

## 12. 相关文件清单

```
后端
  backend/src/main/java/com/plantplatform/controller/DisasterController.java     接口层 + 异常转 400
  backend/src/main/java/com/plantplatform/service/DisasterService.java          两条链路的编排
  backend/src/main/java/com/plantplatform/service/FragilityModelService.java    模型读取、准入校验、概率组装、曲线采样
  backend/src/main/java/com/plantplatform/service/FragilityMath.java            正态 CDF 与状态概率，含强制校验
  backend/src/main/java/com/plantplatform/service/GroundMotionParser.java       AT2/TXT 解析
  backend/src/main/java/com/plantplatform/service/DebrisFlowService.java        环境参数获取 + 强度合成
  backend/src/main/java/com/plantplatform/service/LlmClient.java                大模型调用（与助手共用）
  backend/src/main/java/com/plantplatform/service/AnalysisStore.java            任务与结果落库

数据
  database/schema.sql                              fragility_model / analysis_task / analysis_result
  database/maintenance/seed_fragility_models.sql   8 条初始模型，按唯一键幂等

前端
  src/views/DisasterView.vue
  src/components/disaster/*.vue
  src/styles/disaster.css

文档
  docs/api.md                                      接口与易损性曲线口径
```

## 13. 2026-10-28 重构记录

按用户确认的需求完成一次界面与链路重构，原则为「功能算法以模块开发文件夹为主，数据界面展示以原平台为主」。

### 已变更

**交互流程**：顶部只保留灾害类型切换（任务名称/场景方案/历史任务全部移除）；左侧为「灾害参数面板 + 桥梁评估面板 + 隧道评估面板」三段式；评估对象由全表遍历改为界面显式圈选（下拉添加、地图点选添加、可移除）；桥梁与隧道各自点「开始评估」，各自持有独立的 DRAFT 结果。

**地震输入**：只保留震中经纬度（支持地图点击拾取，地图以震中为圆心绘制 10/25/50 km 距离环，类似地震播报展示，不参与计算）与 PGA 输入或地震动文件上传（记录优先）。衰减场、震级、震源深度、场地类别、影响半径全部移除，`UNIFORM_PGA` 与场地系数的口径不一致问题随之消除。

**落库时机**：`POST /disaster/evaluate` 改为纯计算不落库，返回 `status=DRAFT`；新增 `POST /disaster/save` 作为唯一持久化入口，右侧摘要面板「保存任务」弹窗命名后合并保存桥梁与隧道两组结果（一次灾害事件一个任务），汇总指标由全部设施重算，地震动原文在快照中替换为解析摘要。

**模型绑定**：`fragility_model` 新增 `platform_asset_id`（存量库执行 `database/maintenance/alter_fragility_platform_asset.sql`），模型解析顺序为「绑定当前设施的专属曲线优先，资产类型默认曲线兜底」，为具体桥梁标定曲线后绑定即逐桥生效，界面无需再改。界面不再提供模型选择面板，模型自动解析并在评估面板显示当前所用模型。

**结果展示**：底部三页签为「评估结果（易损性曲线 + DS0–DS4 概率图例，与地图设施点击、右侧详情点击双向联动切换）/ 推演过程 / 任务日志」；道路影响页签与 `roadImpacts` 传导全部移除。通行状态文案改为「完全通行 / 条件通行 / 禁止通行」，不再附处置建议文字。摘要面板展示灾害源坐标、PGA（或泥石流发生概率）、评估桥隧数量、综合风险分数与等级、评估时间。

**泥石流面板**：参数改为「灾害源坐标（支持地图拾取）+ 环境参数」，保留大模型获取环境数据；泥石流影响半径自动推导并在地图画单环。

### 已验证（本机 18098 端口冒烟，数据库 root/root）

- 地震评估 bridge_B@0.2g → DS0 0.2837 / DS1 0.1039 / DS2 0.2716 / DS3 0.329 / DS4 0.0118，与 2026-10-23 基准逐位一致；
- 隧道评估（allowResearch=true）走九顶山 S4 研究参考模型，DS0 0.9406 主导；
- 桥 + 隧合并保存为 DISASTER-000051 后历史读取完整，汇总由 4 处设施重算（冒烟任务已删除）；
- 泥石流评估 debrisContext 手动传入：Qc 68.12 m³/s、距离衰减生效（I桥 0.984 → 桥 IM 0.394）、半径自动 10 km；
- `mvn compile`、`npm run build` 均通过。

### 第二轮界面调整（同日）

- 头部「管理员」菜单不再受首页限制，任何页面均可展开并进入数据管理（原先会提示「请从首页进入数据管理」）。
- 移除顶部模式条，灾害类型切换移入左侧第一个面板（统一为 `HazardSourcePanel`，内部按类型渲染地震或泥石流参数），原 `EarthquakeInputPanel` / `DebrisInputPanel` 删除。
- 震中经度、纬度与「地图点选」按钮同一行；PGA 与「选择地震动文件」同一行；移除记录单位与 DT 输入（**AT2 由表头决定单位，纯数值 TXT 一律按 g 解析**）；移除距离环说明文字。
- 地图区县多边形与路网在灾害页设为非交互（`interactiveRegions=false`），点击穿透到地图，坐标拾取不再被区县弹窗拦截；拾取提示改为地图内的浮动条。
- 地图默认不显示任何桥隧标记，仅显示已加入评估清单的设施；进入「地图点选」时临时展开该类型候选供点选。
- 桥梁/隧道评估面板首行为「从数据库添加 / 地图点选 / 开始评估」三按钮，列表项带序号，保留「参考模型」开关与当前模型名，移除面板内的评估时间。
- 摘要面板顺序改为：综合风险 → 四宫格（灾害源、PGA(g)、评估桥梁、评估隧道，数值不带单位后缀）→ 评估时间 → 保存任务按钮。
- 底部易损性曲线整体下移；地图保持卫星底图并叠加高速/快速路网（`/map/roads` 仅返回 motorway/trunk，路网样式已加粗提亮）。

### 遗留与下一步

1. `platform_asset_id` 尚无绑定数据，所有设施仍走类型默认曲线；录入专属曲线时按设施绑定即可。
2. 隧道 IM 语义（`TARGET_INPUT_PGA` 与自由场 PGA）仍未打通，见第 11 节缺口 3。
3. 泥石流强度合成仍只用 3 个数值输入，前期降雨等字段未参与计算，见第 11 节缺口 2。
4. 保存后的历史结果查看入口在数据管理页（分析任务菜单），灾害页不再提供恢复下拉。
