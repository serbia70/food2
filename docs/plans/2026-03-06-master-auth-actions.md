# Master Auth Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 `/master` 的 401 认证错配，并补齐登录/退出入口，让 Master 页面具备完整的登录态操作。

**Architecture:** 保持现有 Astro 代理 + Go 后端 master auth 结构，不重做会话体系。统一前后端默认 master token，新增一个清理 `master_token` cookie 的 logout API，并在 `/master` 头部加入登录/退出按钮及 401 引导，确保 SSR 页面和手动登录都能工作。

**Tech Stack:** Astro, TypeScript, Astro API routes, Go Gin backend（只对齐 token 常量）

---

### Task 1: 锁定 master token 解析行为

**Files:**
- Modify: `meituanAstro/src/lib/master-auth.test.ts`
- Modify: `meituanAstro/src/config.ts`

**Step 1: Write the failing test**

在 `meituanAstro/src/lib/master-auth.test.ts` 增加一个断言，确保 fallback token 与后端约定值一致，例如：

```ts
test('master fallback token uses backend-compatible value', () => {
  assert.equal(MASTER_TOKEN, 'master-token');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-auth.test.ts`
Expected: FAIL，如果当前 `MASTER_TOKEN` 仍不是 `master-token`。

**Step 3: Write minimal implementation**

把 `meituanAstro/src/config.ts` 中 master token 默认值改为与 `meituanGo/internal/handlers/master_auth.go` 一致的 `master-token`。

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-auth.test.ts`
Expected: PASS

---

### Task 2: 增加 Master 退出接口

**Files:**
- Create: `meituanAstro/src/pages/api/master/logout.ts`

**Step 1: Write the behavior target**

定义退出行为：
- 清空 `master_token` cookie
- 返回 `{ success: true }`

**Step 2: Implement minimal route**

新增 `logout.ts`：
- `export const prerender = false`
- `POST` 中 `cookies.delete('master_token', { path: '/' })`
- 返回 200 JSON

**Step 3: Verify manually**

登录后在浏览器请求 `/api/master/logout`，确认 cookie 被清掉。

---

### Task 3: 更新 `/master` 顶部操作区

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add auth action buttons**

在当前头部操作区增加：
- `重新登录` / `登录`
- `退出`
- `刷新页面`

要求：
- 已有 cookie 时显示 `重新登录` 和 `退出`
- 无 cookie 时显示 `登录`

**Step 2: Add logout client behavior**

在现有 inline script 中增加 logout 逻辑：

```ts
await fetch('/api/master/logout', { method: 'POST' })
window.location.href = '/master/login'
```

**Step 3: Improve 401 presentation**

若 `/api/master/init` 返回 401：
- 页面保留错误提示
- 同时渲染一个明显的“去登录”按钮，跳转 `/master/login`

**Step 4: Keep current layout stable**

不要重做整页视觉，只在当前 hero 区新增按钮组与错误态 CTA。

---

### Task 4: 调整 `/master/login` 页的入口体验

**Files:**
- Modify: `meituanAstro/src/pages/master/login/index.astro`

**Step 1: Preserve existing cookie redirect**

保留已有：
- 已登录 cookie 存在时直接跳转 `/master`

**Step 2: Add return path polish if needed**

如果退出后回到登录页，不需要额外 toast，只需确保页面稳定可重新登录。

**Step 3: Verify login -> master flow**

手工检查：
- 登录成功后进入 `/master`
- `/master` 不再只显示 401

---

### Task 5: 端到端验证

**Files:**
- Modify: `docs/plans/2026-03-06-master-auth-actions.md`

**Step 1: Run local tests**

Run: `node --test src/lib/master-auth.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual browser verification**

依次验证：
- `http://localhost:3000/master/login`
- 登录成功后进入 `http://localhost:3000/master`
- 页面顶部能看到登录/退出/刷新相关操作
- 点击退出后回到 `/master/login`

**Step 4: Record result**

把已完成范围和若仍存在的 master 数据问题写回本计划文件末尾。
