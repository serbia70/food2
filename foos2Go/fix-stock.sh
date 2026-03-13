#!/bin/bash
# 修复 stock 字段数据类型错误

echo "🔧 修复 stock 字段..."

echo ""
echo "1. 检查 stock 字段的数据类型:"
sqlite3 /opt/api/data/meituan.db "PRAGMA table_info(products);" | grep stock

echo ""
echo "2. 检查 rtiam 店铺的 stock 值:"
sqlite3 /opt/api/data/meituan.db "
SELECT 
  '空字符串:' || COUNT(*) as empty_string,
  'NULL:' || SUM(CASE WHEN stock IS NULL THEN 1 ELSE 0 END) as null_count,
  '正常值:' || SUM(CASE WHEN stock IS NOT NULL AND stock != '' THEN 1 ELSE 0 END) as normal
FROM products 
WHERE shop_id=7;
"

echo ""
echo "3. 修复 stock 字段（将空字符串和NULL改为-1）:"
sqlite3 /opt/api/data/meituan.db "
UPDATE products 
SET stock = -1 
WHERE shop_id = 7 
AND (stock IS NULL OR stock = '');
"

echo "✅ 已修复"

echo ""
echo "4. 验证修复:"
sqlite3 /opt/api/data/meituan.db "
SELECT 
  SUM(CASE WHEN stock IS NULL OR stock = '' THEN 1 ELSE 0 END) as bad_count
FROM products 
WHERE shop_id=7;
"

echo ""
echo "5. 重启服务:"
sudo systemctl restart meituantest
sleep 3

echo ""
echo "6. 测试 API:"
curl -s "http://localhost:3031/rtiam/menu" | head -100
