# Master Split And Shop Dashboard Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在拆分 `master.go` 的同时，为 master 后台增加每店营业数据与提成摘要，让主控后台具备基础经营看板能力。

**Architecture:** 这一期先做“结构拆分 + 摘要数据”，不做复杂结算操作流。后端先按 auth/settings/shop_admin/billing/init_data 分拆 `master.go`，再在 init 数据里补充每店经营摘要字段，供现有 master 页面直接消费。

**Tech Stack:** Go, Gin, sqlx, Astro proxy page

---

### Task 1: 拆出 master 结构文件

**Files:**
- Create: `meituanGo/internal/handlers/master_auth.go`
- Create: `meituanGo/internal/handlers/master_settings.go`
- Create: `meituanGo/internal/handlers/master_shop_admin.go`
- Create: `meituanGo/internal/handlers/master_billing.go`
- Create: `meituanGo/internal/handlers/master_init_data.go`
- Modify: `meituanGo/internal/handlers/master.go`

**Step 1: 先拆 auth / settings / shop_admin / billing / init_data**

不要先改业务语义，只做职责分层。

**Step 2: 保持现有 action 分发不变**

`MasterManage` 的 action 名和返回结构先不改。

---

### Task 2: 增加每店经营摘要聚合

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: 为每个店铺补充摘要字段**

建议一期补：
- `total_order_count`
- `delivery_order_count`
- `dine_in_order_count`
- `total_revenue`
- `delivery_revenue`
- `dine_in_revenue`
- `avg_order_amount`
- `commission_total_rsd`
- `commission_month_rsd`
- `unsettled_commission_rsd`
- `billing_balance_rsd`
- `billing_status`

**Step 2: 优先复用现有表**

数据来源优先：
- `orders`
- `commission_records`
- `billing_accounts`

---

### Task 3: 更新 master 初始化返回结构

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: 保持原有字段兼容**

不要删原有字段，只新增摘要字段。

**Step 2: 让现有前端能直接消费**

保持 `shops` 数组结构不变，只是每个 shop 增加新的 summary 字段。

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-split-and-shop-dashboard-wave-1.md`

**Step 1: 记录完成范围**

记录本轮完成：
- `master.go` 结构拆分
- 每店经营摘要字段

**Step 2: 记录下一期范围**

下一期再考虑：
- 单店经营详情接口
- 结算操作流
- master 页面 UI 增强
