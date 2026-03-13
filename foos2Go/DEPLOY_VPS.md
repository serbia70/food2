# meituanGo VPS 部署指南

本文用于将 `meituanGo` 部署到 Linux VPS，并提供给 `meituanAstro` 前端调用。

## 1. 准备环境

- Go 版本建议 >= 1.22
- Linux 用户建议使用 `systemd`
- 准备一个对外域名（例如 `api.your-domain.com`）

## 2. 上传代码并配置环境变量

```bash
cp .env.example .env
```

关键变量：

- `MEITUAN_SERVER_PORT`：服务端口（建议 `3030`）
- `MEITUAN_DATABASE_PATH`：数据库路径（建议绝对路径）
- `MEITUAN_JWT_SECRET`：JWT 密钥（必须改成强随机字符串）
- `MEITUAN_MASTER_TOKEN`：主控口令（必须改）
- `MEITUAN_ALLOWED_ORIGINS`：允许的前端域名（支持精确域名与通配符子域）

示例：

```env
MEITUAN_SERVER_PORT=3030
MEITUAN_DATABASE_PATH=/opt/meituan-go/data/meituan.db
MEITUAN_JWT_SECRET=replace-with-long-random-value
MEITUAN_MASTER_TOKEN=replace-with-long-random-value
MEITUAN_ALLOWED_ORIGINS=https://your-project.pages.dev,https://www.your-domain.com,https://*.serbia70.com
```

## 3. 构建并启动

```bash
go build -o meituan-server ./cmd/server
./meituan-server
```

## 4. 配置 systemd（推荐）

示例服务文件：`/etc/systemd/system/meituan-go.service`

```ini
[Unit]
Description=Meituan Go API Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/meituan-go
ExecStart=/opt/meituan-go/meituan-server
Restart=always
RestartSec=3
EnvironmentFile=/opt/meituan-go/.env

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable meituan-go
sudo systemctl start meituan-go
sudo systemctl status meituan-go
```

## 5. 反向代理与 HTTPS

建议使用 Nginx/Caddy 代理到 `127.0.0.1:3030`，并配置 TLS。

完成后，前端把 `PUBLIC_API_URL` 指向此 HTTPS 域名。

## 6. 联调检查

- `GET /ping` 返回 `pong`
- `/{slug}/info` 与 `/{slug}/menu` 能正常返回数据
- 前端下单、商家后台登录、订单流转都正常
