#!/bin/bash
# 诊断和修复 meituantest 数据库

echo "🔍 诊断数据库..."

# 检查数据库文件
if [ ! -f "/opt/api/data/meituan.db" ]; then
    echo "❌ 数据库文件不存在: /opt/api/data/meituan.db"
    echo "正在从生产环境复制..."
    cp /opt/meituanGo/data/meituan.db /opt/api/data/meituan.db
fi

echo "✅ 数据库文件存在"

# 检查表结构
echo ""
echo "📋 检查 master_admin 表..."
sqlite3 /opt/api/data/meituan.db ".schema master_admin"

# 检查数据
echo ""
echo "👤 检查用户..."
sqlite3 /opt/api/data/meituan.db "SELECT id, username, password FROM master_admin;"

# 检查 shops 表
echo ""
echo "🏪 检查店铺..."
sqlite3 /opt/api/data/meituan.db "SELECT COUNT(*) as shop_count FROM shops;"

# 如果需要修复密码
echo ""
echo "📝 如果要修改密码为 admin888，执行:"
echo "  sqlite3 /opt/api/data/meituan.db \"UPDATE master_admin SET password = 'admin888' WHERE username = 'admin';\""

echo ""
echo "🚀 重启服务:"
echo "  sudo systemctl restart meituantest"
