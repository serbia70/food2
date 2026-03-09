# Order Go Second Round Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `order.go` 第一轮拆分稳定后，继续把 delivery 奖励逻辑和订单状态流转逻辑从主 handler 中抽离，进一步缩小 `order.go` 的职责范围。

**Architecture:** 第二轮继续坚持“结构收口，不改语义”。先把 `CreateOrder` 中 delivery 完成后的积分/消费/VIP 处理抽到 `order_customer_rewards.go`，再把 `UpdateOrderStatus` 的状态更新与通知发布抽到 `order_status_flow.go`。

**Tech Stack:** Go, Gin, sqlx

---

### Task 1: 拆出 order_customer_rewards.go

**Files:**
- Create: `meituanGo/internal/handlers/order_customer_rewards.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取 delivery 奖励逻辑**

提取：
- use points 扣减
- points_per_spend 配置读取
- 积分累加
- 消费累计
- VIP 升级
- 响应字段填充

**Step 2: 保持行为不变**

不要改变：
- `points_deducted`
- `points_value_rsd`
- `points_earned`
- 对 delivery 之外订单不处理奖励

---

### Task 2: 拆出 order_status_flow.go

**Files:**
- Create: `meituanGo/internal/handlers/order_status_flow.go`
- Modify: `meituanGo/internal/handlers/order.go`

**Step 1: 提取 UpdateOrderStatus 主流程**

提取：
- 校验订单归属
- 状态更新 SQL
- 佣金记录触发
- status_update MQTT / realtime publish

**Step 2: 保持行为不变**

不要改变：
- 支持 courier_name / courier_phone 的更新路径
- 404 / 401 / 500 的返回条件
- status_update 消息结构

---

### Task 3: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-order-go-second-round.md`

**Step 1: 记录完成范围**

记录已拆出的：
- `order_customer_rewards.go`
- `order_status_flow.go`

**Step 2: 记录后续范围**

后续再考虑：
- `GetOrder` / `ListOrders` 收口
- 真正 service 层化
