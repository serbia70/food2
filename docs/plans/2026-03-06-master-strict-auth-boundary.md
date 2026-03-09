# Master Strict Auth Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 收紧 `/master` 与 `api/master/*` 的认证边界，确保未登录时不能看到主控数据，并恢复详情与 impersonate 操作的一致性。

**Architecture:** 保留现有 cookie 登录方案，但停止在页面 SSR 和 master 代理接口中自动回退默认 token。通过给 `resolveMasterAuth` 增加“禁用 fallback”能力，让 `/master` 页面、详情接口、impersonate 接口只认 cookie 或显式请求头；未登录页面直接跳转到 `/master/login`，代理接口则稳定返回 401。

**Tech Stack:** Astro, TypeScript, Astro API routes

---

### Task 1: 为 master auth helper 写严格模式测试

**Files:**
- Modify: `meituanAstro/src/lib/master-auth.test.ts`
- Modify: `meituanAstro/src/lib/master-auth.ts`

**Step 1: Write the failing test**

在 `meituanAstro/src/lib/master-auth.test.ts` 增加一个严格模式测试：

```ts
test('严格模式下没有 header 和 cookie 时不应回退默认 token', () => {
  const request = new Request('http://localhost/master');
  const auth = resolveMasterAuth(request, undefined, 'master-token', { allowFallbackToken: false });
  assert.equal(auth, '');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-auth.test.ts`
Expected: FAIL，因为当前 helper 总会回退 fallback token。

**Step 3: Write minimal implementation**

在 `meituanAstro/src/lib/master-auth.ts`：
- 增加可选参数 `allowFallbackToken?: boolean`
- 默认保持 `true`
- 当显式传 `false` 时，header/cookie 都不存在就返回空字符串

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-auth.test.ts`
Expected: PASS

---

### Task 2: 收紧 `/master` 页面 SSR 访问

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add server-side login gate**

在页面顶部读取 `Astro.cookies.get('master_token')`：
- 没有 cookie 时，直接 `Astro.redirect('/master/login', 302)`

**Step 2: Stop SSR fallback token usage**

页面请求 `API_BASE_URL/api/master/init` 时：
- 调 `resolveMasterAuth(..., { allowFallbackToken: false })`
- 只允许 cookie/header 登录态，不允许默认 token 穿透

**Step 3: Keep current hero actions**

保留上一轮加的登录/退出按钮，但在严格登录态下：
- 既然没 cookie 会直接跳登录页，因此 `/master` 正常页中应主要展示 `重新登录`、`退出`、`刷新`

---

### Task 3: 收紧 `api/master/*` 代理接口

**Files:**
- Modify: `meituanAstro/src/pages/api/master/init.ts`
- Modify: `meituanAstro/src/pages/api/master/shop-detail.ts`
- Modify: `meituanAstro/src/pages/api/master/impersonate-shop.ts`
- Modify: `meituanAstro/src/pages/api/master/manage.ts`
- Modify: `meituanAstro/src/pages/api/master/upload.ts`
- Modify: `meituanAstro/src/pages/api/master/restore.ts`
- Modify: `meituanAstro/src/pages/api/master/backup.ts`

**Step 1: Disable fallback token**

所有 master 代理统一改为：

```ts
const auth = resolveMasterAuth(request, cookies, MASTER_TOKEN, { allowFallbackToken: false })
```

**Step 2: Return controlled 401 when unauthenticated**

若 `auth` 为空：
- 不要继续请求后端
- 直接返回 401 JSON，例如：

```json
{ "success": false, "error": "unauthorized" }
```

**Step 3: Keep proxy behavior unchanged after auth**

认证通过后，继续保持现有转发逻辑，不额外改业务字段。

---

### Task 4: 验证详情与 impersonate 链路

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`（仅在必要时补更清晰错误提示）

**Step 1: Verify shop detail behavior**

确认点击“店铺经营详情”时：
- 已登录状态能请求 `/api/master/shop-detail`
- 未登录不会再处于“页面能看、详情失败”的割裂状态

**Step 2: Verify impersonate behavior**

确认点击进入后台时：
- `/api/master/impersonate-shop` 在已登录状态下正常返回
- 成功后跳转 `/admin/{slug}`

**Step 3: Improve error copy only if needed**

如果仍有失败提示，错误文案要明确区分：
- 未登录
- 详情加载失败
- 进入店铺后台失败

---

### Task 5: 完成验证

**Files:**
- Modify: `docs/plans/2026-03-06-master-strict-auth-boundary.md`

**Step 1: Run tests**

Run: `node --test src/lib/master-auth.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual browser verification**

验证顺序：
- 退出后访问 `http://localhost:3000/master`，应直接跳 `http://localhost:3000/master/login`
- 登录后访问 `http://localhost:3000/master`，应能看到店铺数据
- 点击“店铺经营详情”，应正常打开详情面板
- 点击 impersonate，应该能进入 `http://localhost:3000/admin/<slug>`

**Step 4: Record outcome**

在本计划文件末尾记录：
- 已收紧的页面与 API 边界
- 若 impersonate 仍失败，记录具体接口状态码与错误信息
