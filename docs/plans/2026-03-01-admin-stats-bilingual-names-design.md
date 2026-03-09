# Admin Stats Bilingual Item Names Design

## Goal
在后台统计“菜品销量排名”中，菜名显示为商家实际录入内容：有 `sub_name` 则显示双语，否则仅显示单语，不做自动翻译。

## Context
- 统计接口：`/api/admin/stats`（后端 `AdminStats`）。
- 商品表有 `name`（塞语）与 `sub_name`（中文）。
- 现有统计按订单 `items_json` 的 `name` 聚合，未包含中文名。

## Approach (Chosen)
1) 后端按 `product_id` 优先聚合，补齐 `name/sub_name`。
2) 在 `topItems` 中新增 `display_name` 字段：
   - 若 `sub_name` 非空：`"${name} / ${sub_name}"`
   - 否则：`name`
3) 前端统计表渲染时优先使用 `display_name`，无则回退 `name`。

## Data Flow
- 订单 `items_json` → 提取 `product_id/name/quantity/price`。
- 通过 `product_id` 批量查询 `products.name/sub_name`。
- 统计聚合输出：`name`, `sub_name`, `display_name`, `count`, `amount`。
- 前端展示 `display_name`。

## Error Handling
- 未找到 `product_id` 或产品信息缺失：回退使用 `name`。
- `sub_name` 为空：不拼接双语。

## Non-goals
- 自动翻译菜名。
- 修改历史订单数据结构。
