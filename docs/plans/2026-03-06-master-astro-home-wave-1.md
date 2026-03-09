# Master Astro Home Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 先把 master 首页做成 Astro 原生经营看板，摆脱对 `master.html` 的持续依赖，同时继续复用现有 `/api/master/init` 与旧 action 接口。

**Architecture:** 这一期只 Astro 化 master 首页，不全量重写后台。新首页负责读取 `/api/master/init`，展示全局总览和店铺经营摘要列表；原有管理动作先继续走旧接口，其他 tab 后续再逐步迁移。

**Tech Stack:** Astro, TS/JS, existing master APIs

---

### Task 1: 建立 Astro 原生 master 首页壳层

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Create: `meituanAstro/src/components/master/MasterShell.astro`

**Step 1: 让 /master 不再代理 master.html**

改为原生 Astro 页面壳层。

**Step 2: 保留基础鉴权与跳转行为**

首页仍应依赖 `master_token` / `/api/master/init` 进行加载。

---

### Task 2: 新建经营摘要组件

**Files:**
- Create: `meituanAstro/src/components/master/MasterOverview.astro`
- Create: `meituanAstro/src/components/master/MasterShopSummaryList.astro`
- Create: `meituanAstro/src/components/master/MasterShopSummaryCard.astro`

**Step 1: 展示全局总览**

至少展示：
- 总店铺数
- 今日总营业额
- 今日总订单数
- 本月总提成
- 总余额

**Step 2: 展示店铺摘要列表**

每个店铺展示：
- 店铺名 / slug
- billing 状态
- 今日营业额
- 今日订单数
- 外卖 / 堂食营业额
- 本月提成
- 未结算提成
- 当前余额

---

### Task 3: 复用 /api/master/init 与旧 action 接口

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: 数据来源只用 /api/master/init**

这一期不要重新发明新的首页接口。

**Step 2: 先不重写复杂 action UI**

创建店铺、更新店铺、续费审批等动作后续再迁。

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-astro-home-wave-1.md`

**Step 1: 记录本期完成范围**

记录：
- master 首页 Astro 化
- 经营摘要组件化

**Step 2: 记录下一期范围**

后续再考虑：
- 店铺管理动作迁移
- 单店详情面板
- 结算操作流
