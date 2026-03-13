#!/bin/bash
# 检查 rtiam 店铺的菜单数据

echo "🔍 检查 rtiam 店铺 (ID: 7)"

echo ""
echo "1. 检查店铺信息:"
sqlite3 /opt/api/data/meituan.db "SELECT id, name, slug, status FROM shops WHERE slug='rtiam';"

echo ""
echo "2. 检查分类数量:"
sqlite3 /opt/api/data/meituan.db "SELECT COUNT(*) FROM categories WHERE shop_id=7;"

echo ""
echo "3. 检查商品数量:"
sqlite3 /opt/api/data/meituan.db "SELECT COUNT(*) FROM products WHERE shop_id=7;"

echo ""
echo "4. 查看分类列表:"
sqlite3 /opt/api/data/meituan.db "SELECT id, name, sort_order FROM categories WHERE shop_id=7 ORDER BY sort_order;"

echo ""
echo "5. 查看商品列表:"
sqlite3 /opt/api/data/meituan.db "SELECT id, name, category_id, price, status FROM products WHERE shop_id=7 LIMIT 10;"

echo ""
echo "6. 测试 API 返回:"
curl -s "http://localhost:3031/rtiam/menu" | head -500

echo ""
echo "7. 检查店铺设置中的菜单配置:"
sqlite3 /opt/api/data/meituan.db "SELECT settings FROM shops WHERE slug='rtiam';"
