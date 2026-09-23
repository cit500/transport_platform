# 部署说明

## 前端

```powershell
npm ci
npm run build
```

构建输出位于 `dist/`。Vue Router 使用 History 模式，Web 服务器必须把不存在的前端路径回退到 `index.html`，否则直接刷新 `/heavy`、`/disaster` 或 `/resilience` 会返回 404。

前端环境变量参考 `.env.example`。

## 后端

```powershell
cd backend
mvn clean package
java -jar target/transport-resilience-backend-1.0.0.jar
```

支持的数据库环境变量：

- `PLANT_DB_URL`
- `PLANT_DB_USERNAME`
- `PLANT_DB_PASSWORD`

## 外部依赖

- MySQL 8
- Bigemap 本地瓦片服务
- Java 17
- Node.js 与 npm（仅构建阶段）
