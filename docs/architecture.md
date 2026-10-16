# 架构说明

## 前端

项目为 Vue 3 单页应用。`src/main.js` 是应用入口，`src/router/index.js` 管理首页、重车、灾害、韧性和数据管理页面，使用 History 路由和页面懒加载。

- `views/`：业务页面。
- `components/`：地图、图表、页头和提示组件。
- `stores/`：Pinia 平台数据、地图缓存与界面状态。
- `services/`：fetch REST API 与 Bigemap 瓦片封装。
- `config/map.js`：地图 URL、令牌和图层 ID 的统一配置入口。
- `styles/`：原生 CSS、响应式布局和地图样式。

首页行政区划、卫星、电子地图三种模式互斥。道路和桥隧可在卫星或电子模式叠加。行政区模式通过 GeoJSON 绘制区界与标签，可按韧性指数、路网连通度或灾害恢复能力着色，也可不选指标。区县选择与雷达图联动。

## 后端与数据

后端按 Controller、Service、Config 组织，通过 Spring JDBC / JdbcTemplate 显式 SQL 和 HikariCP 连接池访问 MySQL。基础查询读取真实行政区、路网和设施数据；桥隧维护及评估写入使用事务。
数据库 `transport_platform` 包含 7 张基础表与 analysis_task、analysis_result 两张分析表。首页按设施或区域读取最近一次成功结果，基础路网保持只读，不写入某次分析的动态状态。
重车使用简化状态、荷载和净空规则；灾害与韧性采用可替换演示算法。结果持久化与专业算法成熟度是独立边界。

## 数字人助手

`POST /api/assistant/chat` 接收问题与历史消息。AssistantService 在启动时加载 classpath 知识库，每次请求拼装人设、知识库、数据库统计摘要、最近 10 条历史及当前问题，通过 Java HttpClient 调用配置的大模型。
AssistantToolService 提供设施、区域韧性、重车结果、受损结果与分析任务五个只读工具；模型工具调用最多循环 4 轮。配置默认 GLM，并预留 Kimi 及服务商联网搜索格式。实现采用非流式返回，前端快捷问题可在失败时回退预置答案。
知识库为全文提示词注入，不使用向量检索。数据库不可用时摘要可跳过，工具错误作为结果返回。实现的兼容性和超时边界见 [阶段记录](releases/2026-10-16.md)。

## 开发与云端部署

| 路径 | 开发环境 | 云端环境 |
| --- | --- |
| 页面 | Vite，默认 3000 | Nginx 静态目录 |
| /api/ | Vite 代理到本机 8080 | Nginx 代理 Spring Boot 8080 |
| 地图瓦片 | 配置中的本机 Bigemap | Nginx /bigemap/ 代理 Docker Bigemap 3000 |
| 数据 | 本机 MySQL | 服务器本机 MySQL |

前端环境变量在构建时注入，开发与生产图层配置分别维护。后端数据库与模型参数通过环境变量覆盖。云端为单机部署，systemd 管理 Java JAR，Bigemap 使用 Docker，更新方式为本地打包与上传。
完整步骤见 [部署说明](../DEPLOYMENT.md)。文档记录不等同于当前服务器运行状态的验证。

## 数据与访问边界

业务结构化数据来自 MySQL，瓦片来自 Bigemap，助手还可使用外部模型与联网信息。路网使用平台内部稳定标识，`exports/` 是可重建的离线产物。
当前应用没有登录鉴权，CORS 为开发阶段宽松设置；公网访问控制由部署层补充。真实凭据、完整数据与地图瓦片不纳入 Git。
