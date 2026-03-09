# Google Auth Unification And Auth Log Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一 Google 登录成功后的本地用户状态保存逻辑，并清理认证链路中的调试日志。

**Architecture:** 不改 Google SDK 初始化和按钮渲染方式，只在认证成功后的本地持久化层收口。新增或扩展认证 helper 处理 Google 用户落库，并只清理认证链路文件中的调试日志，避免范围失控。

**Tech Stack:** Astro, Preact, TypeScript, Google Identity Services

---

### Task 1: 扩展统一认证 helper 支持 Google 用户

**Files:**
- Modify: `meituanAstro/src/lib/user-auth.ts`
- Modify: `meituanAstro/src/lib/user-auth-browser.ts`

**Step 1: 记录现状**

```text
现状：Google 登录成功后的 saveUserInfo 逻辑散在 useAuthState / GoogleLoginButton 等链路中。
目标：统一为一个 persistGoogleUserAuth。
```

**Step 2: 新增统一函数**

至少提供：

```ts
persistGoogleUserAuth(user)
```

要求：
- 统一写入用户信息
- 统一设置 session
- 兼容 phone 缺失场景

---

### Task 2: 接入 Google 登录链路

**Files:**
- Modify: `meituanAstro/src/components/cart-modal/useAuthState.ts`
- Modify: `meituanAstro/src/components/GoogleLoginButton.tsx`
- Modify: `meituanAstro/src/pages/user/login.astro`（若页面内存在 Google 回调写本地状态）

**Step 1: 替换原有成功后保存逻辑**

不要再直接 `saveUserInfo(...)`，改用统一 helper。

**Step 2: 保持原 UI 与回调行为**

保留：
- `onGoogleSuccess`
- 页面跳转
- Google 按钮展示

---

### Task 3: 清理认证链路调试日志

**Files:**
- Modify: `meituanAstro/src/components/UserModal.tsx`
- Modify: `meituanAstro/src/components/cart-modal/useAuthState.ts`
- Modify: `meituanAstro/src/components/GoogleLoginButton.tsx`

**Step 1: 删除调试日志**

仅删除：
- 认证 request/response log
- 组件 mounted/open log

**Step 2: 保留必要错误处理**

不要删除：
- 用户可见错误提示
- 真正的异常处理分支

---

### Task 4: 记录范围与剩余项

**Files:**
- Modify: `docs/plans/2026-03-06-google-auth-unification-and-auth-log-cleanup.md`

**Step 1: 标注完成范围**

记录：
- Google 登录持久化已统一
- 认证链路调试日志已清理

**Step 2: 标注未覆盖项**

后续再处理：
- 用户资料页
- 非认证模块日志治理
