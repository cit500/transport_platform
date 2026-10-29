# 交通网络多灾韧性评价可视化平台 — 部署说明文档

> 文档版本：2026-10-16（云端部署阶段）
> 服务器：阿里云 ECS（Ubuntu 24.04 LTS，公网 IP 47.108.214.99）

本文记录已有部署流程与配置，尚未通过本次文档归档重新验证服务器运行状态。所有尖括号内容都是待替换占位符，数据库密码、地图令牌、地图管理密码和大模型密钥需由部署者自行设置。不要直接使用占位符启动服务。

---

## 一、项目架构总览

```
用户浏览器
    ↓ HTTP :80
阿里云 ECS (Nginx 1.24)
    ├── /              → 前端静态文件（Vite build → dist/）
    ├── /api/*         → 反向代理 → localhost:8080（Spring Boot JAR）
    └── /bigemap/*    → 反向代理 → localhost:3000（Bigemap Server Docker）
                            ↓
                        MySQL 8.0（localhost:3306，数据库 transport_platform）
```

### 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 前端框架 | Vue 3（Composition API + `<script setup>`） | 3.5.x |
| 构建工具 | Vite | 5.4.x |
| 路由 | Vue Router 4（HTML5 history 模式） | 4.5.x |
| 状态管理 | Pinia（Setup Store） | 3.0.x |
| 可视化 | ECharts 6 + Leaflet 1.9 | — |
| 地图服务 | Bigemap Server（离线瓦片，Docker 部署） | v1.5.0-slim |
| 后端框架 | Spring Boot | 3.2.5 |
| 运行时 | Java（OpenJDK） | 17 |
| 数据库 | MySQL | 8.0.46 |
| AI 助手 | Moonshot Kimi（kimi-k2.6） | — |
| Web 服务器 | Nginx | 1.24.0 |

---

## 二、服务器环境搭建

### 2.1 基础软件安装

```bash
# Java 17
sudo apt update && sudo apt install -y openjdk-17-jdk-headless

# MySQL 8
sudo apt install -y mysql-server
sudo systemctl start mysql && sudo systemctl enable mysql
sudo mysql_secure_installation   # 按提示设置 root 密码、移除匿名用户和测试库

# Nginx
sudo apt install -y nginx
sudo systemctl start nginx && sudo systemctl enable nginx

# Docker + Docker Compose（Bigemap Server 依赖）
sudo apt install -y docker.io docker-compose wget openssl unzip
sudo systemctl start docker && sudo systemctl enable docker
sudo usermod -aG docker admin
```

### 2.2 阿里云安全组端口放行

| 端口 | 用途 | 对外开放 |
|------|------|----------|
| 22 | SSH | ✅ |
| 80 | HTTP（Nginx） | ✅ |
| 443 | HTTPS（预留） | 需要时开放 |
| 3306 | MySQL | ❌ 不对外暴露 |

---

## 三、数据库部署

### 3.1 创建数据库和用户

```sql
CREATE DATABASE transport_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'plant'@'localhost' IDENTIFIED BY '<数据库密码>';
GRANT ALL PRIVILEGES ON transport_platform.* TO 'plant'@'localhost';
FLUSH PRIVILEGES;
```

### 3.2 从本地导出并导入

**本地 Windows 导出（必须用 `--result-file` 避免 PowerShell UTF-16 编码问题）：**

```powershell
mysqldump -u root -p --databases transport_platform --single-transaction --routines --triggers --result-file=D:\transport_platform.sql
```

> ⚠️ **重要**：Windows PowerShell 5.1 的 `>` 重定向可能写出 UTF-16；为避免不同 PowerShell 版本的编码差异，统一使用 `--result-file=` 参数让 mysqldump 自行写入 UTF-8 文件。

**上传并导入：**

```bash
# 上传
scp D:\transport_platform.sql admin@47.108.214.99:/tmp/

# 服务器上导入
sudo mysql -u plant -p'<数据库密码>' transport_platform < /tmp/transport_platform.sql

# 验证
sudo mysql -u plant -p'<数据库密码>' -e "USE transport_platform; SHOW TABLES;"

# 清理
rm /tmp/transport_platform.sql
```

### 3.3 数据库表清单（10 张表）

| 表名 | 用途 |
|------|------|
| analysis_result | 分析结果 |
| analysis_task | 分析任务 |
| asset_road_relation | 资产-道路关联 |
| bridge_detail | 桥梁详情 |
| fragility_model | 易损性模型（灾害评估，2026-10 新增） |
| region | 行政区划 |
| road_edge | 路段边 |
| road_node | 路段节点 |
| transport_asset | 交通资产 |
| tunnel_detail | 隧道详情 |

### 3.4 增量表迁移：fragility_model

灾害风险评估的易损性曲线依赖此表。表缺失时接口不报错，但**所有桥隧会显示「待补数据」**，排查时容易被误判为算法问题。从旧库升级必须单独执行本节。

```sql
-- 1. 建表（幂等；语句取自 schema.sql 第 143-177 行）
CREATE TABLE IF NOT EXISTS fragility_model ( ... );
-- 旧库已有本表但缺 platform_asset_id 列时，改用维护脚本：
-- mysql -uplant -p transport_platform < database/maintenance/alter_fragility_platform_asset.sql

-- 2. 灌入模型参数（幂等，按唯一键更新，可重复执行）
-- mysql -uplant -p transport_platform < database/maintenance/seed_fragility_models.sql
```

验证（应返回 4 行、合计 8 条模型）：

```sql
SELECT hazard_type, asset_type, COUNT(*),
       SUM(published) AS published, SUM(allow_research) AS research
FROM fragility_model GROUP BY hazard_type, asset_type;
```

预期：`EARTHQUAKE/BRIDGE` 4 条（3 发布）、`EARTHQUAKE/TUNNEL` 2 条（均需授权）、`DEBRIS_FLOW` 桥隧各 1 条。

---

## 四、后端部署

### 4.1 本地打包

```powershell
cd D:\LYC\Documents\Plant_v2\backend
mvn clean package -DskipTests
# 产出：target/transport-resilience-backend-1.0.0.jar（约 23MB）
```

### 4.2 上传

```powershell
scp target/transport-resilience-backend-1.0.0.jar admin@47.108.214.99:/opt/app/
```

### 4.3 systemd 服务配置

文件：`/etc/systemd/system/plant-backend.service`

```ini
[Unit]
Description=Transport Resilience Backend
After=network.target mysql.service

[Service]
Type=simple
User=root
Environment=PLANT_DB_URL=jdbc:mysql://localhost:3306/transport_platform?useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&characterEncoding=UTF-8
Environment=PLANT_DB_USERNAME=plant
Environment="PLANT_DB_PASSWORD=<数据库密码>"
Environment=PLANT_LLM_API_KEY=<Moonshot API 密钥>
Environment=PLANT_LLM_PROVIDER=moonshot
Environment=PLANT_LLM_BASE_URL=https://api.moonshot.cn/v1
Environment=PLANT_LLM_MODEL=kimi-k2.6
ExecStart=/usr/bin/java -jar /opt/app/transport-resilience-backend-1.0.0.jar --server.port=8080
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 4.4 启动与管理

```bash
sudo systemctl daemon-reload
sudo systemctl enable plant-backend
sudo systemctl start plant-backend
sudo systemctl status plant-backend    # 查看状态
sudo journalctl -u plant-backend -n 50 # 查看日志
```

### 4.5 后端环境变量说明

| 变量 | 说明 | 示例值 |
|------|------|--------|
| PLANT_DB_URL | MySQL 连接串 | `jdbc:mysql://localhost:3306/transport_platform?...` |
| PLANT_DB_USERNAME | 数据库用户名 | `plant` |
| PLANT_DB_PASSWORD | 数据库密码 | `<数据库密码>` |
| PLANT_LLM_API_KEY | Moonshot API 密钥（与本地 `.env.llm.local` 同值） | `sk-...` |
| PLANT_LLM_PROVIDER | LLM 提供商 | `moonshot` |
| PLANT_LLM_BASE_URL | 接口地址 | `https://api.moonshot.cn/v1` |
| PLANT_LLM_MODEL | 模型名称 | `kimi-k2.6` |
| PLANT_LLM_TEMPERATURE | 不要设置：kimi-k2.6 只接受 1，留空由代码按 provider 自动取值 | — |

---

## 五、Bigemap Server 部署

### 5.1 安装

Bigemap Server Linux 版基于 Docker 运行，使用官方安装脚本：

```bash
cd /tmp
wget http://downloads.bigemap.com/bm-server/linux/bm-server-installer.zip
unzip bm-server-installer.zip
chmod +x ./bm-server-installer
sudo ./bm-server-installer install /opt/bm-server
```

安装脚本会自动下载 Docker 镜像（约 128MB）并启动容器。

### 5.2 服务管理

```bash
cd /opt/bm-server
sudo ./bm-server.sh start     # 启动
sudo ./bm-server.sh restart   # 重启
sudo ./bm-server.sh stop      # 停止
sudo ./bm-server.sh logs      # 查看日志
```

### 5.3 Docker Compose 配置

以下归档示例将地图服务发布到本机回环地址，以对应 Nginx 代理与 SSH 隧道的访问方式；已有服务器是否采用此绑定需现场核对，本次未修改服务器。

文件：`/opt/bm-server/docker-compose.yml`

```yaml
version: '2'
services:
  bm-server:
    image: bigemap/bm-server:v1.5.0-slim
    container_name: bm-server
    restart: always
    privileged: true
    volumes:
      - './.bm-server:/usr/local/bm-server'
      - './tilesets:/usr/local/tilesets'
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      - BS_URL=http://localhost:3000
      - BS_PWD=<地图管理密码>
      - BS_PORT=3000
      - BS_USEHTTP=1
    devices:
      - '/dev/usb:/dev/usb'
      - '/dev/bus/usb:/dev/bus/usb'
```

### 5.4 离线地图数据上传

本地地图数据位于：

| 地图类型 | 本地路径 | 服务器 Layer ID |
|----------|----------|-----------------|
| 电子地图 | `D:\OneDrive\桥梁院项目\Bigemap\重庆市_电子地图1\` | `bigemap.4aelfhj2` |
| 卫星地图 | `D:\OneDrive\桥梁院项目\Bigemap\重庆市1_卫图\` | `bigemap.ax3i19u5` |

上传步骤：

```powershell
# 本地打包
Compress-Archive -Path "D:\OneDrive\桥梁院项目\Bigemap\重庆市_电子地图1\*" -DestinationPath D:\electronic_map.zip -Force
Compress-Archive -Path "D:\OneDrive\桥梁院项目\Bigemap\重庆市1_卫图\*" -DestinationPath D:\satellite_map.zip -Force

# 上传
scp D:\electronic_map.zip admin@47.108.214.99:/tmp/
scp D:\satellite_map.zip admin@47.108.214.99:/tmp/
```

```bash
# 服务器解压
sudo unzip /tmp/electronic_map.zip -d /opt/bm-server/tilesets/electronic/
sudo unzip /tmp/satellite_map.zip -d /opt/bm-server/tilesets/satellite/
sudo chmod -R 755 /opt/bm-server/tilesets/
rm /tmp/electronic_map.zip /tmp/satellite_map.zip

# 重启使 Bigemap 识别新地图
cd /opt/bm-server && sudo ./bm-server.sh restart
```

### 5.5 管理页面访问

通过 SSH 端口转发在本地浏览器访问管理页面：

```powershell
ssh -L 3000:localhost:3000 admin@47.108.214.99
# 然后浏览器打开 http://localhost:3000
# 登录密码：自行设置的地图管理密码（见 docker-compose.yml 中 BS_PWD）
```

### 5.6 access_token（关键）

Bigemap Server 的瓦片请求需要 access_token 授权。**本地和服务器上的 token 不同**，必须分别配置：

| 环境 | Token |
|------|-------|
| 本地开发 | `<地图访问令牌>` |
| 生产服务器 | `<地图访问令牌>` |

> ⚠️ Token 不匹配会导致瓦片请求返回 HTTP 401（未授权），地图白屏。

---

## 六、前端部署

### 6.1 多环境配置（核心设计）

采用 Vite 内置的多环境 `.env` 文件机制，实现本地开发与生产部署的配置自动切换：

| 文件 | 加载时机 | 内容 |
|------|----------|------|
| `.env` | 始终加载 | 共用配置（API_ROOT） |
| `.env.development` | `npm run dev` 时加载 | 本地 Bigemap URL、Token、Layer ID |
| `.env.production` | `npm run build` 时加载 | 服务器 Bigemap URL、Token、Layer ID |

**`.env`（共用）：**

```env
VITE_API_ROOT=/api
```

**`.env.development`（本地开发）：**

```env
VITE_BIGEMAP_URL=http://127.0.0.1:9000
VITE_BIGEMAP_TOKEN=<地图访问令牌>
VITE_BIGEMAP_SATELLITE_LAYER=bigemap.7f604xec
VITE_BIGEMAP_ELECTRONIC_LAYER=bigemap.7lurvljd
```

**`.env.production`（生产服务器）：**

```env
VITE_BIGEMAP_URL=http://47.108.214.99/bigemap
VITE_BIGEMAP_TOKEN=<地图访问令牌>
VITE_BIGEMAP_SATELLITE_LAYER=bigemap.ax3i19u5
VITE_BIGEMAP_ELECTRONIC_LAYER=bigemap.4aelfhj2
```

### 6.2 构建与上传

```powershell
# 构建（自动加载 .env + .env.production）
cd D:\LYC\Documents\Plant_v2
npm run build

# 上传
scp -r dist\* admin@47.108.214.99:/var/www/plant/
```

```bash
# 服务器修复权限（scp 上传的文件权限可能过严）
sudo chmod -R 755 /var/www/plant
```

### 6.3 环境配置差异对照

| 配置项 | 本地开发值 | 生产值 |
|--------|-----------|--------|
| Bigemap URL | `http://127.0.0.1:9000` | `http://47.108.214.99/bigemap`（Nginx 反代 `127.0.0.1:3000`） |
| Bigemap Token | `<本地地图访问令牌>` | `<生产地图访问令牌>` |
| 卫星图层 ID | `bigemap.7f604xec` | `bigemap.ax3i19u5` |
| 电子图层 ID | `bigemap.7lurvljd` | `bigemap.4aelfhj2` |

### 6.4 本地与服务器完整差异清单

除地图外，以下配置**只存在于服务器**，不在版本库中，`git pull` / 重新部署都不会覆盖，请勿误删：

| 项 | 本地 | 云服务器 | 载体 |
|----|------|----------|------|
| 地图配置 | `.env.development` | `.env.production`（同值已写入构建产物） | 仓库外文件 |
| 数据库凭据 | `application.yml` 默认 `root/root` | `plant` 用户，密码在 unit 内 | `/etc/systemd/system/plant-backend.service` |
| 大模型 | moonshot `kimi-k2.6`（yml 默认） | **moonshot `kimi-k2.6`**（systemd 覆盖，2026-10-29 已与本地统一） | 同上 |
| 数据库数据 | 本地测试数据 | 业务数据（12 条资产、7 条任务），**不可被本地种子覆盖** | MySQL `transport_platform` |
| 离线瓦片 | 本地 Bigemap 服务 | `/opt/bm-server/tilesets`（6–12 级） | Docker bind mount |

**改动大模型服务商时**：`provider` / `base-url` / `model` / `temperature` 与 API Key 必须同时改，两家密钥不通用。2026-10-29 起服务器已与本地统一为 Moonshot `kimi-k2.6`；修改 systemd 环境变量后需 `daemon-reload && restart`，否则跑的还是内存中的旧配置。

---

## 七、Nginx 配置

文件：`/etc/nginx/sites-available/plant.conf`

```nginx
server {
    listen 80;
    server_name 47.108.214.99;

    root /var/www/plant;
    index index.html;

    # Vue Router history 模式：所有非文件请求回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理到 Spring Boot
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Bigemap 瓦片代理到 Bigemap Server（Docker 容器）
    location /bigemap/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # bm-server 用绝对路径重定向（Location: /authorize），必须补回子路径前缀，
        # 否则浏览器会跳到 /authorize 被 Vue Router 接管，管理页永远打不开
        proxy_redirect ~^https?://[^/]+(/.*)$ /bigemap$1;
        proxy_redirect ~^(/.*)$ /bigemap$1;
    }

    # 静态资源长缓存（Vite 构建的 assets 带 hash）
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Nginx 代理路由说明

| 前端请求路径 | Nginx 转发到 | 最终服务 |
|-------------|-------------|----------|
| `/` | 本地文件 `/var/www/plant/` | 前端静态文件 |
| `/api/*` | `http://127.0.0.1:8080` | Spring Boot 后端 |
| `/bigemap/*` | `http://127.0.0.1:3000/` | Bigemap Server（Docker） |
| `/assets/*` | 本地文件 + 长缓存 | 前端静态资源 |

**管理页入口必须是 `:3000`，不能走 `/bigemap/` 子路径。** bm-server 是单端口应用：授权页的表单 action 与 OAuth 回调地址都由容器内 `app.json` 的 `url`（即 `BS_URL`）拼成**绝对地址**，子路径反代下会被拼坏——实测把 `url` 改成 `http://47.108.214.99/bigemap` 后，它会生成 `/bigemap/bigemap/...` 的双前缀，反而更糟。`/bigemap/` 只用于取瓦片（瓦片路径由前端拼接，不依赖该配置）。

管理页两种打开方式：

1. **SSH 隧道**（无需改安全组，一次性授权够用）：
   ```powershell
   ssh -i D:\LYC\Downloads\LYC.pem -L 3000:127.0.0.1:3000 root@47.108.214.99
   ```
   保持窗口不关，浏览器打开 `http://localhost:3000/`。此时 `url` 为 `http://localhost:3000`，与访问地址一致，OAuth 回调能正确返回。
2. **阿里云安全组放行 TCP 3000**，然后直接访问 `http://47.108.214.99:3000/`（需把 `app.json` 的 `url` 同步改为该地址）。

管理密码见容器环境变量 `BS_PWD`（当前为 `password`）。

---

## 八、前端配置与界面说明

### 8.1 环境配置

本地已有 `.env.development` 和 `.env.production`，分别供开发和生产构建使用。它们被 Git 忽略，拉取项目后需按第六节自行创建；私有覆盖可使用 `.env.development.local` 或 `.env.production.local`。Vite 环境变量在构建时写入静态文件，修改后需重新构建。

### 8.2 区域韧性面板

当前 `src/views/HomeView.vue` 使用 ECharts `title` 展示区域名称，右上角的 `.radar-reset-region` 按钮在选中区县时显示。`src/styles/dashboard.css` 中雷达图容器的最终生效高度为 `clamp(170px, 26vh, 230px)`；旧的同名规则仍保留，由后面的规则覆盖。

### 8.3 记录与源码的边界

早期部署记录中提到饼图 Tooltip 的 `confine` / 自定义 `position` 和雷达图 `graphic` 胶囊；当前仓库 `HomeView.vue` 没有这些实现。本记录以当前源码为准，不将这些项目列为已完成，也不据此推断服务器实际运行的构建版本。

---

## 九、日常运维

当前采用手工打包、上传与重启。每次上线应记录 Git 提交、构建时间、环境配置版本和数据库备份位置；替换前保存旧 JAR 与前端目录，以便回滚。数据库导入会影响现有数据，执行前先备份并确认目标库。

### 9.1 常用服务管理命令

```bash
# 后端
sudo systemctl status plant-backend    # 状态
sudo systemctl restart plant-backend   # 重启
sudo journalctl -u plant-backend -n 50 # 最近日志

# Bigemap Server
cd /opt/bm-server && sudo ./bm-server.sh restart
cd /opt/bm-server && sudo ./bm-server.sh logs

# Nginx
sudo nginx -t                          # 配置语法检查
sudo systemctl reload nginx            # 重载配置（不中断服务）

# MySQL
sudo systemctl status mysql
sudo mysql -u plant -p'<数据库密码>' -e "USE transport_platform; SHOW TABLES;"
```

### 9.2 前端更新部署流程

```powershell
# 1. 本地修改代码
# 2. 本地测试
npm run dev
# 3. 构建生产版本（自动加载 .env.production）
npm run build

# 4. 校验产物里的地图配置必须是生产值（写死进 bundle，错了地图直接失效）
Select-String -Path dist\assets\TransportMap-*.js -Pattern 'http://47.108.214.99/bigemap|bigemap\.ax3i19u5|bigemap\.4aelfhj2'

# 5. 上传
scp -r dist\* admin@47.108.214.99:/tmp/plant-new/
```

```bash
# 6. 清空旧 assets 再替换（直接覆盖会让历史 chunk 无限累积，旧文件名长期可访问）
sudo rm -rf /var/www/plant/assets
sudo cp -a /tmp/plant-new/. /var/www/plant/ && sudo rm -rf /tmp/plant-new
sudo chown -R admin:admin /var/www/plant
sudo find /var/www/plant -type d -exec chmod 755 {} \;
sudo find /var/www/plant -type f -exec chmod 644 {} \;

# 7. 验证：首页 200，且 index.html 引用的 chunk 全部 200
curl -s http://47.108.214.99/ | grep -oE '(src|href)="/assets/[^"]+"'
```

### 9.3 后端更新部署流程

```powershell
# 1. 本地打包（必须带 clean，否则 target/classes 里的旧资源不会刷新）
cd backend && mvn clean package -DskipTests

# 2. 上传前校验 jar 内配置（2026-10-29 曾因 application.yml 混入杂字符导致启动失败）
unzip -p target\transport-resilience-backend-1.0.0.jar BOOT-INF/classes/application.yml | Select-Object -First 6
```

```bash
# 3. 备份旧包后替换（失败可 cp 备份包回 /opt/app 再 restart 回滚）
cp /opt/app/transport-resilience-backend-1.0.0.jar /opt/backup/backend-$(date +%Y%m%d-%H%M).jar
sudo systemctl daemon-reload
sudo systemctl restart plant-backend

# 4. 验证
systemctl is-active plant-backend && ss -lntp | grep 8080
curl -s http://127.0.0.1:8080/api/disaster/bootstrap | head -c 200
```

**注意**：unit 文件改动后必须 `daemon-reload`，否则 `systemctl cat` 看到的是磁盘版本、实际运行的仍是内存中的旧版本（`status` 会提示 "changed on disk"）。


```bash
# 3. 服务器重启后端
sudo systemctl restart plant-backend
sudo systemctl status plant-backend
```

### 9.4 数据库更新

如本地数据库有变更：

```powershell
mysqldump -u root -p --databases transport_platform --single-transaction --routines --triggers --result-file=D:\transport_platform.sql
scp D:\transport_platform.sql admin@47.108.214.99:/tmp/
```

```bash
sudo mysql -u plant -p'<数据库密码>' transport_platform < /tmp/transport_platform.sql
rm /tmp/transport_platform.sql
```

---

## 十、故障排查

| 现象 | 可能原因 | 排查方式 |
|------|----------|----------|
| 首页白屏，标题正确 | 前端静态文件权限不足 | `sudo chmod -R 755 /var/www/plant` |
| 首页白屏，无标题 | Nginx 配置错误或 index.html 缺失 | `sudo nginx -t`；`ls /var/www/plant/index.html` |
| 数据面板全空 | 后端未启动或数据库连接失败 | `sudo systemctl status plant-backend`；`curl localhost:8080/api/dashboard/bootstrap` |
| 502 Bad Gateway | 后端进程崩溃 | `sudo journalctl -u plant-backend -n 50` |
| 地图白屏/瓦片加载失败 | Bigemap Server 未启动或 token 不匹配 | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`；检查 `.env.production` 中 token |
| 地图 401 未授权 | access_token 与服务器不匹配 | 在 Bigemap 管理页面获取正确 token，更新 `.env.production` |
| 地图 401 且带任何 token 都失败 | Bigemap 账号授权被禁用/过期 | `docker exec bm-server grep -o '"disabled":[a-z]*' /root/.bm-server/app.db`，出现 `true` 说明账号已禁，需在管理页重新登录授权 |
| Bigemap 管理页打不开、跳回平台首页 | 管理页走了 `/bigemap/` 子路径，表单 action 被拼成平台根路径 | 管理页只能用 `:3000`（SSH 隧道或安全组放行），详见 §7；`/bigemap/` 仅供取瓦片 |
| AI 助手无响应 | `PLANT_LLM_API_KEY` 未设置或密钥失效 | `sudo journalctl -u plant-backend | grep -i llm` |
| API 404 | Nginx 未配 `/api/` 代理 | 检查 Nginx 配置中 `location /api/` 的 `proxy_pass` |

---

## 十一、安全注意事项

当前应用没有登录鉴权，管理 API 支持写入和物理删除。公网部署应先在入口限制管理接口访问；仅不开放 MySQL 端口不能保护业务写接口。以下事项是部署要求，不能视为已验证完成。

1. **SSH 密码登录**：部署完成后应关闭（`PasswordAuthentication no`），使用密钥登录
2. **MySQL 端口**：不对外暴露（安全组不放行 3306）
3. **Bigemap Server 端口**：不对外暴露（3000 端口仅通过 Nginx 代理访问）
4. **API 密钥**：不写入代码仓库，通过环境变量注入（`PLANT_LLM_API_KEY`）
5. **Bigemap 管理密码**：应设置独立强密码（docker-compose.yml 中 `BS_PWD`）
6. **HTTPS**：生产环境建议配置 SSL 证书（Let's Encrypt + Certbot）

---

## 十二、完整部署检查清单

| # | 检查项 | 验证命令 | 预期结果 |
|---|--------|----------|----------|
| 1 | Java 17 | `java -version` | openjdk 17.x.x |
| 2 | MySQL 运行 | `sudo systemctl status mysql` | active (running) |
| 3 | 数据库存在 | `mysql -u plant -p -e "SHOW DATABASES;"` | 包含 transport_platform |
| 4 | 后端运行 | `sudo systemctl status plant-backend` | active (running) |
| 5 | 后端 API 可用 | `curl localhost:8080/api/dashboard/bootstrap` | 返回 JSON |
| 6 | Bigemap 运行 | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` | 302 或 200 |
| 7 | 前端文件存在 | `ls /var/www/plant/index.html` | 文件存在 |
| 8 | Nginx 配置正确 | `sudo nginx -t` | syntax is ok |
| 9 | 浏览器可访问 | 打开 `http://47.108.214.99` | 平台首页正常显示 |
| 10 | 地图可加载 | 切换电子/卫星图层 | 瓦片正常显示 |
| 11 | 数据面板有数据 | 查看灾害评估、韧性概况 | 数据非空 |
| 12 | 区县切换 | 点击地图区县 | 雷达图数据切换 |