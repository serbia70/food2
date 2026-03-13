#!/bin/bash
# 完全修复 - 强制使用新的二进制文件

echo "🔧 完全修复..."

# 1. 完全停止服务
echo "🛑 完全停止服务..."
sudo systemctl stop meituantest
sudo systemctl disable meituantest
pkill -9 -f meituantest-server
sleep 2

# 2. 备份并删除旧二进制
echo "📦 备份旧二进制..."
mv /opt/api/meituantest-server /opt/api/meituantest-server.bak.$(date +%s) 2>/dev/null || true

# 3. 确保代码修改正确（强制绝对路径）
echo "✏️  修改代码..."
sudo sed -i 's|SetDefault("database.path", "[^"]*")|SetDefault("database.path", "/opt/api/data/meituan.db")|g' /opt/api/internal/config/config.go

# 显示修改后的代码
grep -n "SetDefault.*database" /opt/api/internal/config/config.go

# 4. 重新编译
echo "🔨 重新编译..."
cd /opt/api
go build -o meituantest-server ./cmd/server

# 5. 确认编译成功
echo "✅ 确认二进制文件:"
ls -lh /opt/api/meituantest-server
echo "编译时间:"
stat /opt/api/meituantest-server | grep Modify

# 6. 清理数据目录
echo "🧹 清理数据目录..."
rm -f /opt/api/data/meituantest.db*
cp /opt/meituanGo/data/meituan.db /opt/api/data/meituan.db 2>/dev/null || true

# 7. 手动前台运行测试
echo ""
echo "🧪 前台运行测试（按 Ctrl+C 停止）..."
cd /opt/api
export MEITUAN_SERVER_PORT=3031
export MEITUAN_DATABASE_PATH=/opt/api/data/meituan.db
./meituantest-server 2>&1 | tee /tmp/api-test.log &
TEST_PID=$!
sleep 3

echo ""
echo "检查日志:"
grep "Database path" /tmp/api-test.log || grep "Database path" /opt/api/server.log | tail -1

echo ""
echo "测试 API:"
curl -s -H "Authorization: Bearer e2fa878eec9def46" http://localhost:3031/api/master/init | head -100

# 8. 停止前台进程，启动 systemd
echo ""
echo "🚀 切换到 systemd..."
kill $TEST_PID 2>/dev/null || true
sleep 1

sudo systemctl enable meituantest
sudo systemctl start meituantest
sleep 3

echo ""
echo "最终验证:"
sudo systemctl status meituantest --no-pager | head -5
grep "Database path" /opt/api/server.log | tail -1
