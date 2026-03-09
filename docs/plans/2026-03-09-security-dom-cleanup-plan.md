# Security DOM Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 清理前端高风险动态 DOM 渲染并收紧后台登录会话暴露面，在不改变核心业务行为的前提下提升安全性、稳健性和可维护性。

**Architecture:** 先收紧 `api/admin/login` 会话返回，再逐个替换高风险前端渲染点。对局部页面与脚本使用最小 helper + 原生 DOM API 完成安全渲染，保持现有样式和交互选择器不变，避免大重构带来的回归。

**Tech Stack:** Astro, TypeScript, Preact, pnpm

---

### Task 1: 修复后台登录 token 暴露

**Files:**
- Modify: `meituanAstro/src/pages/api/admin/login.ts`

**Step 1: 写失败验证说明**

当前成功响应包含 `token` 字段，不符合 HttpOnly Cookie 会话模型。

**Step 2: 最小修改实现**

- 成功响应改为仅返回 `success`
- `secure` 基于生产环境决定

**Step 3: 运行验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 2: 替换用户侧高风险动态渲染

**Files:**
- Modify: `meituanAstro/src/pages/shop.astro`
- Modify: `meituanAstro/src/components/UserChat.astro`
- Modify: `meituanAstro/src/pages/user/index.astro`
- Modify: `meituanAstro/src/scripts/shop/table-details.ts`

**Step 1: 写失败验证说明**

这些文件把接口返回值或用户资料拼到 `innerHTML`，存在 XSS 与结构脆弱风险。

**Step 2: 最小修改实现**

- 用 DOM 节点构建错误态、列表态、消息态和头像节点
- 保持原有类名与交互

**Step 3: 运行验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 3: 替换后台高风险动态渲染

**Files:**
- Modify: `meituanAstro/src/scripts/admin/settings-ui.ts`
- Modify: `meituanAstro/src/scripts/admin/order-actions.ts`
- Modify: `meituanAstro/src/scripts/admin/table-management.ts`

**Step 1: 写失败验证说明**

后台设置、配送和桌台弹窗使用字符串模板拼接动态数据，后续修改极易引入注入和事件绑定错误。

**Step 2: 最小修改实现**

- 用 `createElement` / `replaceChildren` 重写高风险列表与弹窗内容
- 保留现有 `data-*`、类名和全局动作入口

**Step 3: 运行验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 4: 全量验证

**Files:**
- Test: `meituanAstro/package.json`

**Step 1: 运行构建**

Run: `pnpm run build`
Expected: 构建通过。

**Step 2: 运行开发服务**

Run: `pnpm run dev`
Expected: 本地可启动。

**Step 3: 手工核查关键页面**

检查：
- `http://localhost:3000/admin/02`
- 用户聊天
- 用户中心头像
- 点餐页
- 桌台详情
