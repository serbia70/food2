#!/bin/bash
# 直接测试 API 返回

echo "🔍 直接测试 API 返回"

echo ""
echo "1. 测试 rtiam 菜单 API:"
curl -s "http://localhost:3031/rtiam/menu" 2>&1 | tee /tmp/rtiam-response.json | head -100

echo ""
echo "2. 检查返回是否为空:"
if [ -s /tmp/rtiam-response.json ]; then
    echo "✅ API 有返回数据"
    cat /tmp/rtiam-response.json | wc -c
    echo "字节"
else
    echo "❌ API 返回为空"
fi

echo ""
echo "3. 对比能正常工作的店铺 (01):"
curl -s "http://localhost:3031/01/menu" 2>&1 | head -50

echo ""
echo "4. 检查日志中的错误:"
sudo tail -50 /opt/api/server.log | grep -E "rtiam|error|Error"

echo ""
echo "5. 重启服务后再次测试:"
sudo systemctl restart meituantest
sleep 3
curl -s "http://localhost:3031/rtiam/menu" 2>&1 | head -50
