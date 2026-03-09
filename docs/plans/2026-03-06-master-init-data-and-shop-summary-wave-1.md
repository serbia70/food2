# Master Init Data And Shop Summary Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `MasterInitData` 从 `master.go` 中拆出，并为每个店铺补充经营摘要字段，让 master 后台具备基础经营看板能力。

**Architecture:** 这一期只做“MasterInitData 迁移 + 摘要聚合增强”，不做复杂结算流。保持 `shops` 返回结构兼容，在每个 shop 上新增营业额、订单量、提成和余额相关字段，供现有 master 页面直接消费。

**Tech Stack:** Go, Gin, sqlx

---

### Task 1: 迁移 MasterInitData 到 master_init_data.go

**Files:**
- Create: `meituanGo/internal/handlers/master_init_data.go`
- Modify: `meituanGo/internal/handlers/master.go`

**Step 1: 提取 MasterInitData 主流程**

保留：
- master 鉴权
- settings 读取
- shops 遍历
- 原有 billing / commission 解析

**Step 2: 保持返回结构兼容**

不要删原来的：
- `shops`
- `settings`

---

### Task 2: 为每个店铺补充经营摘要字段

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: 增加摘要聚合 helper**

建议增加：
- `buildMasterShopSummary(shopID int64)`

**Step 2: 一期新增字段**

至少补：
- `total_order_count`
- `delivery_order_count`
- `dine_in_order_count`
- `today_order_count`
- `delivery_revenue`
- `dine_in_revenue`
- `today_revenue`
- `avg_order_amount`
- `commission_total_rsd`
- `commission_month_rsd`
- `commission_today_rsd`
- `unsettled_commission_rsd`

---

### Task 3: 保持一期开销可控

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: 只复用现有表**

数据来源只用：
- `orders`
- `commission_records`
- `billing_accounts`

**Step 2: 不实现结算操作流**

本期只做摘要，不做：
- 标记已结算
- 审批打款
- 导出财务单

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-init-data-and-shop-summary-wave-1.md`

**Step 1: 记录完成范围**

记录本期完成：
- `MasterInitData` 迁移
- 每店经营摘要字段

**Step 2: 记录下一期范围**

下一期再考虑：
- 单店详情接口
- 提成结算操作流
- master 前端展示增强
