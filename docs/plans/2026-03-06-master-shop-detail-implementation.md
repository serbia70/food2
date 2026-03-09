# Master Shop Detail Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Astro 化后的 master 首页增加单店经营详情能力，让运营可以在首页点击店铺后查看更细的经营、提成与账务记录。

**Architecture:** 后端先提供单店详情接口，前端再实现右侧详情面板。一期只做只读详情，不做结算操作按钮，确保与当前摘要看板自然衔接。

**Tech Stack:** Go, Gin, Astro, Astro components, existing master APIs

---

### Task 1: 新增单店详情接口

**Files:**
- Create: `meituanGo/internal/handlers/master_shop_detail.go`
- Modify: `meituanGo/internal/handlers/master.go`
- Create: `meituanAstro/src/pages/api/master/shop-detail.ts`

**Step 1: 后端返回结构**

建议返回：
- `shop`
- `summary`
- `billingLedger`
- `commissionRecords`

**Step 2: 一期限制**

只做读取：
- 不做结算操作
- 不做导出
- 不做审批流

---

### Task 2: 前端实现单店详情面板

**Files:**
- Create: `meituanAstro/src/components/master/MasterShopDetailPanel.astro`
- Modify: `meituanAstro/src/components/master/MasterShopSummaryCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: 卡片增加详情触发**

点击卡片或按钮后，打开详情面板。

**Step 2: 面板异步加载详情数据**

失败时只影响面板，不影响首页摘要。

---

### Task 3: 一期详情内容

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopDetailPanel.astro`

**Step 1: 基础信息**

展示：
- 店铺名
- slug
- billing 状态
- 当前余额
- plan

**Step 2: 经营摘要**

展示：
- 今日营业额 / 今日订单数
- 本月提成 / 累计提成 / 未结算提成
- delivery / dine_in 拆分
- 客单价

**Step 3: 最近记录**

展示：
- 最近几条 `billing_ledger`
- 最近几条 `commission_records`

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-shop-detail-implementation.md`

**Step 1: 记录完成范围**

记录：
- 单店详情接口
- 单店详情面板

**Step 2: 记录后续范围**

下一期再考虑：
- 结算操作流
- 报表导出
- 单店独立详情页
