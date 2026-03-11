#!/bin/bash
# VPS 部署和启动脚本
# 部署目录: /opt/api
#
# 安全要求：本脚本不得在仓库中硬编码任何 token/密码。
# 运行前请在 shell 环境中提供必要的环境变量。

set -euo pipefail

API_DIR="/opt/api"
DATA_DIR="$API_DIR/data"

require_env() {
  local name="$1"
  local hint="$2"
  if [ -z "${!name:-}" ]; then
    echo "❌ 缺少环境变量: $name" >&2
    echo "   提示: $hint" >&2
    exit 1
  fi
}

echo "🚀 开始部署 meituantest API 到 VPS..."

# 1. 创建目录
echo "📁 创建目录..."
mkdir -p "$DATA_DIR"

# 2. 检查代码是否存在
if [ ! -f "$API_DIR/go.mod" ]; then
  echo "❌ 错误: 未找到 go.mod，请先上传代码到 $API_DIR" >&2
  echo "   上传命令: scp -r api/* user@vps:/opt/api/" >&2
  exit 1
fi

# 3. 创建 Linux 版本的 .env
#    注意：此处会把环境变量写入 /opt/api/.env（用于服务启动）。
require_env "MEITUAN_JWT_SECRET" "例如 export MEITUAN_JWT_SECRET=replace-with-long-random-value"
require_env "MEITUAN_MASTER_TOKEN" "例如 export MEITUAN_MASTER_TOKEN=replace-with-long-random-value"
require_env "MEITUAN_SUPER_PASSWORD" "例如 export MEITUAN_SUPER_PASSWORD=replace-with-long-random-value"

echo "⚙️  创建 VPS 环境配置..."
cat > "$API_DIR/.env" <<EOF
# meituantest VPS 配置
MEITUAN_SERVER_PORT=3031
MEITUAN_SERVER_MODE=release
MEITUAN_DATABASE_PATH=/opt/api/data/meituantest.db
MEITUAN_JWT_SECRET=$MEITUAN_JWT_SECRET
MEITUAN_MASTER_TOKEN=$MEITUAN_MASTER_TOKEN
MEITUAN_ALLOWED_ORIGINS=https://foodtest.serbia70.com,https://*.foodtest.serbia70.com,https://api-foodtest.serbia70.com
MEITUAN_FRONTEND_URL=https://foodtest.serbia70.com
MEITUAN_SUPER_PASSWORD=$MEITUAN_SUPER_PASSWORD
EOF
chmod 600 "$API_DIR/.env" || true

echo "   ✅ 配置已创建"

# 4. 构建
echo "🔨 构建后端..."
cd "$API_DIR"
export GO111MODULE=on
export GOPROXY=https://goproxy.cn,direct
go mod download
go build -o meituantest-server ./cmd/server

echo "   ✅ 构建完成"

# 5. 停止旧进程
echo "🛑 停止旧进程..."
pkill -f "meituantest-server" 2>/dev/null || true
sleep 2

# 6. 加载环境变量并启动服务
echo "🚀 启动服务..."
# 加载 .env 文件到环境变量
set -a
# shellcheck disable=SC1090
source "$API_DIR/.env"
set +a
# 启动服务
nohup "$API_DIR/meituantest-server" > "$API_DIR/server.log" 2>&1 &
sleep 3

# 7. 检查是否启动成功
if pgrep -f "meituantest-server" > /dev/null; then
  PID=$(pgrep -f "meituantest-server")
  echo "✅ 服务已启动 (PID: $PID)"
  echo "   日志: tail -f $API_DIR/server.log"
  echo "   测试: curl http://localhost:3031/ping"
else
  echo "❌ 启动失败，检查日志:" >&2
  tail -20 "$API_DIR/server.log" >&2
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ API 服务已启动！"
echo "=========================================="
echo ""
echo "📝 下一步 - 配置 Nginx:"
echo "   1. 安装 Nginx: sudo apt install nginx certbot python3-certbot-nginx"
echo "   2. 复制 nginx 配置（见下方）"
echo "   3. 申请 SSL: sudo certbot --nginx -d api-foodtest.serbia70.com"
echo ""