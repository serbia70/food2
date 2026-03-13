#!/bin/bash
# 修复 token 和 systemd 服务
#
# 安全要求：本脚本不得在仓库中硬编码任何 token/密码。

set -euo pipefail

ENV_FILE="/opt/api/.env"
SERVICE_FILE="/etc/systemd/system/meituantest.service"

echo "🔧 修复 token 和服务..."

# 1. 加载 /opt/api/.env（不打印 secrets）
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 未找到 $ENV_FILE，请先部署并生成 .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if grep -q '^MEITUAN_MASTER_TOKEN=' "$ENV_FILE"; then
  echo "✅ MEITUAN_MASTER_TOKEN 已在 $ENV_FILE 中配置"
else
  echo "❌ $ENV_FILE 中缺少 MEITUAN_MASTER_TOKEN" >&2
  exit 1
fi

: "${MEITUAN_MASTER_TOKEN:?MEITUAN_MASTER_TOKEN 不能为空（来自 $ENV_FILE 或环境变量）}"

echo ""
echo "数据库中的 master_admin 密码(可能为哈希/密文):"
sqlite3 /opt/api/data/meituan.db "SELECT password FROM master_admin WHERE username='admin';"

# 2. 使用 .env 中的 token 测试（不在输出中打印 token）
echo ""
echo "🧪 使用当前 token 测试:"
curl -s -H "Authorization: Bearer ${MEITUAN_MASTER_TOKEN}" http://localhost:3031/api/master/init 2>/dev/null | head -50

# 3. 如果前台运行成功，检查 systemd 为什么失败
echo ""
echo "🔍 检查 systemd 错误:"
sudo systemctl status meituantest --no-pager 2>&1 | tail -20

# 4. 检查端口冲突
echo ""
echo "🔍 检查 3031 端口占用:"
netstat -tlnp 2>/dev/null | grep 3031 || ss -tlnp | grep 3031

# 5. 完全重启 systemd 服务
echo ""
echo "🚀 完全重启服务..."
sudo systemctl stop meituantest 2>/dev/null || true
pkill -9 -f meituantest-server 2>/dev/null || true
sleep 2

# 使用 EnvironmentFile 读取 /opt/api/.env，避免在 service 文件中硬编码任何 secrets
sudo tee "$SERVICE_FILE" << 'EOF'
[Unit]
Description=Meituantest API Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/api
EnvironmentFile=/opt/api/.env
ExecStart=/opt/api/meituantest-server
Restart=always
RestartSec=5
User=root
StandardOutput=append:/opt/api/server.log
StandardError=append:/opt/api/server.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start meituantest
sleep 3

echo ""
echo "✅ 最终验证:"
sudo systemctl is-active meituantest && echo "服务运行中" || echo "服务未运行"
grep "Database path" /opt/api/server.log | tail -1
curl -s -H "Authorization: Bearer ${MEITUAN_MASTER_TOKEN}" http://localhost:3031/api/master/init 2>/dev/null | head -100
