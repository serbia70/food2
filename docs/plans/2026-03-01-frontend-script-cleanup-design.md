# Frontend Script Cleanup Design

## Goal
整理前端页面内联脚本的结构与职责边界，减少全局污染与重复逻辑，提升可读性与可维护性，同时保持现有行为不变。

## Scope
- 仅整理 `meituanAstro/src/pages/[slug]/index.astro` 内联脚本。
- 保持现有功能与 UI 行为不变。
- 不迁移到独立脚本文件，不引入新框架或组件化重构。

## Chosen Approach
**轻量内联重构：**
- 保留内联脚本与 `window.*` 入口。
- 将工具函数、数据处理、UI 渲染和路由跳转拆分为逻辑块。
- 只暴露必要的全局函数，其余封装在闭包内部。

## Structure
- `utils`：
  - `__esc`
  - `buildTableLookupKeys`
  - 时间格式化辅助
- `tableDetails`：
  - `showTableDetailsModal`
  - `closeTableDetailsModal`
  - `openTableDetails`
- `navActions`：
  - `openTableOrder`
  - `openTableAdd`
  - `goToDeliveryMode`
  - `openReservationModal`

## Data Flow
1) `openTableDetails(tableValue, displayNum)`
2) 通过 `buildTableLookupKeys` 生成多种可能的桌号 key
3) 并行请求 `/api/order/by_table` 并合并去重
4) 过滤结束状态
5) 生成展示行与合计金额
6) 统一渲染弹窗

## Error Handling
- 请求或解析失败时，统一展示“加载失败，请稍后重试”。
- `orders` 非数组时视为 `[]`，不触发异常。
- 仅在入口函数捕获异常，避免多处吞错造成噪音。

## Non-goals
- 不引入新依赖或自动化测试框架。
- 不改动 API 协议。
- 不进行组件化或脚本外置。
