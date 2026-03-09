# Frontend Script Modularization Design

## Goal
将 `index.astro` 内联脚本模块化到 `src/scripts`，减少单文件复杂度与全局污染，保持现有行为不变。

## Scope
- 仅拆分桌号页面脚本逻辑。
- 维持现有 UI/交互与接口协议。
- 不引入新的框架或依赖。

## Chosen Approach
将逻辑拆分到 `src/scripts/shop` 下的多个模块，并在 `index.astro` 使用 `type="module"` 引入入口脚本，保留一个轻量 bootstrap 用于注入 `slug` 与配置。

## Module Boundaries
- `src/scripts/shop/table-utils.ts`
  - `buildTableLookupKeys`
  - `escapeHtml`
  - 时间格式化辅助
- `src/scripts/shop/table-details.ts`
  - `openTableDetails`
  - `showTableDetailsModal`
  - `closeTableDetailsModal`
  - `safeFetchOrders`
- `src/scripts/shop/table-actions.ts`
  - `openTableOrder`
  - `openTableAdd`
  - `goToDeliveryMode`
  - `openReservationModal`
- `src/scripts/shop/table-page.ts`
  - 入口初始化
  - 绑定 `window.*` 入口

## Data Flow
1) 页面通过 bootstrap 调用 `initTablePage({ slug, endedStatusList, belgradeTimeOptions })`
2) `table-page.ts` 初始化 utils 并挂载 `window.*` 入口
3) 点击“订单详情”调用 `openTableDetails`：
   - 生成 key 列表
   - 并发请求 `/api/order/by_table`
   - 合并去重、过滤结束状态
   - 组装展示行与合计
   - 渲染弹窗

## Error Handling
- `safeFetchOrders`：`res.ok` 才解析；`orders` 非数组返回 `[]`；异常返回 `[]`。
- `openTableDetails` 入口捕获异常并展示“加载失败，请稍后重试”。

## Request Optimization (Lightweight)
- 单次点击内对 `key` 请求结果做缓存去重。
- 维持 `Promise.all` 并发，但限制最大并发（例如 3），避免高峰请求压力。

## Compatibility Notes
- 仅保留原有 6 个 `window.*` 入口。
- `buildTableLookupKeys` 必须在前端模块内可用。
- 不改变接口协议与现有 UI 文案。
