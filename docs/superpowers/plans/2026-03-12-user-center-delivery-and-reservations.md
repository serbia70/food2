# User Center (Delivery + Reservations) Implementation Plan

> 状态说明（历史计划）：这份计划反映的是当时 user center 的 delivery/reservations 收口步骤，文中的 `历史红灯预期：`、旧 worktree 路径与旧测试文件名属于阶段性实施记录，不应再直接当作当前仓库状态。
> 若继续处理 user history / reservations 语义，请先以当前前后端真实代码为准，不要反向恢复这里的历史测试组织方式。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-facing pages only show delivery orders + shop reservations, scoped to `login_account` (with compatibility merge to the bound `phone`), and delivery history is retained permanently.

**Architecture:** Add user-scoped API endpoints that authenticate via `sessionToken` (the stored `user_session` / `login_account`) and query data using an allowlisted join to the authenticated user’s `login_account` + `phone`. Update frontend to call these endpoints and to hide dine-in everywhere in user-facing views.

**Tech Stack:** Astro + Preact (frontend), Go + Gin + SQLite (backend), node:test for frontend script tests, Go `testing` for backend handler tests.

---

## Scope / Decisions (locked)

- Show **only** `order_type = 'delivery'` in user-facing pages.
- Reservations are shown **only in shop page user center** (e.g. `/01` modal/panel), not on `/user`.
- User identity key is `login_account` (stored as `user_session` in localStorage).
- Compatibility merge: a user’s delivery/reservation history includes rows whose phone key matches either:
  - the user’s `login_account`, OR
  - the user’s bound `phone` (from `users.phone`), if present.
- Retention: delivery orders are kept **permanently**.

---

## Files to touch

### Backend (meituanGo)
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/mobile.go`
- Create (or Modify): `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/user_reservations.go` (recommended new file)
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/cmd/server/main.go` (register new routes)
- Test: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/mobile_test．go（历史文件名）`
- Test: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/user_reservations_test．go（历史文件名）`
- (If needed) Read-only reference: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/reservation.go`

### Frontend (meituanAstro)
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/pages/orders/index.astro`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/components/UserCenterPageIsland.tsx`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/components/UserModal.tsx` (shop page user center)
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/pages/api/user/history.ts` (POST proxy stays, GET may remain but frontend stops using it)
- Create: `D:/ai/food2/.worktrees/260311/meituanAstro/src/pages/api/user/reservations.ts` (proxy)
- Add script tests:
  - `D:/ai/food2/.worktrees/260311/meituanAstro/scripts/user-history-uses-sessiontoken.test.mjs`
  - `D:/ai/food2/.worktrees/260311/meituanAstro/scripts/orders-hides-dine-in.test.mjs`
  - `D:/ai/food2/.worktrees/260311/meituanAstro/scripts/shop-user-center-shows-reservations.test.mjs` (smoke-level text assertion)

---

## Chunk 1: Backend — secure user delivery history via sessionToken

### Task 1: Add POST /api/user/history (sessionToken) for delivery-only history

**Files:**
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/mobile.go`
- Test: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/mobile_test．go（历史文件名）`

- [ ] **Step 1: Write failing test**

Add a new test in `mobile_test．go（历史文件名）` (or new file if the test is getting large) that:

1) Seeds users table with a user:
- `login_account = "888"`
- `phone = "0613083899"`

2) Seeds orders table with:
- delivery order with `user_phone = "888"`
- delivery order with `user_phone = "0613083899"`
- dine_in order with `user_phone = "888"`

3) Calls:

`POST /api/user/history` with body:
```json
{"sessionToken":"888"}
```

4) Expects:
- 200 + `{ success: true }`
- returned orders include BOTH delivery orders (888 + 0613...)
- returned orders exclude dine_in

Also add a negative test:
- unknown sessionToken returns 401

- [ ] **Step 2: Run test to verify it fails**

Run (from `meituanGo` repo root):
```bash
go test ./internal/handlers -run TestUserHistorySessionToken -v
```
历史红灯预期： because endpoint does not exist / behavior not implemented.

- [ ] **Step 3: Implement minimal handler change**

In `UserHistory` (mobile.go):

- Keep existing GET behavior (compat), but **frontend must stop using it**.
- For POST:
  - Accept `{ sessionToken }` in addition to existing `{ login_account, password }`.
  - If `sessionToken` is present:
    - Look up user by `login_account = sessionToken`.
    - Build a list of acceptable keys: `[user.login_account]` + `[user.phone if present]`.
    - Query orders:
      - `WHERE order_type = 'delivery'`
      - `AND user_phone IN (?, ?)` (use dynamic args length 1-2)
      - order by `created_at DESC` limit 50.
    - Return `{ success: true, orders: orders }`.

Security notes:
- Do not allow arbitrary phone query on this path for POST.
- Do not leak other user fields.

- [ ] **Step 4: Run test to verify it passes**

Same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Run broader backend tests**

Run:
```bash
go test ./...
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/handlers/mobile.go internal/handlers/mobile_test．go（历史文件名）

git commit -m "feat(user): add sessionToken delivery history"
```

---

## Chunk 2: Backend — user reservations list (shop-scoped)

### Task 2: Add POST /api/user/reservations (sessionToken + shop)

**Files:**
- Create: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/user_reservations.go`
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/cmd/server/main.go`
- Test: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/user_reservations_test．go（历史文件名）`

- [ ] **Step 1: Write failing test**

Create `user_reservations_test．go（历史文件名）` that:

1) Seeds users with login_account=888, phone=0613...
2) Seeds reservations with:
- reservation for shop_id=1, customer_phone=888
- reservation for shop_id=1, customer_phone=0613...
- reservation for shop_id=2, customer_phone=888 (should be excluded when querying shop 1)
3) Calls:

`POST /api/user/reservations` with:
```json
{"sessionToken":"888","shopSlug":"01"}
```

4) Expects:
- 200 + success true
- returns exactly the two reservations for shop 01 and customer_phone in {888,0613...}

Also test:
- unknown shopSlug returns 404
- unknown sessionToken returns 401

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
go test ./internal/handlers -run TestUserReservations -v
```
历史红灯预期： (route/handler missing).

- [ ] **Step 3: Implement handler**

In `user_reservations.go`:
- Parse JSON body with `{ sessionToken, shopSlug }`.
- Resolve shopID via existing `getShopIDBySlug(shopSlug)`.
- Resolve user via `login_account=sessionToken`.
- Acceptable keys: `[login_account]` + `[phone if present]`.
- Query reservations:
  - `WHERE shop_id = ? AND customer_phone IN (...)`
  - order by `reservation_time DESC` (or ASC if you prefer upcoming-first; choose one and keep consistent)
  - limit (e.g. 50)
- Return JSON `{ success: true, reservations: [...] }`.

Register route in `cmd/server/main.go` under `/api/user/reservations`.

- [ ] **Step 4: Run test to verify it passes**

Same as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/handlers/user_reservations.go internal/handlers/user_reservations_test．go（历史文件名） cmd/server/main.go

git commit -m "feat(user): add shop reservation list"
```

---

## Chunk 3: Frontend — switch user pages to sessionToken APIs and hide dine-in

### Task 3: /user uses POST /api/user/history (sessionToken) and shows only delivery

**Files:**
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/components/UserCenterPageIsland.tsx`
- Add test: `D:/ai/food2/.worktrees/260311/meituanAstro/scripts/user-history-uses-sessiontoken.test.mjs`

- [ ] **Step 1: Write failing test**

Add node script test that reads `UserCenterPageIsland.tsx` and asserts:
- it does NOT call `GET /api/user/history?phone=`
- it DOES call `POST /api/user/history` and includes `sessionToken` payload

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test scripts/user-history-uses-sessiontoken.test.mjs
```
历史红灯预期：.

- [ ] **Step 3: Implement minimal frontend change**

In `UserCenterPageIsland.tsx`:
- Read sessionToken from `localStorage.getItem('user_session')`.
- Replace history fetch to POST `/api/user/history` with body `{ sessionToken }`.
- Ensure UI only renders delivery orders (the backend already returns delivery-only).
- Remove any fallback that uses address phone for identity (A1).

- [ ] **Step 4: Run test to verify it passes**

Same command as Step 2.

- [ ] **Step 5: Run build**

```bash
pnpm -C meituanAstro build
```
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/components/UserCenterPageIsland.tsx scripts/user-history-uses-sessiontoken.test.mjs

git commit -m "fix(user): load delivery history by session token"
```

---

### Task 4: /orders hides dine-in and uses sessionToken history

**Files:**
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/pages/orders/index.astro`
- Add test: `D:/ai/food2/.worktrees/260311/meituanAstro/scripts/orders-hides-dine-in.test.mjs`

- [ ] **Step 1: Write failing test**

Add node script test that reads `orders/index.astro` and asserts:
- no `dine_in` is included in user-visible filter
- fetch uses POST `/api/user/history` with `sessionToken` (not `?phone=`)

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test scripts/orders-hides-dine-in.test.mjs
```
历史红灯预期：.

- [ ] **Step 3: Implement minimal change**

In `orders/index.astro`:
- Replace history fetch to POST `/api/user/history` with `{ sessionToken }`.
- Ensure filtering and rendering only show delivery orders (or rely on backend returning delivery-only).
- Remove dine_in from any visible set.

- [ ] **Step 4: Verify tests + build**

Run:
```bash
node --test scripts/orders-hides-dine-in.test.mjs
pnpm -C meituanAstro build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/orders/index.astro scripts/orders-hides-dine-in.test.mjs

git commit -m "fix(orders): show delivery only via session history"
```

---

### Task 5: Shop page user center shows reservations (shop-scoped)

**Files:**
- Create: `D:/ai/food2/.worktrees/260311/meituanAstro/src/pages/api/user/reservations.ts`
- Modify: `D:/ai/food2/.worktrees/260311/meituanAstro/src/components/UserModal.tsx`
- Add test: `D:/ai/food2/.worktrees/260311/meituanAstro/scripts/shop-user-center-shows-reservations.test.mjs`

- [ ] **Step 1: Write failing test**

Add a text-level script test that asserts `UserModal.tsx` includes:
- fetch to `/api/user/reservations`
- includes `sessionToken` and `shopSlug`

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test scripts/shop-user-center-shows-reservations.test.mjs
```

- [ ] **Step 3: Implement proxy route**

Create `src/pages/api/user/reservations.ts` similar to `history.ts`:
- POST proxy to `${API_BASE_URL}/api/user/reservations`

- [ ] **Step 4: Implement minimal UI integration**

In `UserModal.tsx`:
- Read sessionToken from localStorage.
- Derive `shopSlug` from current pathname.
- When modal opens and user is logged in:
  - Fetch `/api/user/reservations` and render a simple list (time + guest_count + status).
- Do not add unrelated UI refactors.

- [ ] **Step 5: Verify tests + build**

Run:
```bash
node --test scripts/shop-user-center-shows-reservations.test.mjs
pnpm -C meituanAstro build
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/user/reservations.ts src/components/UserModal.tsx scripts/shop-user-center-shows-reservations.test.mjs

git commit -m "feat(shop): show my reservations in shop user center"
```

---

## Chunk 4: Retention setting — keep delivery permanently

### Task 6: Ensure delivery retention does not delete delivery orders

**Context:** Backend currently has retention defaults: dine_in 7 days, delivery 90 days (see `internal/services/cron/order_retention.go`). You selected permanent delivery retention.

**Files:**
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/internal/services/cron/order_retention.go`
- Test: `D:/ai/food2/.worktrees/260311/meituanGo/internal/services/cron/order_retention_test．go（历史文件名）`
- Modify: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/master_settings.go` (defaults)
- Test: `D:/ai/food2/.worktrees/260311/meituanGo/internal/handlers/master_settings_test．go（历史文件名）`

- [ ] **Step 1: Write failing test**

In `order_retention_test．go（历史文件名）`, add case:
- settings `retention_delivery_days = 0` (or a new sentinel field, if you prefer) means **do not delete** delivery orders.
- Create a delivery order older than cutoff and assert it is retained.

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/services/cron -run TestOrderRetentionDeliveryPermanent -v
```

- [ ] **Step 3: Implement minimal logic**

In `order_retention.go`:
- If `retention_delivery_days <= 0`, skip deleting delivery orders.

In `master_settings.go`:
- Set default `retention_delivery_days` to 0 (or add `retention_delivery_mode = permanent`; keep it minimal).

- [ ] **Step 4: Verify tests**

```bash
go test ./...
```

- [ ] **Step 5: Commit**

```bash
git add internal/services/cron/order_retention.go internal/services/cron/order_retention_test．go（历史文件名） internal/handlers/master_settings.go internal/handlers/master_settings_test．go（历史文件名）

git commit -m "chore(retention): keep delivery orders permanently"
```

---

## Final verification checklist

- [ ] Frontend script tests:
  - Run: `node --test meituanAstro/scripts/*.test.mjs`
  - Expected: all pass
- [ ] Frontend build:
  - Run: `pnpm -C meituanAstro build`
  - Expected: success
- [ ] Backend tests:
  - Run: `go test ./...`
  - Expected: all pass
- [ ] Manual smoke:
  - `/user` shows delivery-only history for login_account with compatibility merge
  - `/orders` shows delivery-only history
  - `/<slug>` user center shows delivery-only history + reservations list

---

## Notes / Known hazards

- There is a bug in `meituanAstro/src/lib/user-api-route.ts` mapping for `login` (it maps to `/api/user/history`). If login is broken, fix it as a separate small task with its own failing test.
- Keep POST sessionToken endpoints strict to avoid letting clients query other users’ history.
