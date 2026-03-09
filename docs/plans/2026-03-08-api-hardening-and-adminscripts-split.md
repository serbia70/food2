# API Hardening And AdminScripts Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为高频 API 路由建立统一校验/错误基础层，并把 `AdminScripts.astro` 按业务域拆分，降低后台复杂度与回归风险。

**Architecture:** 先在 `src/lib` 建立统一 API helper，把高频接口接入一致的 body/query 校验与响应结构；再把后台脚本按 reservations/order-edit/stats 等业务域逐步迁出 `AdminScripts.astro`，最终保留一个轻量装配层。这样拆出的模块共享同一套 fetch、DOM、安全与错误处理能力，不会复制旧问题。

**Tech Stack:** Astro, TypeScript, pnpm, zod

---

### Task 1: 建立统一 API 基础层

**Files:**
- Modify: `src/lib/validation.ts`
- Modify: `src/lib/api-proxy.ts`
- Create: `src/lib/api/response.ts`
- Create: `src/lib/api/request.ts`

**Step 1: 写最小失败验证思路**

明确非法 body/query 应返回一致 JSON 结构，而不是抛未处理异常或返回多种格式。

**Step 2: 提供统一 helper**

实现：
- `parseJsonBody()`
- `parseQuery()`
- `jsonOk()`
- `jsonError()`
- 统一 proxy helper

**Step 3: 运行构建验证 helper 不破坏现有项目**

Run: `pnpm run build`
Expected: 构建通过。

### Task 2: 接入首批 API 路由

**Files:**
- Modify: `src/pages/api/order.ts`
- Modify: `src/pages/api/reservation.ts`
- Modify: `src/pages/api/user/address.ts`
- Modify: `src/pages/api/admin/stats.ts`
- Modify: `src/pages/api/admin/reservations.ts`
- Modify: `src/pages/api/admin/orders.ts`

**Step 1: 先接一个代表性路由**

优先以 `src/pages/api/order.ts` 为模板接入统一 helper。

**Step 2: 扩展到其余首批路由**

让这些路由统一：
- 参数解析
- 校验错误格式
- 上游失败格式

**Step 3: 运行构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 3: 提取 admin core 模块

**Files:**
- Create: `src/scripts/admin/core.ts`
- Modify: `src/components/admin/AdminScripts.astro`

**Step 1: 抽出公用能力**

迁出：
- fetch 包装
- action delegation
- toast
- DOM helper
- 安全 helper

**Step 2: 让 `AdminScripts.astro` 改为装配式调用**

保留页面上下文注入，改为 import `core.ts` 并初始化。

**Step 3: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 4: 拆分 reservations 模块

**Files:**
- Create: `src/scripts/admin/reservations.ts`
- Modify: `src/components/admin/AdminScripts.astro`

**Step 1: 迁移预约相关逻辑**

迁出：
- reservation stats
- reservation list
- update reservation status
- print reservation

**Step 2: 确保仍通过 core helper 接入 DOM/fetch**

避免复制新的公用逻辑。

**Step 3: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 5: 拆分 order-edit 模块

**Files:**
- Create: `src/scripts/admin/order-edit.ts`
- Modify: `src/components/admin/AdminScripts.astro`

**Step 1: 迁移订单编辑相关逻辑**

迁出：
- open order edit modal
- render order items
- change/remove/add item
- save order edit
- print order

**Step 2: 复用 core helper**

保持 DOM 渲染、安全 helper 一致。

**Step 3: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 6: 拆分 stats 模块

**Files:**
- Create: `src/scripts/admin/stats.ts`
- Modify: `src/components/admin/AdminScripts.astro`

**Step 1: 迁移统计与汇率逻辑**

迁出：
- loadStats
- loadStatsQuiet
- autoUpdateRate
- fetchRateManually

**Step 2: 保持统计表格 DOM 渲染不回退**

避免重新引入 `innerHTML +=` 风险。

**Step 3: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 7: 收紧 AdminScripts 装配层

**Files:**
- Modify: `src/components/admin/AdminScripts.astro`

**Step 1: 删除已迁出模块的重复实现**

只保留装配代码与必要上下文。

**Step 2: 检查文件体积与职责**

确保 `AdminScripts.astro` 明显变短，职责收敛。

**Step 3: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 8: 全量验证

**Files:**
- Test: `package.json`

**Step 1: 运行构建**

Run: `pnpm run build`
Expected: 构建通过。

**Step 2: 手工 smoke check 关键后台路径**

检查：
- 预约列表/更新/打印
- 订单编辑
- 统计与汇率
- 地址页

**Step 3: 确认收口目标**

检查：
- 首批 API 已统一使用基础 helper
- `AdminScripts.astro` 已从“大一统”转向装配层
