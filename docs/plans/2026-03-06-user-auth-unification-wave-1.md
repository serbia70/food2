# User Auth Unification Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一前端用户登录/注册的请求与本地用户状态保存逻辑，先收口 `UserModal` 和 `useAuthState` 两处高频入口。

**Architecture:** 新增轻量 `user-auth` helper，负责登录、注册、用户状态落库三件事。第一轮只接入 `UserModal` 和 `components/cart-modal/useAuthState.ts`，保留 `pages/user/login.astro` 作为后续迁移对象，以控制改动面。

**Tech Stack:** Astro, Preact, TypeScript, nanostores

---

### Task 1: 新增统一认证 helper

**Files:**
- Create: `meituanAstro/src/lib/user-auth.ts`
- Modify: `meituanAstro/src/lib/userStore.ts`

**Step 1: 写最小失败验证（静态）**

```text
现状：
- UserModal 自己发登录/注册请求
- useAuthState 自己再发一套
- 成功后的 saveUserInfo 逻辑重复
目标：统一成同一 helper
```

**Step 2: 新增数据类型与请求函数**

至少提供：

```ts
type LoginPayload = { loginAccount: string; password: string };
type RegisterPayload = { accountType: 'phone' | 'email' | 'id'; account: string; password: string; name: string };

async function loginUser(payload: LoginPayload)
async function registerUser(payload: RegisterPayload)
```

**Step 3: 统一成功后的本地保存**

至少提供：

```ts
function persistUserAuth(result, fallback)
```

要求：
- 统一调用 `saveUserInfo`
- 统一设置 `user_session`
- 统一兼容 `data.user` 缺失但 `sessionToken` 存在的情况

---

### Task 2: 接入 UserModal

**Files:**
- Modify: `meituanAstro/src/components/UserModal.tsx`

**Step 1: 删除重复请求拼装**

移除 `handleLogin` / `handleRegister` 中直接 `fetch` 的部分，改为调用：

```ts
await loginUser(...)
await registerUser(...)
```

**Step 2: 保持现有 UI 行为**

保留：
- `loading`
- `loginError`
- `regError`
- `isRegisterMode`
- 登录后拉历史订单的行为

**Step 3: 手工验证**

```text
1. 打开 UserModal
2. 登录成功后应进入已登录态
3. 注册成功后应进入已登录态或至少不再报 account/name/password required
```

---

### Task 3: 接入 useAuthState

**Files:**
- Modify: `meituanAstro/src/components/cart-modal/useAuthState.ts`

**Step 1: 统一请求实现**

将 hook 中的登录/注册请求改为调用 `user-auth` helper。

**Step 2: 保持现有回调行为**

仍然保留：
- `onProfileUpdate`
- `onGoogleSuccess`
- `switchToLogin`
- `switchToRegister`

**Step 3: 手工验证**

```text
1. 在购物车认证流程中测试登录
2. 在购物车认证流程中测试注册
3. 确认本地 user 信息和 session 正常保存
```

---

### Task 4: 记录剩余未统一入口

**Files:**
- Modify: `docs/plans/2026-03-06-user-auth-unification-wave-1.md`

**Step 1: 记录本轮未改动项**

明确记录：
- `meituanAstro/src/pages/user/login.astro` 仍是旧实现

**Step 2: 记录下一轮建议**

下一轮再迁移：
- `pages/user/login.astro`
- 用户信息更新相关页面
