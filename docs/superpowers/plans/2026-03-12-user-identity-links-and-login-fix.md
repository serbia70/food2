# User Identity Links + Login Fix Implementation Plan

> 状态说明（历史计划）：这份计划反映的是当时围绕 user identity link 的拆分与测试推进方式，文中的 `历史红灯预期：`、旧 worktree 路径与旧测试文件名属于阶段性记录，不应再被直接当作当前实施清单。
> 若继续处理 user login / bind / history 语义，请先以当前真实前后端代码为准，不要反向恢复这里的历史测试结构。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "账号错乱" by treating `login_account` as the canonical identity (sessionToken), adding a proper *binding/alias* mechanism so an ID account (e.g. `888`) can see delivery history stored under a phone key (e.g. `0613083899`), and separating user login from user history.

**Architecture:**
- Backend adds a small linking table `user_identity_links` so a canonical user (`login_account`) can have one or more alias keys (phones / legacy identifiers) used when querying delivery history.
- Backend exposes a dedicated `POST /api/user/login` (legacy login flow extracted from `UserHistory`) and a dedicated `POST /api/user/bind` to bind an alias to the current session user.
- Frontend fixes login routing and stops overwriting `user.phone` with the ID/login account; binding UI uses `/api/user/bind` when phone is already in use.

**Tech Stack:** Astro + Preact (frontend), Go + Gin + SQLite (backend), node:test for frontend unit tests, Go `testing` for backend handler tests.

---

## Files to touch

### Backend (meituanGo)
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/internal/db/migrations.go`
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/cmd/server/main.go`
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/mobile.go`
- Create: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/user_identity_links.go`
- Test: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/user_identity_links_test．go（历史文件名）`
- Modify (tests): `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/mobile_test．go（历史文件名）`

### Frontend (meituanAstro)
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/lib/user-api-route.ts`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/lib/user-api-route.test.ts`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/pages/api/user/login.ts`
- Create: `D:/ai/food2/.worktrees/260311/meituanAstro/src/pages/api/user/bind.ts`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/lib/user-auth-browser.ts`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/pages/user/login.astro`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/components/UserCenterPageIsland.tsx`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/components/UserModal.tsx`
- Tests (existing): `D:/ai/food2/.worktrees/260311/meituanAstro/src/lib/user-auth-browser.test.ts`

---

## Chunk 1: Backend — add identity link table and link-aware history keys

### Task 1: Add `user_identity_links` table (SQLite) and helper queries

**Files:**
- Modify: `meituanGo/internal/db/migrations.go`
- Create: `meituanGo/internal/handlers/user_identity_links.go`
- Test: `meituanGo/internal/handlers/user_identity_links_test．go（历史文件名）`

- [ ] **Step 1: Write failing test (table + insert works)**

Create `internal/handlers/user_identity_links_test．go（历史文件名）`:

```go
package handlers

import (
  "net/http"
  "net/http/httptest"
  "strings"
  "testing"

  "meituan-go/internal/db"

  "github.com/gin-gonic/gin"
)

func TestUserBindCreatesIdentityLink(t *testing.T) {
  gin.SetMode(gin.TestMode)
  setupMobileAuthDB(t)

  // canonical user
  if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('888', 'User', 'secret', '888')"); err != nil {
    t.Fatalf("seed user failed: %v", err)
  }

  r := gin.New()
  r.POST("/api/user/bind", UserBindIdentity)

  req := httptest.NewRequest(http.MethodPost, "/api/user/bind", strings.NewReader(`{"sessionToken":"888","alias":"0613083899"}`))
  req.Header.Set("Content-Type", "application/json")
  w := httptest.NewRecorder()
  r.ServeHTTP(w, req)

  if w.Code != http.StatusOK {
    t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
  }
}
```

历史红灯预期： because `UserBindIdentity` and/or table don’t exist.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
go test ./internal/handlers -run TestUserBindCreatesIdentityLink -v
```

- [ ] **Step 3: Implement migration + handler skeleton**

In `internal/db/migrations.go`, add:

```sql
CREATE TABLE IF NOT EXISTS user_identity_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_login_account TEXT NOT NULL,
  alias TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(alias)
);
```

In `internal/handlers/user_identity_links.go`, implement:

- request struct `{ SessionToken string "json:\"sessionToken\""; Alias string "json:\"alias\"" }`
- `UserBindIdentity(c *gin.Context)`:
  - validate non-empty `sessionToken` and `alias`
  - ensure canonical user exists: `SELECT id, login_account FROM users WHERE login_account=? LIMIT 1`
  - insert link: `INSERT INTO user_identity_links (canonical_login_account, alias) VALUES (?, ?)`
  - if UNIQUE(alias) violation -> return `409 { success:false, error:"alias already bound" }`
  - return `{ success:true }`

- [ ] **Step 4: Run test to verify it passes**

Same command as Step 2.

- [ ] **Step 5: Commit**

```bash
git add internal/db/migrations.go internal/handlers/user_identity_links.go internal/handlers/user_identity_links_test．go（历史文件名）

git commit -m "feat(user): add identity link table and bind endpoint"
```

---

### Task 2: Make `POST /api/user/history` (sessionToken) include linked alias keys

**Files:**
- Modify: `meituanGo/internal/handlers/mobile.go`
- Modify: `meituanGo/internal/handlers/mobile_test．go（历史文件名）`

- [ ] **Step 1: Write failing test (linked alias shows delivery)**

In `mobile_test．go（历史文件名）`, add a new test (or replace the existing sessionToken merge test if it’s now conceptually wrong):

```go
func TestUserHistorySessionTokenIncludesLinkedAliasDeliveryOnly(t *testing.T) {
  gin.SetMode(gin.TestMode)
  setupMobileAuthDB(t)

  // canonical user (ID-style)
  if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('888', 'User', 'secret', '888')"); err != nil {
    t.Fatalf("seed user failed: %v", err)
  }

  // shop for FK
  if _, err := db.DB.Exec("INSERT INTO shops (id, name, slug, status) VALUES (1, 'Shop', '01', 'active')"); err != nil {
    t.Fatalf("seed shop failed: %v", err)
  }

  // Orders:
  // - O2 delivery lives under alias key 0613083899
  // - O3 dine_in under 888 should never show
  if _, err := db.DB.Exec("INSERT INTO orders (order_no, shop_id, order_type, status, total_amount, items_json, user_phone) VALUES ('O2', 1, 'delivery', 'completed', 200, '[]', '0613083899')"); err != nil {
    t.Fatalf("seed O2 failed: %v", err)
  }
  if _, err := db.DB.Exec("INSERT INTO orders (order_no, shop_id, order_type, status, total_amount, items_json, user_phone) VALUES ('O3', 1, 'dine_in', 'completed', 300, '[]', '888')"); err != nil {
    t.Fatalf("seed O3 failed: %v", err)
  }

  // Bind alias via API (exercise real behavior)
  bind := gin.New()
  bind.POST("/api/user/bind", UserBindIdentity)
  req := httptest.NewRequest(http.MethodPost, "/api/user/bind", strings.NewReader(`{"sessionToken":"888","alias":"0613083899"}`))
  req.Header.Set("Content-Type", "application/json")
  w := httptest.NewRecorder()
  bind.ServeHTTP(w, req)
  if w.Code != http.StatusOK {
    t.Fatalf("bind expected 200 got %d body=%s", w.Code, w.Body.String())
  }

  r := gin.New()
  r.POST("/api/user/history", UserHistory)

  hreq := httptest.NewRequest(http.MethodPost, "/api/user/history", strings.NewReader(`{"sessionToken":"888"}`))
  hreq.Header.Set("Content-Type", "application/json")
  hw := httptest.NewRecorder()
  r.ServeHTTP(hw, hreq)

  if hw.Code != http.StatusOK {
    t.Fatalf("expected 200 got %d body=%s", hw.Code, hw.Body.String())
  }
  body := hw.Body.String()
  if !strings.Contains(body, "\"order_no\":\"O2\"") {
    t.Fatalf("expected linked delivery order O2, got %s", body)
  }
  if strings.Contains(body, "\"order_type\":\"dine_in\"") || strings.Contains(body, "\"order_no\":\"O3\"") {
    t.Fatalf("did not expect dine_in, got %s", body)
  }
}
```

历史红灯预期： because `UserHistory` currently only uses `{token, users.phone}` and doesn’t consult `user_identity_links`.

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/handlers -run TestUserHistorySessionTokenIncludesLinkedAliasDeliveryOnly -v
```

- [ ] **Step 3: Implement minimal link-aware keys in `UserHistory`**

In `internal/handlers/mobile.go` inside the sessionToken branch (`token != ""`):

1) After loading `user` by `login_account = token`, build keys:
- Start with canonical `login_account` (string)
- Append `user.phone` if non-empty and different
- Query links: `SELECT alias FROM user_identity_links WHERE canonical_login_account = ?`
  - append each alias (trimmed) if non-empty and not equal to existing keys

2) Query delivery orders using dynamic `IN` list:
- if keys len == 1: `user_phone = ?`
- else: build `IN (?, ?, ...)` safely (placeholders only)

Return `{ success:true, orders:[...] }`.

- [ ] **Step 4: Run test to verify it passes**

Same as Step 2.

- [ ] **Step 5: Commit**

```bash
git add internal/handlers/mobile.go internal/handlers/mobile_test．go（历史文件名）

git commit -m "fix(user): merge delivery history via identity links"
```

---

## Chunk 2: Backend — introduce dedicated user login endpoint (canonical sessionToken)

### Task 3: Add `POST /api/user/login` and route it

**Files:**
- Create/Modify: `meituanGo/internal/handlers/user_login.go` (or extend `user_identity_links.go` if you prefer 1 file; keep it focused)
- Modify: `meituanGo/cmd/server/main.go`
- Test: `meituanGo/internal/handlers/user_login_test．go（历史文件名）` (or extend `mobile_test．go（历史文件名）`)

- [ ] **Step 1: Write failing test (login returns canonical sessionToken)**

Test case:
- seed a user with `login_account='888'`, password hashed or plaintext
- seed identity link alias `0613083899 -> canonical 888`
- call `POST /api/user/login` with `{login_account:"0613083899", password:"secret"}`
- expect 200 success and `sessionToken:"888"`

历史红灯预期： (endpoint missing).

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/handlers -run TestUserLogin -v
```

- [ ] **Step 3: Implement handler**

`UserLogin(c *gin.Context)`:
- Bind JSON `{ login_account, password }`
- Resolve canonical login_account:
  - If a link exists: `SELECT canonical_login_account FROM user_identity_links WHERE alias=? LIMIT 1`
  - Else canonical = input
- Load user by `login_account = canonical` (fallback to `WHERE login_account=? OR phone=?` only if needed)
- Verify password with `security.VerifyPassword` and upgrade if needed
- Respond `{ success:true, sessionToken: canonical, user: user }` (password is already `json:"-"`)

Register route in `cmd/server/main.go`:
- add: `api.POST("/user/login", handlers.UserLogin)`

- [ ] **Step 4: Run tests to verify pass**

```bash
go test ./internal/handlers -run TestUserLogin -v
```

- [ ] **Step 5: Commit**

```bash
git add internal/handlers/user_login*.go cmd/server/main.go internal/handlers/*test.go

git commit -m "feat(user): add /api/user/login with canonical session token"
```

---

## Chunk 3: Frontend — fix login routing and stop polluting `phone` with ID

### Task 4: Fix `buildUserApiUrl(...,'login')` to point to `/api/user/login`

**Files:**
- Modify: `meituanAstro/src/lib/user-api-route.ts`
- Modify: `meituanAstro/src/lib/user-api-route.test.ts`

- [ ] **Step 1: Write failing test**

Update test to expect:

```ts
assert.equal(
  buildUserApiUrl('https://api.serbia70.com', 'login'),
  'https://api.serbia70.com/api/user/login',
);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test src/lib/user-api-route.test.ts
```

- [ ] **Step 3: Implement minimal change**

In `user-api-route.ts`:
- change login path mapping to `/api/user/login`

- [ ] **Step 4: Run test to verify it passes**

Same as Step 2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/user-api-route.ts src/lib/user-api-route.test.ts

git commit -m "fix(user): route login to /api/user/login"
```

---

### Task 5: Add `/api/user/bind` Astro proxy + use it when phone is already in use

**Files:**
- Create: `meituanAstro/src/pages/api/user/bind.ts`
- Modify: `meituanAstro/src/components/UserCenterPageIsland.tsx`
- Modify: `meituanAstro/src/components/UserModal.tsx`

- [ ] **Step 1: Write failing script-level assertion (optional but recommended)**

Create `meituanAstro/scripts/user-bind-uses-sessiontoken.test.mjs` asserting `UserCenterPageIsland.tsx` contains fetch to `/api/user/bind` and includes `sessionToken`.

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test scripts/user-bind-uses-sessiontoken.test.mjs
```

- [ ] **Step 3: Implement proxy route**

Create `src/pages/api/user/bind.ts`:

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const res = await fetch(`${API_BASE_URL}/api/user/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
};
```

- [ ] **Step 4: Update binding UI behavior**

In both `UserCenterPageIsland.tsx` and `UserModal.tsx` phone edit flow:
- When `/api/user/update` responds with `phone already in use`:
  - Call `/api/user/bind` with `{ sessionToken: localStorage.getItem('user_session'), alias: nextPhone }`
  - On success: show a simple alert like "绑定成功，订单将按 ID + 手机合并展示" and redirect to `/orders` or reload history.
  - Do NOT overwrite `userInfo.phone` locally (keep phone as the user’s own phone; binding is separate).

- [ ] **Step 5: Verify script test + build**

```bash
node --test scripts/user-bind-uses-sessiontoken.test.mjs
pnpm -C meituanAstro build
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/user/bind.ts src/components/UserCenterPageIsland.tsx src/components/UserModal.tsx scripts/user-bind-uses-sessiontoken.test.mjs

git commit -m "feat(user): bind alias phone to canonical account"
```

---

### Task 6: Stop writing `phone = loginAccount` during ID login persistence

**Files:**
- Modify: `meituanAstro/src/lib/user-auth-browser.ts`
- Modify: `meituanAstro/src/pages/user/login.astro`
- Modify tests: `meituanAstro/src/lib/user-auth-browser.test.ts`

- [ ] **Step 1: Write failing test**

Add a test ensuring that when logging in with ID (non-phone), and backend user has no phone, we keep phone empty instead of copying loginAccount.

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test src/lib/user-auth-browser.test.ts
```

- [ ] **Step 3: Implement minimal change**

In both `persistUserAuth` implementations (browser lib + login.astro inline), change:

- `resolvedPhone` should NOT fall back to `fallback.loginAccount`.
- Only set phone from:
  - backend `user.phone`, OR
  - if `fallback.accountType === 'phone'` then `fallback.account`

- [ ] **Step 4: Run test to verify it passes**

Same as Step 2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/user-auth-browser.ts src/pages/user/login.astro src/lib/user-auth-browser.test.ts

git commit -m "fix(auth): do not overwrite phone with login account"
```

---

## Final verification checklist

- [ ] Backend tests:
  - `go test ./internal/handlers -v`
  - `go test ./...`
- [ ] Frontend tests:
  - `node --test src/lib/user-api-route.test.ts`
  - `node --test src/lib/user-auth-browser.test.ts`
  - `node --test scripts/*.test.mjs`
- [ ] Frontend build:
  - `pnpm -C meituanAstro build`
- [ ] Manual smoke (local):
  - Login as `888` (ID). Confirm it does NOT rewrite `food_order_user.phone` to `888` if backend has no phone.
  - Bind alias `0613083899` to `888` via UI.
  - Visit `/orders`: must show delivery orders that previously only appeared under `0613083899`.
  - Confirm `/orders` never shows dine_in (no "3号桌" under 配送地址).
