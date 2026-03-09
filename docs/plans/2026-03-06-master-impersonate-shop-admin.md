# Master Impersonate Shop Admin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让超级管理员在 master 后台中可以免密码进入指定店铺后台，帮助不会操作的客户代上架商品和处理后台配置。

**Architecture:** 一期先做“受控代入登录”，不做永久免密。后端新增 master 专用代入接口，只允许已登录的 master 使用，生成目标店铺后台可识别的登录结果；前端在 master 首页 / 单店详情中增加“进入店铺后台”按钮，点击后自动完成代入并跳转到对应 `/admin/[slug]`。

**Tech Stack:** Go, Gin, Astro API routes, admin cookie login

---

### Task 1: 设计受控代入登录后端接口

**Files:**
- Create: `meituanGo/internal/handlers/master_impersonate.go`
- Modify: `meituanGo/internal/handlers/master.go`
- Create: `meituanAstro/src/pages/api/master/impersonate-shop.ts`

**Step 1: 接口行为**

建议接口：
- `/api/master/impersonate-shop?id=...`

要求：
- 仅 master 身份可以调用
- 仅能代入指定店铺
- 返回目标店铺 `slug` 和可用于店铺后台的 token 或直接设置登录 cookie 所需结果

**Step 2: 一期安全边界**

要求：
- 不做永久 token
- 只用于已登录 master 发起的代入
- 保留后续增加短时效 token 的空间

---

### Task 2: Astro 侧完成代入并跳转

**Files:**
- Modify: `meituanAstro/src/pages/api/admin/login.ts`（如需要复用登录写 cookie 逻辑）
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/components/master/MasterShopSummaryCard.astro`
- Modify: `meituanAstro/src/components/master/MasterShopDetailPanel.astro`

**Step 1: 增加“进入店铺后台”按钮**

入口可放：
- 店铺摘要卡片
- 单店详情面板

**Step 2: 触发代入流程**

前端点击后：
- 调用 `/api/master/impersonate-shop`
- 成功后完成店铺后台登录态设置
- 跳转到 `/admin/[slug]`

---

### Task 3: 后台显示代入模式提示

**Files:**
- Modify: `meituanAstro/src/pages/admin/[slug]/index.astro`
- Modify: `meituanAstro/src/components/admin/AdminHeader.astro`

**Step 1: 一期至少留出显示位**

建议显示：
- `当前为超级管理员代入模式`

即使一期先只做最小提示，也要预留这个能力。

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-impersonate-shop-admin.md`

**Step 1: 记录完成范围**

记录：
- master 可免密码进入店铺后台

**Step 2: 记录下一期范围**

后续再考虑：
- 短时效代入 token
- 操作审计日志
- 代入模式更强提示
