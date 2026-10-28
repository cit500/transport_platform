# 接口说明

统一前缀：`/api`

## 首页与地图

- `GET /dashboard/bootstrap`
- `GET /map/regions`
- `GET /map/roads`
- `GET /map/assets`

`/dashboard/bootstrap` 中的 `heavyResults` 和 `damageResults` 以当前全部桥隧为底册，对每处设施分别读取最近一次成功评估；新任务只覆盖其涉及的设施，其余设施沿用自身上次结果，从未评估的设施保留在列表中且结果为 `null`。`passSummary` 的 `totalCount` 为全部设施数，`assessedCount` 为已有通行结论的设施数，通行率仅以已评估设施为分母。`damageDistribution` 按当前设施最新受损概率统计 DS0（0–<20%）、DS1（20–<40%）、DS2（40–<60%）、DS3（60–<80%）、DS4（80–100%），未评估设施不计入五级饼图。`regions` 同样按区划保留最近一次成功韧性结果；`resilienceOverall` 读取最近一次重庆市总体结果。`/map/regions` 提供区县中心经纬度，并附加韧性指数、路网连通度和灾害恢复能力三项指标。

## 基础数据管理

前缀：`/api/admin`

- `GET /summary`
- `GET /regions`
- `GET /road-nodes`
- `GET /roads`、`GET /roads/{id}`
- `GET /road-options?q=关键词&limit=30`
- `GET /assets?type=BRIDGE|TUNNEL`、`GET /assets/{id}`
- `POST /assets`、`PUT /assets/{id}`、`DELETE /assets/{id}`
- `PUT /assets/{id}/status`（请求体 `{"serviceStatus":"IN_SERVICE|CLOSED"}`）
- `GET /analysis-tasks?page=0&size=20&q=关键词&type=HEAVY|DISASTER|RESILIENCE`
- `GET /analysis-tasks/{id}?page=0&size=50`（输入快照、汇总结果、分页逐项结果）
- `DELETE /analysis-tasks/{id}`（删除任务及其全部结果）

行政区、路网节点和路网边只读；桥隧允许维护。状态接口用于运营中/已停用切换，删除接口执行物理删除，并级联移除专业详情、路网绑定及该设施的分析明细；释放出的设施编码可再次使用。保存桥隧时必须提供非空的 `roadEdgeIds` 数组。一个设施可以绑定多条边，但一条边只能属于一个设施。后端取所有绑定边几何中心的平均值生成设施坐标，以首条边确定 `regionCode`，并在同一事务中更新 `transport_asset`、对应的 `bridge_detail`/`tunnel_detail` 和全部 `asset_road_relation`。

数据管理中的“分析任务”菜单可按类型检索任务、查看设施或区域级明细，并删除整项任务。评估结果由分析运行生成，不在管理页手工改写单项分值。

桥梁详情通过请求体的 `detail` 对象提交，字段名与 `bridge_detail` 表一致；隧道详情同理。例如：

```json
{
  "assetName": "示例桥梁",
  "assetType": "BRIDGE",
  "roadEdgeIds": [12345, 12346],
  "serviceStatus": "IN_SERVICE",
  "detail": {
    "bridge_type": "连续梁桥",
    "design_load_ton": 100,
    "vertical_clearance_m": 5
  }
}
```

## 分析任务

- `POST /heavy/evaluate`、`GET /heavy/tasks/{id}`
- `GET /disaster/bootstrap`、`POST /disaster/evaluate`、`POST /disaster/save`、`GET /disaster/tasks/{id}`
- `GET /disaster/models/{id}/curves?points=401`
- `POST /disaster/debris-context`
- `POST /disaster/parse-ground-motion`
- `GET /resilience/bootstrap`、`POST /resilience/evaluate`、`GET /resilience/tasks/{id}`

三类接口均把任务写入 `analysis_task`，把汇总和设施/区域级结果写入 `analysis_result`。当前规则用于跑通真实数据链路，不代表最终专业分析方法。

### 灾害风险评估（2026-10-28 重构后）

地震与泥石流都走同一条链路：**强度指标 IM → 易损性曲线 → DS0–DS4 互斥状态概率**。

- 超越概率 `P(DS ≥ DSi) = Φ((ln IM − ln θi) / βi)`，Φ 为标准正态 CDF；
- 状态概率 `DS0 = 1−E1`、`DS1 = E1−E2`、`DS2 = E2−E3`、`DS3 = E3−E4`、`DS4 = E4`，和为 1（容差 1e-12）；
- 主导损伤状态取概率最大者；通行状态由损伤等级映射（DS0–DS1 完全通行、DS2–DS3 条件通行、DS4 禁止通行）；
- 曲线交叉产生负概率时该设施标记 `PENDING_DATA`，不做排序或截断；
- IM 超出模型验证范围时结果标记 `extrapolated=true`，界面提示为外推值。

模型参数存于 `fragility_model` 表（建表见 `database/schema.sql`，初始数据见 `database/maintenance/seed_fragility_models.sql`，存量库需执行 `database/maintenance/alter_fragility_platform_asset.sql`）。**模型解析顺序：优先取 `platform_asset_id` 绑定到该设施的专属曲线，没有绑定时回落到该资产类型的默认曲线**——为具体桥梁标定曲线后绑定 `platform_asset_id` 即可逐桥生效，界面无需修改。地震模型的 θ/β 逐值来自冻结研究库，其中隧道的 IM 是 `TARGET_INPUT_PGA`（目标输入 PGA，非实测自由场地表值），两条隧道模型为未发布的研究参考模型，需请求带 `allowResearch=true`；`evaluable=false` 的归档模型禁止用于评估。泥石流模型的 θ/β 是平台预设值，标注 `source_label=platform default`，**尚未标定**。

`POST /disaster/evaluate` 是**纯计算接口，不落库**，评估对象由 `assetIds` 显式圈选：

| 字段 | 说明 |
| --- | --- |
| `hazardType` | `EARTHQUAKE` 或 `DEBRIS_FLOW` |
| `longitude` / `latitude` | 灾害源坐标；地震侧仅用于地图圆环展示，不参与计算 |
| `assetIds` | 本次评估的设施 id 列表 |
| `pgaG` | 地震强度（g）；有 `groundMotion` 时以记录解析 PGA 为准 |
| `groundMotion` | `{filename, content, unit, dt}`，按 AT2/TXT 规则解析出 PGA 与持时 |
| `allowResearch` | 允许使用未发布的研究参考模型（桥梁/隧道面板分别传入） |
| `debrisContext` | 泥石流环境参数；缺省时后端调用大模型按固定 JSON 结构获取 |

返回 `status=DRAFT` 的结果：逐设施 `{imValue, imType, modelId, modelName, stateProbabilities, exceedanceProbabilities, dominantDamageState, damageProbability, extrapolated, passabilityStatus, assessmentReason}`，汇总含 `riskScore / riskLevel / evaluatedCount / pendingCount / evaluatedAt`。地震侧不再有衰减场、震级、场地放大与道路影响；泥石流侧保留推理公式强度合成与距离衰减，影响半径不传时自动推导（`max(10, 4√A)` km）。

`POST /disaster/save` 是**唯一落库入口**：`{taskName, hazardType, input, bridgeResult, tunnelResult}`，桥梁与隧道两组评估结果合并为一个任务（一次灾害事件一条记录），汇总指标由全部设施重算；地震动原文在输入快照中替换为解析摘要。返回 `{id, taskCode, ...}`。评估结果在用户点击保存前不会写入数据库。

`POST /disaster/debris-context` 返回 `{source: LLM|FALLBACK, data, raw, message}`：`data` 为归一化后的降雨、地形与物源字段，`raw` 为模型原始输出（便于核对），模型不可用或解析失败时回退到保守默认值并把 `source` 置为 `FALLBACK`。泥石流强度指标按 `I = 0.5·(v²h/30) + 0.3·(淤埋/2) + 0.2·冲刷比`（桥梁）合成，隧道权重不同，流速与流深由推理公式与曼宁公式迭代求解，汇总结果随 `summaryJson` 返回。

## 数字人助手

- `POST /assistant/chat`（请求体 `{"question":"...","history":[{"role":"user","text":"..."},{"role":"assistant","text":"..."}]}`）

后端调用智谱 GLM 大模型（`glm-4-flash`，支持联网搜索；后端代码预留 Kimi 兼容接口，可在 `application.yml` 切换）生成回答。助手定位为通用智能对话 + 平台领域专家：系统提示词由四部分组成——通用助手人设（可回答任意领域问题、如实说明模型身份）、联网能力说明（`app.llm.web-search` 开启时具备联网搜索，实时信息先搜索再回答）、知识库语料（`backend/src/main/resources/kb/assistant-kb.md`，编辑后重启生效）、`overview()` 实时数据摘要（数据库不可用时自动跳过）；对话历史最多携带最近 10 条。

助手还支持 **function calling 数据库只读工具**：模型可自动调用 `list_assets`（桥隧设施清单）、`region_resilience`（区县与总体韧性指标）、`heavy_pass_results`（最近重车通行结论）、`damage_results`（最近灾害受损结果）、`analysis_tasks`（历史任务记录）五个预定义只读查询（工具集在 `AssistantToolService`，条数有上限、不含任何写操作），最多执行 4 轮工具循环后生成最终回答。API Key 通过环境变量 `PLANT_LLM_API_KEY` 配置，真实密钥不写入仓库。未配置 Key 或调用失败时接口返回 502 及原因，前端自动回退到 `assistantQuestions` 预置问答。
