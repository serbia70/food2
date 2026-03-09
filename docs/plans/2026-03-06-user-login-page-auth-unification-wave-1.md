# User Login Page Auth Unification Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不重写 `user/login.astro` 页面结构的前提下，把该页的登录/注册请求和本地用户状态保存统一到现有认证 helper 体系。

**Architecture:** 保留 `user/login.astro` 的内联脚本和表单结构不动，只新增浏览器侧轻量 helper 供内联脚本调用。这样可以在低风险下统一认证链路，同时避免把页面整体改造成 island 或大规模抽脚本。

**Tech Stack:** Astro, inline browser script, TypeScript

---

### Task 1: 新增浏览器侧认证 helper

**Files:**
- Create: `meituanAstro/src/lib/user-auth-browser.ts`

**Step 1: 记录现状**

```text
现状：user/login.astro 自己 fetch、自己写 localStorage、自自己拼 userInfo。
目标：让它复用统一认证请求和落库规则。
```

**Step 2: 提供浏览器可调用函数**

至少提供：

```ts
window.__userAuthBrowser = {
  loginUser,
  registerUser,
  persistUserAuth,
}
```

要求：
- 逻辑与 `src/lib/user-auth.ts` 保持一致
- 仅依赖浏览器 API，不依赖 Preact/nanostores

---

### Task 2: 接入 user/login.astro

**Files:**
- Modify: `meituanAstro/src/pages/user/login.astro`

**Step 1: 保留表单结构与切换逻辑**

不改：
- DOM 结构
- 登录/注册模式切换
- success view 展示逻辑

**Step 2: 替换请求与本地存储逻辑**

把原来的：
- `fetch('/api/user/register', ...)`
- `fetch('/api/user/history', ...)`
- `localStorage.setItem(...)`

替换成调用 `window.__userAuthBrowser`。

**Step 3: 手工验证**

```text
1. user/login 页面登录成功
2. user/login 页面注册成功
3. food_order_user 和 user_session 正常写入
4. 成功后跳转逻辑不变
```

---

### Task 3: 记录认证统一范围

**Files:**
- Modify: `docs/plans/2026-03-06-user-login-page-auth-unification-wave-1.md`

**Step 1: 标注本轮完成范围**

记录：
- UserModal
- useAuthState
- user/login.astro

**Step 2: 标注后续范围**

后续再处理：
- 用户资料更新页
- Google 登录链路
