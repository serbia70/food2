#!/bin/bash
# 使用生产数据库 meituan.db 到测试环境
#
# 安全要求：本脚本不得在仓库中硬编码任何 token/密码。
# 运行前请在 shell 环境中提供必要的环境变量。

set -euo pipefail

API_DIR="/opt/api"
DATA_DIR="$API_DIR/data"
PROD_DB="/opt/meituanGo/data/meituan.db"
TEST_DB="$DATA_DIR/meituan.db"

require_env() {
  local name="$1"
  local hint="$2"
  if [ -z "${!name:-}" ]; then
    echo "❌ 缺少环境变量: $name" >&2
    echo "   提示: $hint" >&2
    exit 1
  fi
}

# 运行前要求提供 secrets（会写入 /opt/api/.env 用于服务启动）
require_env "MEITUAN_JWT_SECRET" "例如 export MEITUAN_JWT_SECRET=replace-with-long-random-value"
require_env "MEITUAN_MASTER_TOKEN" "例如 export MEITUAN_MASTER_TOKEN=replace-with-long-random-value"
require_env "MEITUAN_SUPER_PASSWORD" "例如 export MEITUAN_SUPER_PASSWORD=replace-with-long-random-value"

echo "🔄 复制生产数据库到测试环境..."

# 1. 检查生产数据库是否存在
if [ ! -f "$PROD_DB" ]; then
  echo "❌ 错误: 未找到生产数据库 $PROD_DB" >&2
  exit 1
fi

echo "✅ 找到生产数据库: $PROD_DB"
echo "   大小: $(du -h "$PROD_DB" | cut -f1)"

# 2. 停止测试服务
echo ""
echo "🛑 停止测试服务..."
sudo systemctl stop meituantest
sleep 2

# 3. 备份现有测试数据库（如果有）
if [ -f "$DATA_DIR/meituantest.db" ]; then
  echo "📦 备份测试数据库..."
  mv "$DATA_DIR/meituantest.db" "$DATA_DIR/meituantest.db.bak.$(date +%Y%m%d_%H%M%S)"
fi

# 4. 复制生产数据库
echo ""
echo "📂 复制生产数据库..."
cp "$PROD_DB" "$TEST_DB"

# 5. 确保权限正确
chmod 644 "$TEST_DB"

echo "✅ 数据库已复制到: $TEST_DB"

# 6. 更新环境变量配置
echo ""
echo "⚙️  更新配置..."
cat > "$API_DIR/.env" <<EOF
# meituantest VPS 配置（使用生产数据库）
MEITUAN_SERVER_PORT=3031
MEITUAN_SERVER_MODE=release
MEITUAN_DATABASE_PATH=/opt/api/data/meituan.db
MEITUAN_JWT_SECRET=$MEITUAN_JWT_SECRET
MEITUAN_MASTER_TOKEN=$MEITUAN_MASTER_TOKEN
MEITUAN_ALLOWED_ORIGINS=https://foodtest.serbia70.com,https://*.foodtest.serbia70.com,https://api-foodtest.serbia70.com,https://api.serbia70.com
MEITUAN_FRONTEND_URL=https://foodtest.serbia70.com
MEITUAN_SUPER_PASSWORD=$MEITUAN_SUPER_PASSWORD
EOF
chmod 600 "$API_DIR/.env" || true

echo "✅ 配置已更新"

# 7. 启动服务
echo ""
echo "🚀 启动服务..."
sudo systemctl start meituantest
sleep 3

# 8. 检查状态
if sudo systemctl is-active --quiet meituantest; then
  echo "✅ 服务已启动"
  echo ""
  echo "🧪 测试接口..."
  curl -s http://localhost:3031/ping
  echo ""
  echo ""
  echo "📊 数据库统计:"
  sqlite3 "$TEST_DB" "SELECT '店铺数量: ' || COUNT(*) FROM shops;" 2>/dev/null || echo "   无法读取店铺表"
  sqlite3 "$TEST_DB" "SELECT '订单数量: ' || COUNT(*) FROM orders;" 2>/dev/null || echo "   无法读取订单表"
  sqlite3 "$TEST_DB" "SELECT '商品数量: ' || COUNT(*) FROM products;" 2>/dev/null || echo "   无法读取商品表"
else
  echo "❌ 启动失败" >&2
  sudo systemctl status meituantest
fi

echo ""
echo "=========================================="
echo "✅ 完成！测试环境现在使用生产数据库"
echo "=========================================="
echo ""
echo "⚠️  注意: 测试环境的操作会影响生产数据！"
echo "   建议仅用于测试，不要修改重要数据"
echo ""
echo "🔗 访问地址:"
echo "   https://api-foodtest.serbia70.com"
echo ""