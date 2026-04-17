# Aggressive Cleanup + Unification (Batch A: API boundary) Implementation Plan

> 状态说明（历史计划）：这份计划记录的是当时 API boundary 收口的批次化实施方式，文中的 `历史红灯预期：`、旧测试文件名与阶段性辅助文件属于历史推进语境，不应再直接当作当前仓库基线。
> 若继续处理 admin/master proxy 边界，请先以当前真实 `src/pages/api/**` 与共享 helper 为准，不要反向恢复这里的旧拆分步骤。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify API route auth/proxy boundaries (admin + master) and remove duplicated route glue code while keeping all existing route paths, status codes, headers, and response body semantics unchanged (except fixing an obvious runtime bug).

**Architecture:**
- Reuse existing helpers (`src/lib/api-proxy.ts`, `src/lib/admin-api-route.ts`, `src/lib/master-auth.ts`) as the single source of truth.
- Add minimal glue helpers where missing (e.g. `readAdminAuth`) and migrate routes to those helpers.
- Keep special endpoints as explicit exceptions (SSE stream, streaming export, upload passthrough, admin orders “items_json” repair).

**Tech Stack:** Astro (Cloudflare adapter, `output: "server"`), TypeScript, node:test, pnpm.

---

## Scope / sequencing

This plan implements **Spec Batch A** only (from `docs/superpowers/specs/2026-03-17-aggressive-cleanup-and-unification-design.md`).

Batch B/C/D (admin page split, user center split, CSS restructuring) are **out of scope** for this plan and should be planned/executed only after Batch A is stable and verified.

## Guardrails (must preserve)

- Keep **all existing route paths** under `src/pages/api/**`.
- Keep behavior: **status codes**, **response headers** (especially `Content-Type`, cache headers, cookie behavior), and **body semantics**.
- Cloudflare runtime safe: **no Node-only APIs** in runtime code.
- Per Batch A completion, run:
  - `pnpm build`
  - `pnpm run test:security`
  - plus the additional tests introduced below.

---

## File Structure & Responsibilities

**Create (tests):**
- `src/lib/admin-api-route.test.ts` — unit tests for admin auth/header building and `proxyAdminRequest` header merge behavior.
- `scripts/admin-reservation-checkin-route.test.ts` — regression test for `src/pages/api/admin/reservations/[id]/checkin.ts` bug (missing `params`).
- `scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs` — guard test to enforce unification: admin proxy routes must use `proxyAdminRequest` and must not hand-roll `authorization`/`admin_token` parsing.
- `src/lib/master-api-route.ts` — shared master API route proxy helper (auth + upstream fetch + consistent wrapping), matching existing master route semantics.
- `src/lib/master-api-route.test.ts` — unit tests for `proxyMasterRequest` behavior.
- `scripts/check-master-api-routes-use-proxyMasterRequest.test.mjs` — guard test to enforce master routes (except login/logout/impersonate) use the shared helper.

**Modify (shared libs):**
- `src/lib/admin-api-route.ts:1-30` — add `readAdminAuth()` and refactor `buildAdminAuthHeader()` to use it.

**Modify (admin routes → unify):**
- `src/pages/api/admin/settings.ts:1-21`
- `src/pages/api/admin/settings/master.ts:1-22`
- `src/pages/api/admin/settings/password.ts:1-22`
- `src/pages/api/admin/settings/table-config.ts:1-22`
- `src/pages/api/admin/promotions.ts:1-31`
- `src/pages/api/admin/stats.ts:1-17`
- `src/pages/api/admin/reservation-stats.ts:1-17`
- `src/pages/api/admin/tables/checkout.ts:1-22`
- `src/pages/api/admin/tables/[table]/reviews/approve.ts:1-28`
- `src/pages/api/admin/tables/[table]/reviews/reject.ts:1-28`
- `src/pages/api/admin/customers/points.ts:1-21`
- `src/pages/api/admin/customers/vip.ts:1-46`
- `src/pages/api/admin/categories/[id].ts:1-25`
- `src/pages/api/admin/categories/[id]/move.ts:1-25`
- `src/pages/api/admin/products/[id].ts:1-57`
- `src/pages/api/admin/products/[id]/move.ts:1-25`
- `src/pages/api/admin/orders/[id]/edit.ts:1-25`
- `src/pages/api/admin/orders/[id]/mark-paid.ts:1-28`
- `src/pages/api/admin/orders/[id]/reject.ts:1-28`
- `src/pages/api/admin/orders/archive.ts:1-21`
- `src/pages/api/admin/orders/remarks.ts:1-21`
- `src/pages/api/admin/reservations/[id].ts:1-45`
- `src/pages/api/admin/reservations/[id]/print.ts:1-23`
- `src/pages/api/admin/reprint.ts:1-21`
- `src/pages/api/admin/renew/approve.ts:1-22`

**Modify (admin routes → special cases, preserve semantics):
- `src/pages/api/admin/orders.ts:1-83` — keep items_json repair + cache headers, but remove hand-rolled auth parsing.
- `src/pages/api/admin/customers/export.ts:1-41` — keep streaming response + timeout behavior, but remove hand-rolled auth parsing.
- `src/pages/api/admin/localize-images.ts:1-17` — remove hand-rolled auth parsing; use `readAdminAuth()`.
- `src/pages/api/admin/localize-images-batch.ts:1-130` — delete unused `readAuthHeader()` helper (dead code).
- `src/pages/api/admin/reservations/[id]/checkin.ts:1-29` (if not already migrated in Task 2) — fix runtime bug: include `params` in handler signature.
- `src/pages/api/upload.ts:1-53` — keep arrayBuffer passthrough + `/assets/` URL normalization, but remove hand-rolled auth parsing.

**Modify (master routes → unify via helper):**
- All master proxy routes except those that set/clear cookies:
  - Keep as-is: `src/pages/api/master/login.ts:1-43`, `src/pages/api/master/logout.ts:1-21`, `src/pages/api/master/impersonate-shop.ts:1-74`
  - Migrate to helper:
    - `src/pages/api/master/init.ts:1-35`
    - `src/pages/api/master/manage.ts:1-36`
    - `src/pages/api/master/backup.ts:1-37`
    - `src/pages/api/master/restore.ts:1-44`
    - `src/pages/api/master/upload.ts:1-44`
    - `src/pages/api/master/settings.ts:1-37`
    - `src/pages/api/master/categories.ts:1-38`
    - `src/pages/api/master/commission-batch.ts:1-38`
    - `src/pages/api/master/password.ts:1-38`
    - `src/pages/api/master/rate-center.ts:1-38`
    - `src/pages/api/master/shop-balance.ts:1-38`
    - `src/pages/api/master/shop-billing.ts:1-24`
    - `src/pages/api/master/shop-plan.ts:1-24`
    - `src/pages/api/master/shop-renew.ts:1-24`
    - `src/pages/api/master/shops.ts:1-38`
    - `src/pages/api/master/shops/[id].ts:1-73`
    - `src/pages/api/master/trigger-backup.ts:1-23`

---

## Chunk 1: Admin route single-source auth helper + unit tests

### Task 1: Add `readAdminAuth()` and unit tests

**Files:**
- Create: `src/lib/admin-api-route.test.ts`
- Modify: `src/lib/admin-api-route.ts:1-30`

- [ ] **Step 1: Write failing tests (new helper doesn’t exist yet)**

```ts
// src/lib/admin-api-route.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminAuthHeader, readAdminAuth, proxyAdminRequest } from './admin-api-route.ts';

test('readAdminAuth: prefers Authorization header over cookie token', () => {
  const req = new Request('http://local/', {
    headers: { authorization: 'Bearer header-token' },
  });
  const cookies: any = {
    get: (k: string) => (k === 'admin_token' ? { value: 'cookie-token' } : undefined),
  };

  assert.equal(readAdminAuth(req, cookies), 'Bearer header-token');
});

test('readAdminAuth: uses Bearer cookie token when header missing', () => {
  const req = new Request('http://local/');
  const cookies: any = {
    get: (k: string) => (k === 'admin_token' ? { value: 'cookie-token' } : undefined),
  };

  assert.equal(readAdminAuth(req, cookies), 'Bearer cookie-token');
});

test('readAdminAuth: returns empty string when header and cookie missing', () => {
  const req = new Request('http://local/');
  const cookies: any = { get: (_k: string) => undefined };

  assert.equal(readAdminAuth(req, cookies), '');
});

test('buildAdminAuthHeader: returns empty object when no auth found', () => {
  const req = new Request('http://local/');
  const cookies: any = { get: (_k: string) => undefined };

  assert.deepEqual(buildAdminAuthHeader(req, cookies), {});
});

test('proxyAdminRequest: merges computed auth header with caller headers', async () => {
  const req = new Request('http://local/api/admin/settings', { method: 'POST' });
  const cookies: any = {
    get: (k: string) => (k === 'admin_token' ? { value: 'cookie-token' } : undefined),
  };

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any, init?: any) => {
      assert.equal(String(url), 'https://upstream.example.test/x');
      assert.equal(String(init?.method || '').toUpperCase(), 'POST');
      assert.equal(init?.headers?.Authorization, 'Bearer cookie-token');
      assert.equal(init?.headers?.['Content-Type'], 'application/json');
      assert.equal(String(init?.body || ''), '{"ok":1}');

      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    };

    const res = await proxyAdminRequest({
      request: req,
      cookies,
      url: 'https://upstream.example.test/x',
      method: 'POST',
      body: '{"ok":1}',
      headers: { 'Content-Type': 'application/json' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/plain');
    assert.equal(await res.text(), 'OK');
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test('proxyAdminRequest: allows caller Authorization header to override computed auth', async () => {
  const req = new Request('http://local/api/admin/settings', { method: 'POST' });
  const cookies: any = {
    get: (k: string) => (k === 'admin_token' ? { value: 'cookie-token' } : undefined),
  };

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (_url: any, init?: any) => {
      assert.equal(init?.headers?.Authorization, 'Bearer explicit-token');
      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    };

    const res = await proxyAdminRequest({
      request: req,
      cookies,
      url: 'https://upstream.example.test/y',
      method: 'POST',
      body: '{}',
      headers: {
        Authorization: 'Bearer explicit-token',
        'Content-Type': 'application/json',
      },
    });

    assert.equal(res.status, 200);
  } finally {
    globalThis.fetch = fetchOrig;
  }
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `node --test src/lib/admin-api-route.test.ts`

历史红灯预期： (import error / `readAdminAuth` not exported).

- [ ] **Step 3: Implement `readAdminAuth()` and refactor `buildAdminAuthHeader()`**

```ts
// src/lib/admin-api-route.ts
import type { AstroCookies } from 'astro';
import { proxyFetch } from './api-proxy';

export function readAdminAuth(request: Request, cookies: AstroCookies): string {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  return headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
}

export function buildAdminAuthHeader(request: Request, cookies: AstroCookies): Record<string, string> {
  const auth = readAdminAuth(request, cookies);
  return auth ? { Authorization: auth } : {};
}
```

(Keep `proxyAdminRequest()` behavior unchanged; only centralize auth parsing.)

- [ ] **Step 4: Re-run tests (expect PASS)**

Run: `node --test src/lib/admin-api-route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-api-route.ts src/lib/admin-api-route.test.ts
git commit -m "$(cat <<'EOF'
refactor: centralize admin auth parsing
EOF
)"
```

---

## Chunk 2: Admin route migrations + bug fix + guard rails

### Task 2: Regression test + fix for reservations check-in route

**Files:**
- Create: `scripts/admin-reservation-checkin-route.test.ts`
- Modify: `src/pages/api/admin/reservations/[id]/checkin.ts:1-29`

- [ ] **Step 1: Write failing regression test**

```ts
// scripts/admin-reservation-checkin-route.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '../src/pages/api/admin/reservations/[id]/checkin.ts';
import { API_BASE_URL } from '../src/config.ts';

test('admin reservations checkin route: uses params.id and does not crash', async () => {
  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any, init?: any) => {
      assert.equal(String(url), `${API_BASE_URL}/api/admin/reservations/123/checkin`);
      assert.equal(init?.headers?.Authorization, 'Bearer t');
      assert.equal(String(init?.method || '').toUpperCase(), 'POST');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const req = new Request('http://local/api/admin/reservations/123/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ table: 'A1' }),
    });

    const res = await POST({
      request: req,
      cookies: { get: (_k: string) => undefined } as any,
      params: { id: '123' },
    } as any);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true });
  } finally {
    globalThis.fetch = fetchOrig;
  }
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `node --test scripts/admin-reservation-checkin-route.test.ts`

历史红灯预期： due to the current bug (`params` is not defined in the route).

- [ ] **Step 3: Fix route signature to include `params`**

Update to:

```ts
// src/pages/api/admin/reservations/[id]/checkin.ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../../config';
import { proxyFetch } from '../../../../../lib/api-proxy';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');

  const { id } = params;

  const body = await request.text();

  // Keep existing behavior: only fix the runtime crash (missing params in handler signature).
  return proxyFetch(`${API_BASE_URL}/api/admin/reservations/${id}/checkin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });
};
```

(Optional: If you prefer to avoid touching this file twice, you may also switch it to `proxyAdminRequest()` here; keep semantics identical.)

- [ ] **Step 4: Re-run test (expect PASS)**

Run: `node --test scripts/admin-reservation-checkin-route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/reservations/[id]/checkin.ts scripts/admin-reservation-checkin-route.test.ts
git commit -m "$(cat <<'EOF'
fix: pass params into admin reservation checkin
EOF
)"
```

---

### Task 3: Add admin route unification guard test

**End state (after Task 5):**
- `scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs` passes with **zero** manual-auth parsing hits across `src/pages/api/admin/**`.
- For non-special-case routes, `proxyAdminRequest()` is used.
- For special-case routes, `readAdminAuth()` / `buildAdminAuthHeader()` is used (no inline header/cookie parsing).

**Files:**
- Create: `scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs`

- [ ] **Step 1: Write a failing guard test (will fail until migrations are done)**

```js
// scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const ADMIN_API_ROOT = join(REPO_ROOT, 'src', 'pages', 'api', 'admin');

const SKIP_PROXY_ENFORCEMENT = new Set([
  // Not admin upstream proxies (cookie set/clear)
  'src/pages/api/admin/login.ts',
  'src/pages/api/admin/logout.ts',

  // Special-case routes that intentionally don't use proxyAdminRequest
  // (but must still avoid hand-rolled auth parsing).
  'src/pages/api/admin/orders.ts',
  'src/pages/api/admin/customers/export.ts',
  'src/pages/api/admin/localize-images.ts',
  'src/pages/api/admin/localize-images-batch.ts',
]);

const MANUAL_AUTH_PATTERNS = [
  // Match both Authorization and authorization casing.
  { id: 'authorization header', re: /request\.headers\.get\(\s*['\"]authorization['\"]\s*\)/i },

  // Catch both cookies.get('admin_token') and cookies?.get?.('admin_token') forms.
  { id: 'admin_token cookie get', re: /cookies\s*(?:\?\.)?get(?:\?\.)?\(\s*['\"]admin_token['\"]\s*\)/ },
];

function toPosix(p) {
  return String(p).split('\\').join('/');
}

async function walk(dirAbs) {
  const entries = await readdir(dirAbs, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const abs = join(dirAbs, e.name);
    if (e.isDirectory()) files.push(...(await walk(abs)));
    else if (e.isFile() && e.name.endsWith('.ts')) files.push(abs);
  }
  return files;
}

test('admin api routes: should not hand-roll auth parsing; should use proxyAdminRequest', async () => {
  const absFiles = await walk(ADMIN_API_ROOT);

  const hits = [];
  for (const abs of absFiles) {
    const rel = toPosix(relative(REPO_ROOT, abs));

    const content = await readFile(abs, 'utf8');

    // Always enforce: no hand-rolled admin auth parsing.
    for (const pat of MANUAL_AUTH_PATTERNS) {
      if (pat.re.test(content)) {
        hits.push({ rel, kind: pat.id });
      }
    }

    // Enforce proxyAdminRequest() for normal proxy routes.
    // (Special-case routes are exempt from proxyAdminRequest enforcement only.)
    if (!SKIP_PROXY_ENFORCEMENT.has(rel)) {
      if (!/proxyAdminRequest\s*\(/.test(content)) {
        hits.push({ rel, kind: 'missing proxyAdminRequest()' });
      }
    }
  }

  if (hits.length === 0) return;
  const preview = hits
    .slice(0, 80)
    .map((h) => `- ${h.kind}\t${h.rel}`)
    .join('\n');
  const suffix = hits.length > 80 ? `\n... and ${hits.length - 80} more` : '';
  assert.fail(`Admin API route unification violations found:\n${preview}${suffix}`);
});
```

- [ ] **Step 2: Run guard test (expect FAIL)**

Run: `node --test scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs`

历史红灯预期： with a list of violating files.

(Do not commit yet; make it pass in the next tasks, then commit together.)

---

### Task 4: Migrate admin proxy routes to `proxyAdminRequest` (no behavior changes)

> **Recommended execution:** split this task into 3–5 small commits by route family (settings/stats; tables/reviews; customers; catalog; orders/reservations). Run the guard test after each group so you can pinpoint regressions quickly.

**Files (migrate):**
- `src/pages/api/admin/settings.ts:1-21`
- `src/pages/api/admin/settings/master.ts:1-22`
- `src/pages/api/admin/settings/password.ts:1-22`
- `src/pages/api/admin/settings/table-config.ts:1-22`
- `src/pages/api/admin/promotions.ts:1-31`
- `src/pages/api/admin/stats.ts:1-17`
- `src/pages/api/admin/reservation-stats.ts:1-17`
- `src/pages/api/admin/tables/checkout.ts:1-22`
- `src/pages/api/admin/tables/[table]/reviews/approve.ts:1-28`
- `src/pages/api/admin/tables/[table]/reviews/reject.ts:1-28`
- `src/pages/api/admin/customers/points.ts:1-21`
- `src/pages/api/admin/customers/vip.ts:1-46`
- `src/pages/api/admin/categories/[id].ts:1-25`
- `src/pages/api/admin/categories/[id]/move.ts:1-25`
- `src/pages/api/admin/products/[id].ts:1-57`
- `src/pages/api/admin/products/[id]/move.ts:1-25`
- `src/pages/api/admin/orders/[id]/edit.ts:1-25`
- `src/pages/api/admin/orders/[id]/mark-paid.ts:1-28`
- `src/pages/api/admin/orders/[id]/reject.ts:1-28`
- `src/pages/api/admin/orders/archive.ts:1-21`
- `src/pages/api/admin/orders/remarks.ts:1-21`
- `src/pages/api/admin/reservations/[id].ts:1-45`
- `src/pages/api/admin/reservations/[id]/print.ts:1-23`
- `src/pages/api/admin/reprint.ts:1-21`
- `src/pages/api/admin/renew/approve.ts:1-22`
- `src/pages/api/admin/reservations/[id]/checkin.ts:1-29` (if not already migrated in Task 2)

- [ ] **Step 1: Apply the standard rewrite (template)**

For each migrated file:

1) Replace imports:

- Remove: `import { proxyFetch } from ...` (if present)
- Add: `import { proxyAdminRequest } from '<relative>/lib/admin-api-route';`
  - If the route file is under `src/pages/api/admin/*.ts`: use `../../../lib/admin-api-route`
  - If under `src/pages/api/admin/**/**.ts`: count `../` segments so it reaches `src/lib/admin-api-route.ts` (match existing import style in nearby files).

2) Replace hand-rolled auth parsing + `proxyFetch(...)` with:

```ts
return proxyAdminRequest({
  request,
  cookies,
  url: `${API_BASE_URL}/api/admin/<path>`,
  method: '<METHOD>',
  body: <bodyTextOrJsonString>,
  headers: <optionalHeaders>,
});
```

**Examples (copy exactly):**

**A) JSON POST using request.text():**

```ts
export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.text();
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/settings/password`,
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

**B) GET with query string from `url.search`:**

```ts
export const GET: APIRoute = async ({ request, url, cookies }) => {
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/stats${url.search || ''}`,
    method: 'GET',
  });
};
```

**C) Dynamic param route:**

```ts
export const POST: APIRoute = async ({ request, params, cookies }) => {
  const id = params.id;
  if (!id) return new Response('Not Found', { status: 404 });

  // NOTE: Some routes historically return 400 JSON when params are missing.
  // In this batch, do not change missing-param semantics—mirror the existing route behavior.

  const body = await request.text();
  return proxyAdminRequest({
    request,
    cookies,
    // Keep exact upstream URL semantics (do not introduce encoding changes in this refactor).
    url: `${API_BASE_URL}/api/admin/orders/${id}/mark-paid`,
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

**D) products/[id].ts upsert (preserve existing semantics):**

```ts
export const PUT: APIRoute = async ({ request, params, cookies }) => {
  const id = params.id;
  if (!id) return new Response('Not Found', { status: 404 });

  const raw = await request.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }

  const body = JSON.stringify({ ...parsed, id: Number(id) });
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/products`,
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Run the guard test again (expect partial PASS)**

Run: `node --test scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs`

Expected: It should **no longer report** `missing proxyAdminRequest()` for the routes migrated in Task 4. It may still report `authorization header` / `admin_token cookie get` for special-case routes (those are fixed in Task 5).

If it reports `missing proxyAdminRequest()` for any non-special-case route:
- add the violating file to **Task 4 “Files (migrate)”**
- migrate it using the same `proxyAdminRequest` template

If it reports `missing proxyAdminRequest()` for a route that should not use it (streaming/SSE/file passthrough/custom semantics):
- add the route to `SKIP_PROXY_ENFORCEMENT` with a comment explaining why
- keep the “no manual auth parsing” requirement by switching that route to `readAdminAuth()` / `buildAdminAuthHeader()`

- [ ] **Step 3: Run focused regression tests**

Run:
- `node --test src/lib/admin-api-route.test.ts`
- `node --test scripts/admin-reservation-checkin-route.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit the migrations**

(Commit only after you have resolved all `missing proxyAdminRequest()` findings for non-special-case routes. `authorization header` / `admin_token cookie get` findings for special-case routes are expected until Task 5.)

```bash
# NOTE: Stage the exact files you migrated in this commit.
# If you migrated a subset (recommended), adjust this list.
# If you followed the Task 4 file list exactly, include all those files.

git add \
  src/pages/api/admin/settings.ts \
  src/pages/api/admin/settings/master.ts \
  src/pages/api/admin/settings/password.ts \
  src/pages/api/admin/settings/table-config.ts \
  src/pages/api/admin/promotions.ts \
  src/pages/api/admin/stats.ts \
  src/pages/api/admin/reservation-stats.ts \
  src/pages/api/admin/tables/checkout.ts \
  src/pages/api/admin/tables/[table]/reviews/approve.ts \
  src/pages/api/admin/tables/[table]/reviews/reject.ts \
  src/pages/api/admin/customers/points.ts \
  src/pages/api/admin/customers/vip.ts \
  src/pages/api/admin/categories/[id].ts \
  src/pages/api/admin/categories/[id]/move.ts \
  src/pages/api/admin/products/[id].ts \
  src/pages/api/admin/products/[id]/move.ts \
  src/pages/api/admin/orders/[id]/edit.ts \
  src/pages/api/admin/orders/[id]/mark-paid.ts \
  src/pages/api/admin/orders/[id]/reject.ts \
  src/pages/api/admin/orders/archive.ts \
  src/pages/api/admin/orders/remarks.ts \
  src/pages/api/admin/reservations/[id].ts \
  src/pages/api/admin/reservations/[id]/print.ts \
  src/pages/api/admin/reprint.ts \
  src/pages/api/admin/renew/approve.ts

git commit -m "$(cat <<'EOF'
refactor: unify admin api routes via proxyAdminRequest
EOF
)"
```

- [ ] **Step 5: Commit the guard test (after Task 5 makes it pass)**

```bash
git add scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs

git commit -m "$(cat <<'EOF'
test: enforce unified admin api route boundary
EOF
)"
```

---

### Task 5: Refactor admin special-case routes to use shared auth parsing (no behavior changes)

**Files:**
- Modify: `src/pages/api/admin/orders.ts:1-83`
- Modify: `src/pages/api/admin/customers/export.ts:1-41`
- Modify: `src/pages/api/admin/localize-images.ts:1-17`
- Modify: `src/pages/api/admin/localize-images-batch.ts:1-130`
- Modify: `src/pages/api/upload.ts:1-53`

- [ ] **Step 1: `admin/orders.ts` — remove inline auth parsing, keep items_json repair + cache headers**

Replace:

```ts
const headerAuth = request.headers.get('authorization') || '';
const cookieToken = cookies.get('admin_token')?.value || '';
const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
```

with:

```ts
import { buildAdminAuthHeader } from '../../../lib/admin-api-route';

const authHeaders = buildAdminAuthHeader(request, cookies);
```

Then update upstream fetch headers to:

```ts
headers: {
  ...authHeaders,
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
},
```

Everything else (cache/no-store + response headers + items_json repair) stays identical.

- [ ] **Step 2: `admin/customers/export.ts` — remove inline auth parsing, keep streaming + timeout semantics**

Replace the inline `auth` build with:

```ts
import { buildAdminAuthHeader } from '../../../../lib/admin-api-route';

const authHeaders = buildAdminAuthHeader(request, cookies);
```

and use:

```ts
headers: authHeaders,
```

Do not change:
- AbortController timeout (30s)
- Header-copy logic (strip `transfer-encoding`)
- Error response (`new Response('Backend unavailable', { status: 502 })`)

- [ ] **Step 3: `admin/localize-images.ts` — use `readAdminAuth()` to build `authHeader`**

```ts
import { readAdminAuth } from '../../../lib/admin-api-route';

export const POST: APIRoute = async ({ request, cookies }) => {
  const authHeader = readAdminAuth(request, cookies);
  return handleLocalizeImagesBatchRequest({ request, authHeader, fetchImpl: fetch });
};
```

- [ ] **Step 4: `admin/localize-images-batch.ts` — delete unused `readAuthHeader()`**

In `src/pages/api/admin/localize-images-batch.ts`, remove the entire unused helper function:

```ts
function readAuthHeader(request: Request, cookies: any): string {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies?.get?.('admin_token')?.value || '';
  return headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
}
```

because it is unused (handler receives `authHeader` via options).

- [ ] **Step 5: `api/upload.ts` — remove inline auth parsing; use `buildAdminAuthHeader()`**

Replace:

```ts
const headerAuth = request.headers.get('authorization') || '';
const cookieToken = cookies.get('admin_token')?.value || '';
const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
```

with:

```ts
import { buildAdminAuthHeader } from '../../lib/admin-api-route';

const authHeaders = buildAdminAuthHeader(request, cookies);
```

and use:

```ts
headers: {
  ...(request.headers.get('content-type') ? { 'Content-Type': request.headers.get('content-type') } : {}),
  ...authHeaders,
},
```

Keep `/assets/` URL normalization behavior unchanged.

- [ ] **Step 6: Run relevant tests**

Run:
- `node --test scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs`
- `node --test scripts/localize-images-batch.test.ts` (pre-existing)
- `node --test src/lib/admin-api-route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  src/pages/api/admin/orders.ts \
  src/pages/api/admin/customers/export.ts \
  src/pages/api/admin/localize-images.ts \
  src/pages/api/admin/localize-images-batch.ts \
  src/pages/api/upload.ts

git commit -m "$(cat <<'EOF'
refactor: remove duplicated admin auth parsing
EOF
)"
```

---

## Chunk 3: Master route unification via shared helper

### Task 6: Create `proxyMasterRequest()` helper + tests

**Files:**
- Create: `src/lib/master-api-route.ts`
- Create: `src/lib/master-api-route.test.ts`

- [ ] **Step 1: Write failing tests (helper doesn’t exist yet)**

```ts
// src/lib/master-api-route.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { proxyMasterRequest } from './master-api-route.ts';

test('proxyMasterRequest: returns 401 unauthorized when no auth', async () => {
  const req = new Request('http://local/api/master/init');
  const cookies: any = { get: (_k: string) => undefined };

  const res = await proxyMasterRequest({
    request: req,
    cookies,
    upstreamUrl: 'https://upstream.example.test/api/master/init',
    fallbackToken: '',
    allowFallbackToken: false,
    method: 'GET',
  });

  assert.equal(res.status, 401);
  assert.ok((res.headers.get('content-type') || '').includes('application/json'));
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, 'unauthorized');
});

test('proxyMasterRequest: forwards to upstream and preserves status + content-type (text body)', async () => {
  const req = new Request('http://local/api/master/init', {
    headers: { authorization: 'Bearer header-token' },
  });
  const cookies: any = { get: (_k: string) => undefined };

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any, init?: any) => {
      assert.equal(String(url), 'https://upstream.example.test/api/master/init');
      assert.equal((init?.headers || {}).Authorization, 'Bearer header-token');
      return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    };

    const res = await proxyMasterRequest({
      request: req,
      cookies,
      upstreamUrl: 'https://upstream.example.test/api/master/init',
      fallbackToken: '',
      allowFallbackToken: false,
      method: 'GET',
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/plain');
    assert.equal(await res.text(), 'OK');
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test('proxyMasterRequest: should NOT allow fallback token unless explicitly enabled', async () => {
  const req = new Request('http://local/api/master/init');
  const cookies: any = { get: (_k: string) => undefined };

  const res = await proxyMasterRequest({
    request: req,
    cookies,
    upstreamUrl: 'https://upstream.example.test/api/master/init',
    fallbackToken: 'fallback-token',
    allowFallbackToken: false,
    method: 'GET',
  });

  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

Run: `node --test src/lib/master-api-route.test.ts`

历史红灯预期： because `src/lib/master-api-route.ts` does not exist.

- [ ] **Step 3: Implement `proxyMasterRequest()` matching existing master route semantics**

```ts
// src/lib/master-api-route.ts
import type { AstroCookies } from 'astro';
import { resolveMasterAuth } from './master-auth';

export async function proxyMasterRequest(options: {
  request: Request;
  cookies: AstroCookies;
  upstreamUrl: string;
  fallbackToken?: string;
  allowFallbackToken: boolean;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}): Promise<Response> {
  try {
    const auth = resolveMasterAuth(options.request, options.cookies as any, options.fallbackToken, {
      // Required: master routes in this repo are strict by default.
      allowFallbackToken: options.allowFallbackToken,
    });

    if (!auth) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { request, upstreamUrl } = options;
    const method = options.method || request.method;
    const headers = {
      ...(options.headers || {}),
      Authorization: auth,
    };

    const init: RequestInit = {
      method,
      headers,
      ...(options.body !== undefined ? { body: options.body } : {}),
    };

    const res = await fetch(upstreamUrl, init);
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'proxy failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 4: Re-run tests (expect PASS)**

Run: `node --test src/lib/master-api-route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/master-api-route.ts src/lib/master-api-route.test.ts
git commit -m "$(cat <<'EOF'
refactor: add shared master api route proxy
EOF
)"
```

---

### Task 7: Add master route guard + migrate routes to helper

**Files:**
- Create: `scripts/check-master-api-routes-use-proxyMasterRequest.test.mjs`
- Modify: master routes listed in “File Structure & Responsibilities”

- [ ] **Step 1: Create guard test (will fail until migrations complete)**

```js
// scripts/check-master-api-routes-use-proxyMasterRequest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const MASTER_API_ROOT = join(REPO_ROOT, 'src', 'pages', 'api', 'master');

const SKIP_FILES = new Set([
  // These routes intentionally manage cookies / auth lifecycle.
  'src/pages/api/master/login.ts',
  'src/pages/api/master/logout.ts',
  'src/pages/api/master/impersonate-shop.ts',
]);

function toPosix(p) {
  return String(p).split('\\').join('/');
}

async function walk(dirAbs) {
  const entries = await readdir(dirAbs, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const abs = join(dirAbs, e.name);
    if (e.isDirectory()) files.push(...(await walk(abs)));
    else if (e.isFile() && e.name.endsWith('.ts')) files.push(abs);
  }
  return files;
}

test('master api routes: should use proxyMasterRequest helper', async () => {
  const absFiles = await walk(MASTER_API_ROOT);

  const hits = [];
  for (const abs of absFiles) {
    const rel = toPosix(relative(REPO_ROOT, abs));
    if (SKIP_FILES.has(rel)) continue;

    const content = await readFile(abs, 'utf8');

    // No more inline resolveMasterAuth glue in route bodies.
    if (/resolveMasterAuth\s*\(/.test(content)) {
      hits.push({ rel, kind: 'inline resolveMasterAuth()' });
    }

    if (!/proxyMasterRequest\s*\(/.test(content)) {
      hits.push({ rel, kind: 'missing proxyMasterRequest()' });
    }
  }

  if (hits.length === 0) return;
  const preview = hits
    .slice(0, 80)
    .map((h) => `- ${h.kind}\t${h.rel}`)
    .join('\n');
  const suffix = hits.length > 80 ? `\n... and ${hits.length - 80} more` : '';
  assert.fail(`Master API route unification violations found:\n${preview}${suffix}`);
});
```

- [ ] **Step 2: Run guard test (expect FAIL)**

Run: `node --test scripts/check-master-api-routes-use-proxyMasterRequest.test.mjs`

历史红灯预期： with list of master routes.

- [ ] **Step 3: Migrate each master proxy route to `proxyMasterRequest()`**

**Template (POST JSON body):**

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../config';
import { proxyMasterRequest } from '../../../lib/master-api-route';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.text();
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/manage`,
    method: 'POST',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
};
```

**Template (GET no body):**

```ts
export const GET: APIRoute = async ({ request, cookies }) => {
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/init`,
    method: 'GET',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
  });
};
```

**Template (arrayBuffer passthrough, keep Content-Type):**

```ts
export const POST: APIRoute = async ({ request, cookies }) => {
  const contentType = request.headers.get('content-type') || '';
  const body = await request.arrayBuffer();

  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/upload`,
    method: 'POST',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
    headers: {
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body,
  });
};
```

**shops/[id].ts PUT:** keep id validation + pass JSON text body:

```ts
export const PUT: APIRoute = async ({ request, cookies, params }) => {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: 'invalid shop id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.text();
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/shops/${id}`,
    method: 'PUT',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
};
```

**shops/[id].ts DELETE:** keep id validation; no body:

```ts
export const DELETE: APIRoute = async ({ request, cookies, params }) => {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: 'invalid shop id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/shops/${id}`,
    method: 'DELETE',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
  });
};
```

- [ ] **Step 4: Re-run guard + unit tests (expect PASS)**

Run:
- `node --test src/lib/master-api-route.test.ts`
- `node --test scripts/check-master-api-routes-use-proxyMasterRequest.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  scripts/check-master-api-routes-use-proxyMasterRequest.test.mjs \
  src/pages/api/master/init.ts \
  src/pages/api/master/manage.ts \
  src/pages/api/master/backup.ts \
  src/pages/api/master/restore.ts \
  src/pages/api/master/upload.ts \
  src/pages/api/master/settings.ts \
  src/pages/api/master/categories.ts \
  src/pages/api/master/commission-batch.ts \
  src/pages/api/master/password.ts \
  src/pages/api/master/rate-center.ts \
  src/pages/api/master/shop-balance.ts \
  src/pages/api/master/shop-billing.ts \
  src/pages/api/master/shop-plan.ts \
  src/pages/api/master/shop-renew.ts \
  src/pages/api/master/shops.ts \
  src/pages/api/master/shops/[id].ts \
  src/pages/api/master/trigger-backup.ts

git commit -m "$(cat <<'EOF'
refactor: unify master api routes via proxyMasterRequest
EOF
)"
```

---

## Batch A Verification (hard gate)

- [ ] **Step 1: Build**

Run: `pnpm build`

Expected: exit code 0.

- [ ] **Step 2: Security gate tests**

Run: `pnpm run test:security`

Expected: PASS (0 failing tests).

- [ ] **Step 3: Batch-A-specific tests (required)**

Run:

```bash
node --test \
  src/lib/admin-api-route.test.ts \
  src/lib/master-api-route.test.ts \
  scripts/admin-reservation-checkin-route.test.ts \
  scripts/localize-images-batch.test.ts \
  scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs \
  scripts/check-master-api-routes-use-proxyMasterRequest.test.mjs
```

Expected: PASS.

(These guard tests are not currently wired into `pnpm run test:security`; treat this step as mandatory for Batch A.)

- [ ] **Step 4: Smoke (manual, quick)**

From spec “回归验证清单（每个 Batch 必跑）”, do at least:
- Shop page renders; add to cart; cart modal open/close; checkout page opens.
- User center opens; login/register entry works; order history list renders.
- Reservation entry visible (“预订” + “Rezervacija”).
- Chat entry opens (UI + degradation ok).
- Admin login works; open Orders/Tables/Menu/Settings tabs; no JS errors breaking core actions.
- Master entry page opens and renders main cards.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-17-aggressive-cleanup-and-unification-batch-a.md`.

Next step (execution): use `superpowers:subagent-driven-development` to implement task-by-task with frequent verification and small commits.
