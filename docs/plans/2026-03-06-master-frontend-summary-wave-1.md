# Master Frontend Summary Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不重写整个 master 页面前端的前提下，把后端新增的每店经营摘要字段展示到现有 master 界面中。

**Architecture:** 保持 `meituanAstro/src/pages/master/index.astro` 继续代理 `master.html`，通过注入一段前端脚本调用 `/api/master/init`，再把经营摘要插入现有店铺 DOM。这样可以快速实现经营看板一期，而不需要马上把 master 页面完全 Astro 化。

**Tech Stack:** Astro proxy page, browser DOM injection, master init API

---

### Task 1: 在 master 代理页注入摘要渲染脚本

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: 在代理后的 HTML 中注入前端脚本**

脚本职责：
- 请求 `/api/master/init`
- 读取 `shops` 中的新摘要字段
- 定位现有店铺列表 DOM
- 为每个店铺插入摘要区块

**Step 2: 保持现有 master 页面结构不变**

不要重写整个页面，只做 DOM 增强。

---

### Task 2: 复用 /api/master/init 数据插入现有 DOM

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: 展示一期摘要字段**

建议展示：
- 今日营业额
- 今日订单数
- delivery / dine_in 订单数
- delivery / dine_in 营业额
- 月提成
- 累计提成
- 未结算提成
- 当前余额

**Step 2: 做降级兼容**

如果字段缺失，不要让页面报错，显示 `-` 即可。

---

### Task 3: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-frontend-summary-wave-1.md`

**Step 1: 记录完成范围**

记录：
- 通过 DOM 注入方式实现 master 摘要展示

**Step 2: 记录下一期范围**

后续再考虑：
- 单店详情面板
- master 页面完全 Astro 化
- 结算操作流
