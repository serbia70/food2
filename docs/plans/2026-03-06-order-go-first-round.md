# Order Go First Round Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变现有订单创建、堂食合单、外卖扣费、MQTT/打印发布行为的前提下，对 `order.go` 做第一轮结构拆分，让主 handler 回归编排层。

**Architecture:** 第一轮只做“结构收口，不改语义”。先把纯 helper、堂食流程、外卖扣费事务、发布逻辑分别拆到独立文件，`order.go` 继续保留对外 handler 入口，降低回归风险。

**Tech Stack:** Go, Gin, sqlx, MQTT

---

### Task 1: 拆出 order_create_helpers.go

**Files:**
- Create: `meituanGo/internal/handlers/order_create_helpers.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取纯 helper**

提取：
- `parseOrderScheduledFor`
- `normalizeScheduledFor`
- `normalizeItemList`
- `mergeOrderItems`
- `mergeRemarks`
- `buildPrinterItems`
- `pickupNoFromOrderNo`
- `errorsIsNoRows`

**Step 2: 保持行为不变**

不要修改：
- 错误文案
- 时间格式
- 合单策略
- 打印商品名构造规则

---

### Task 2: 拆出 order_dinein_flow.go

**Files:**
- Create: `meituanGo/internal/handlers/order_dinein_flow.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取堂食活跃桌单相关逻辑**

提取：
- 活跃桌单查询
- `add` 合单流程
- `new` 关闭旧单流程

**Step 2: 保持 handler 结果不变**

不要改变：
- 合单后的响应结构
- 桌号匹配规则
- checkout 事件发布

---

### Task 3: 拆出 order_delivery_flow.go

**Files:**
- Create: `meituanGo/internal/handlers/order_delivery_flow.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取外卖扣费事务**

提取：
- 佣金扣减
- ledger 写入
- commission_records 写入

**Step 2: 保持事务边界不变**

不要改变：
- 扣费失败返回码
- balance 不足时的错误响应
- UNIQUE order_no 冲突时的重试机制

---

### Task 4: 拆出 order_publishers.go

**Files:**
- Create: `meituanGo/internal/handlers/order_publishers.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取发布逻辑**

提取：
- frontend MQTT publish
- realtime publish
- printer publish payload 构造

**Step 2: 保持消息结构不变**

不要改变：
- 事件名
- 字段名
- printer payload 内容

---

### Task 5: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-order-go-first-round.md`

**Step 1: 记录本轮完成范围**

记录已拆出的：
- `order_create_helpers.go`
- `order_dinein_flow.go`
- `order_delivery_flow.go`
- `order_publishers.go`

**Step 2: 记录后续范围**

后续再考虑：
- 真正的 service 层
- `CreateOrder` 进一步缩成 orchestration
- 积分/VIP 逻辑继续外提
