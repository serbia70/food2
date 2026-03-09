# Table Details Optimization Design

## Goal
减少桌号详情请求次数与并发压力，并统一错误处理逻辑，保持现有行为不变。

## Scope
- 仅调整前端 `table-details` 逻辑。
- 不改后端 API 协议。
- 维持现有文案与 UI 行为。

## Approach
- 在 `table-details.ts` 内实现请求缓存与并发限制。
- 统一错误处理与失败回退。

## Data Flow
1) `openTableDetails` 生成 `keys`。
2) 将每个 key 转成 `fetch` 任务。
3) 通过 `runWithConcurrency(3, tasks)` 控制并发。
4) 合并/去重订单，过滤结束状态。
5) 渲染弹窗（无订单/有订单/失败）。

## Request Optimization
- **缓存**：`Map<string, Promise<Order[]>>`，key 为 `slug|tableKey`。
- **失败不缓存**：空数组或失败不写入缓存，避免错误被固化。
- **并发限制**：默认 3，可作为常量。

## Error Handling
- `safeFetchOrders` 只在 `res.ok` 时解析 JSON。
- `orders` 非数组返回空数组。
- 入口异常统一显示“加载失败，请稍后重试”。

## Files
- Modify: `meituanAstro/src/scripts/shop/table-details.ts`
- Optional: `meituanAstro/src/scripts/shop/table-page.ts`
