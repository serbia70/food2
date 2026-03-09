# Master Shop Detail Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 master 首页经营摘要基础上，增加单店经营详情面板，让运营可以查看某个店铺更细的经营、提成与账务信息。

**Architecture:** 一期先做“详情接口 + 侧边面板”，不做结算操作流。后端新增 `shop-detail` 接口返回 `shop + summary + billingLedger + commissionRecords`，前端在 Astro master 首页中点击店铺卡片后打开右侧面板，异步加载详情数据。

**Tech Stack:** Go, Gin, Astro, TS/JS, side panel UI

---

### Task 1: 新增单店经营详情接口

**Files:**
- Create: `meituanGo/internal/handlers/master_shop_detail.go`
- Modify: `meituanGo/internal/handlers/master.go`
- Modify: `meituanAstro/src/pages/api/master/init.ts` 或新增 `meituanAstro/src/pages/api/master/shop-detail.ts`

**Step 1: 定义详情返回结构**

建议返回：
- `shop`
- `summary`
- `billingLedger`
- `commissionRecords`

**Step 2: 一期数据范围**

至少包含：
- 店铺基础信息
- 今日/本月/累计经营摘要
- 最近若干条 `billing_ledger`
- 最近若干条 `commission_records`

---

### Task 2: 前端增加详情面板组件

**Files:**
- Create: `meituanAstro/src/components/master/MasterShopDetailPanel.astro`
- Modify: `meituanAstro/src/components/master/MasterShopSummaryCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: 店铺卡片增加详情触发入口**

点击卡片或按钮时打开详情面板。

**Step 2: 详情面板异步加载数据**

失败时只影响面板，不影响首页。

---

### Task 3: 一期展示内容

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopDetailPanel.astro`

**Step 1: 基础信息**

展示：
- 店铺名
- slug
- billing 状态
- 当前余额
- plan

**Step 2: 经营与提成摘要**

展示：
- 今日营业额
- 今日订单数
- 本月营业额
- 外卖/堂食拆分
- 今日提成
- 本月提成
- 累计提成
- 未结算提成

**Step 3: 最近记录**

展示：
- 最近账单流水
- 最近提成记录

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-shop-detail-wave-1.md`

**Step 1: 记录本期完成范围**

记录：
- 单店详情接口
- 单店详情面板

**Step 2: 记录下一期范围**

后续再考虑：
- 结算操作流
- 导出报表
- 单店详情独立页面
