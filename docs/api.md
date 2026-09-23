# 接口说明

统一前缀：`/api/v2`

## 首页与地图

- `GET /dashboard/bootstrap`
- `GET /map/regions`
- `GET /map/roads`
- `GET /map/assets`

## 数据管理

统一前缀：`/api/v2/admin`

包括道路、桥隧设施、车辆方案、灾害场景、评估任务、首页发布、灾害动态和预设问答的查询与维护接口。

## 灾害评估

- `GET /disaster/bootstrap`
- `POST /disaster/evaluate`
- `GET /disaster/tasks/{taskId}`

## 韧性评估

- `GET /resilience/bootstrap`
- `POST /resilience/evaluate`
- `GET /resilience/tasks/{taskId}`

重车评估当前由前端规则模块执行，尚无独立后端评估接口。
