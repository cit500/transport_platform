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
- `GET /roads`、`GET /roads/{id}`
- `GET /assets`、`GET /assets/{id}`
- `POST /assets`、`PUT /assets/{id}`、`DELETE /assets/{id}`

道路和行政区当前只读；桥隧允许维护，删除操作实际是将服务状态改为 `CLOSED`。

## 灾害与韧性演示

- `GET /disaster/bootstrap`、`POST /disaster/evaluate`、`GET /disaster/tasks/{id}`
- `GET /resilience/bootstrap`、`POST /resilience/evaluate`、`GET /resilience/tasks/{id}`

这两组接口用于跑通界面、任务和历史结果，不代表最终专业分析方法。重车评估暂由前端规则模块演示。
