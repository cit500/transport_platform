# 接口说明

统一前缀：`/api`

## 首页与地图

- `GET /dashboard/bootstrap`
- `GET /map/regions`
- `GET /map/roads`
- `GET /map/assets`

## 基础数据管理

前缀：`/api/admin`

- `GET /summary`
- `GET /regions`
- `GET /road-nodes`
- `GET /roads`、`GET /roads/{id}`
- `GET /road-options?q=关键词&limit=30`
- `GET /assets`、`GET /assets/{id}`
- `POST /assets`、`PUT /assets/{id}`、`DELETE /assets/{id}`

行政区、路网节点和路网边只读；桥隧允许维护，删除操作实际是将服务状态改为 `CLOSED`。保存桥隧时必须提供非空的 `roadEdgeIds` 数组。一个设施可以绑定多条边，但一条边只能属于一个设施。后端取所有绑定边几何中心的平均值生成设施坐标，以首条边确定 `regionCode`，并在同一事务中更新 `transport_asset`、对应的 `bridge_detail`/`tunnel_detail` 和全部 `asset_road_relation`。

桥梁详情通过请求体的 `detail` 对象提交，字段名与 `bridge_detail` 表一致；隧道详情同理。例如：

```json
{
  "assetCode": "BRIDGE-CQ-001",
  "assetName": "示例桥梁",
  "assetType": "BRIDGE",
  "roadEdgeIds": [12345, 12346],
  "serviceStatus": "IN_SERVICE",
  "longitude": 106.55,
  "latitude": 29.56,
  "detail": {
    "bridge_type": "连续梁桥",
    "design_load_ton": 100,
    "vertical_clearance_m": 5
  }
}
```

## 灾害与韧性演示

- `GET /disaster/bootstrap`、`POST /disaster/evaluate`、`GET /disaster/tasks/{id}`
- `GET /resilience/bootstrap`、`POST /resilience/evaluate`、`GET /resilience/tasks/{id}`

这两组接口用于跑通界面、任务和历史结果，不代表最终专业分析方法。重车评估暂由前端规则模块演示。
