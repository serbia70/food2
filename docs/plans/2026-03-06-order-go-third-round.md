# Order Go Third Round Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `order.go` 前两轮拆分完成后，继续把 order number 生成、单订单查询、订单列表查询从主 handler 文件中抽离，让 `order.go` 更接近薄入口。

**Architecture:** 第三轮继续采用低风险文件级收口，不引入 service 层。通过提取 `order_numbering.go`、`order_query_flow.go`、`order_list_flow.go`，把读接口和编号逻辑从 `order.go` 中分离出来，保留现有语义与 SQL。

**Tech Stack:** Go, Gin, sqlx

---

### Task 1: 拆出 order_numbering.go

**Files:**
- Create: `meituanGo/internal/handlers/order_numbering.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取编号生成逻辑**

提取：
- `generateOrderNo`
- `nextDailyOrderNo`
- `loadOrderNoLocation`

**Step 2: 保持行为不变**

不要改变：
- 前缀格式
- 每日递增逻辑
- 溢出 fallback

---

### Task 2: 拆出 order_query_flow.go

**Files:**
- Create: `meituanGo/internal/handlers/order_query_flow.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取 GetOrder 相关逻辑**

提取：
- 按 slug 查 shop
- 按 order_no + shop_id 查订单

**Step 2: 保持行为不变**

不要改变：
- 404 条件
- 返回的 order 结构

---

### Task 3: 拆出 order_list_flow.go

**Files:**
- Create: `meituanGo/internal/handlers/order_list_flow.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取 ListOrders 相关逻辑**

提取：
- no-store 相关 headers
- status query filter
- 排序与 limit
- 空切片兜底

**Step 2: 保持行为不变**

不要改变：
- 缓存头
- 默认 limit=50
- status 过滤语义

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-order-go-third-round.md`

**Step 1: 记录本轮完成范围**

记录已拆出的：
- `order_numbering.go`
- `order_query_flow.go`
- `order_list_flow.go`

**Step 2: 记录后续范围**

后续再考虑：
- service 层抽象
- `order.go` 只保留极薄 handler 壳
