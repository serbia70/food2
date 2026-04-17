# Go Minimalization + Astro-Only Entrypoints Implementation Plan

> 状态说明（历史计划）：这份计划记录的是当时的迁移步骤与测试推进方式，文中的 `历史红灯预期：`、旧路径与旧测试文件名属于阶段性实施语境，不应再被当作当前仓库状态直接照搬。
> 继续处理 Astro 单入口与 Go 收口时，应先读取当前真实代码与现行设计，再决定哪些步骤仍值得复用。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Go-served browser entrypoints and enforce proxy-only access so browsers only use the Cloudflare (Astro) origin.

**Architecture:** Browsers hit Astro (Cloudflare) for all HTML/UI and same-origin `/api/**`. Astro proxies server-to-server to the Go VPS for data-plane APIs. Go public origin must not serve `/master.html`, `/admin.html`, or legacy `/:slug` static HTML; legacy asset routes must have explicit redirect/404 behavior.

**Tech Stack:** Go (Gin), Astro (Cloudflare adapter), Node `node --test` security gates, pnpm.

**Spec:** `docs/superpowers/specs/2026-03-13-go-minimalize-migrate-to-astro-design.md`

---

## File structure / responsibilities (what changes where)

- Modify: `meituanGo/cmd/server/main.go`
  - Remove legacy static HTML entrypoints.
  - Replace legacy browser entrypoints with explicit 404/redirect behavior.
- Create: `meituanAstro/scripts/check-no-go-static-entrypoints.test.mjs`
  - Gate: Go must not register `/master.html`, `/admin.html`, or `/:slug -> static/index.html`.
- Create: `meituanAstro/scripts/check-no-hardcoded-go-origin-in-browser.test.mjs`
  - Gate: browser-facing code must not hardcode `api.serbia70.com`.
- Modify: `meituanAstro/package.json`
  - Add new security-gate scripts to `test:security`.
- (Optional but recommended) Create: `meituanAstro/src/pages/favicon.ico.ts`
  - Ensure Cloudflare origin has a deterministic `/favicon.ico` behavior so Go redirects don’t lead to a broken favicon.

---

## Chunk 0: Phase A preflight inventory (required by spec)

### Task 0: Inventory browser entrypoints + decide Go-side legacy behavior

**Files:**
- Reference: `docs/superpowers/specs/2026-03-13-go-minimalize-migrate-to-astro-design.md`
- Reference: `meituanGo/cmd/server/main.go`
- Reference: `meituanAstro/src/pages/**`

- [ ] **Step 1: List current intended browser HTML entrypoints**

Make a short checklist (in your notes) covering at least:
- `/master` + `/master/login`
- `/admin` (global) and/or `/:slug/admin` (shop-scoped)
- `/<slug>`
- one `/<slug>` deep link page, e.g. `/<slug>/order-view/<order_no>`
- if realtime exists in browser, note the SSE endpoint (likely `/api/stream/:slug`)

- [ ] **Step 2: For each legacy Go-public path, decide behavior**

Decisions must be explicit and consistent with the spec:
- `/master.html` → 404
- `/admin.html` → 404
- `/<slug>` on Go origin → 308 redirect to frontend `/<slug>`
- `/assets/*` and `/favicon.ico` on Go origin → 308 redirect (preferred) or 404
- unknown non-API paths on Go origin → 308 redirect to frontend preserving path/query (recommended)

- [ ] **Step 3: Verify Astro has matching entrypoints**

Confirm Astro has pages for the intended entrypoints under `meituanAstro/src/pages/**` and that they load via same-origin `/api/**`.

---

## Chunk 1: Add automated gates (TDD) for “no Go static entrypoints” + “no browser direct Go origin”

### Task 1: Gate — Go must not mount legacy static entrypoints

**Files:**
- Create: `meituanAstro/scripts/check-no-go-static-entrypoints.test.mjs`
- Modify: `meituanAstro/package.json`

- [ ] **Step 1: Write the failing test**

Create `meituanAstro/scripts/check-no-go-static-entrypoints.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GO_MAIN = resolve(__dirname, '..', '..', 'meituanGo', 'cmd', 'server', 'main.go');

function mustNotInclude(source, needle) {
  assert.ok(!source.includes(needle), `expected Go main.go to NOT include: ${needle}`);
}

test('go must not mount legacy static browser entrypoints', () => {
  const src = readFileSync(GO_MAIN, 'utf8');

  // Static HTML entrypoints (must be removed).
  mustNotInclude(src, 'StaticFile("/master.html"');
  mustNotInclude(src, 'StaticFile("/admin.html"');

  // Legacy HTML serving must be gone.
  mustNotInclude(src, 'c.File("./static/index.html")');

  // NoRoute is allowed, but it must not serve legacy static HTML.
  const noRouteIndex = src.indexOf('NoRoute(');
  if (noRouteIndex !== -1) {
    const tail = src.slice(noRouteIndex, noRouteIndex + 800);
    assert.ok(
      !tail.includes('c.File("./static/index.html")'),
      'NoRoute must not serve ./static/index.html',
    );
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root):

```bash
cd meituanAstro
node --test scripts/check-no-go-static-entrypoints.test.mjs
```

Expected: **FAIL** because `meituanGo/cmd/server/main.go` currently contains those routes.

- [ ] **Step 3: Add it to the security test suite**

Modify `meituanAstro/package.json` `scripts.test:security` to include the new test file (append at end is fine):

```json
"test:security": "node --test ... scripts/check-no-go-static-entrypoints.test.mjs"
```

- [ ] **Step 4: Run the suite again (still failing until Go changes land)**

Run:

```bash
cd meituanAstro
pnpm run test:security
```

历史红灯预期：, same reason.

- [ ] **Step 5: Commit**

```bash
git add meituanAstro/scripts/check-no-go-static-entrypoints.test.mjs meituanAstro/package.json
git commit -m "test(security): gate Go static entrypoints"
```

---

### Task 2: Gate — browser-facing code must not hardcode Go public origin

**Files:**
- Create: `meituanAstro/scripts/check-no-hardcoded-go-origin-in-browser.test.mjs`
- Modify: `meituanAstro/package.json`

- [ ] **Step 1: Write the failing test**

Create `meituanAstro/scripts/check-no-hardcoded-go-origin-in-browser.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT = join(__dirname, '..');

const SCAN_ROOTS = [
  join(PROJECT, 'src', 'pages'),
  join(PROJECT, 'src', 'components'),
  join(PROJECT, 'src', 'scripts'),
];

const EXCLUDED_ROOT = join(PROJECT, 'src', 'pages', 'api');

const ALLOWED_EXTS = new Set(['.astro', '.ts', '.tsx']);

function toPosixPath(p) {
  return p.replaceAll('\\\\', '/');
}

function extnameLite(p) {
  const i = p.lastIndexOf('.');
  return i === -1 ? '' : p.slice(i);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const out = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (abs.startsWith(EXCLUDED_ROOT)) continue;

    if (entry.isDirectory()) {
      out.push(...(await walk(abs)));
      continue;
    }

    if (entry.isFile() && ALLOWED_EXTS.has(extnameLite(abs))) out.push(abs);
  }
  return out;
}

test('browser-facing code must not hardcode Go origin (proxy-only)', async () => {
  // Keep the scan limited to src/{pages,components,scripts}/**. Do NOT scan dist/node_modules.
  const files = [];
  for (const root of SCAN_ROOTS) files.push(...(await walk(root)));

  const hits = [];
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    if (src.includes('api.serbia70.com')) hits.push(toPosixPath(relative(PROJECT, file)));
  }

  assert.deepEqual(hits, [], `found hardcoded Go origin in browser-facing code:\n${hits.join('\n')}`);
});
```

- [ ] **Step 2: Run test to verify baseline**

Run:

```bash
cd meituanAstro
node --test scripts/check-no-hardcoded-go-origin-in-browser.test.mjs
```

Expected: ideally PASS already; if FAIL, fix offending files *only where they are truly browser-facing* by switching to same-origin `/api/**` usage.

- [ ] **Step 3: Add to `test:security`**

Modify `meituanAstro/package.json` `scripts.test:security` to include it.

- [ ] **Step 4: Commit**

```bash
git add meituanAstro/scripts/check-no-hardcoded-go-origin-in-browser.test.mjs meituanAstro/package.json
git commit -m "test(security): forbid hardcoded Go origin in browser code"
```

---

## Chunk 2: Update Go routing — remove static HTML entrypoints and define explicit legacy behavior

### Task 3: Make `/master.html` and `/admin.html` 404 on Go (and prevent NoRoute legacy HTML)

**Files:**
- Modify: `meituanGo/cmd/server/main.go`
- Test: `meituanAstro/scripts/check-no-go-static-entrypoints.test.mjs`

- [ ] **Step 1: Verify the new gate currently fails**

```bash
cd meituanAstro
node --test scripts/check-no-go-static-entrypoints.test.mjs
```

历史红灯预期：.

- [ ] **Step 2: Ensure explicit 404 handlers for legacy HTML paths**

Because Go currently has a legacy SPA fallback (`r.NoRoute(...)` serving `./static/index.html`), removing the static mounts alone will NOT guarantee 404. Add explicit 404 handlers:

```go
r.GET("/master.html", func(c *gin.Context) { c.AbortWithStatus(http.StatusNotFound) })
r.GET("/admin.html", func(c *gin.Context) { c.AbortWithStatus(http.StatusNotFound) })
```

- [ ] **Step 3: Remove the static file mounts**

In `meituanGo/cmd/server/main.go`, delete these lines:

```go
r.StaticFile("/admin.html", "./static/admin.html")
r.StaticFile("/master.html", "./static/master.html")
```

- [ ] **Step 4: Update `NoRoute` to stop serving legacy HTML**

Find the existing legacy fallback:

```go
r.NoRoute(func(c *gin.Context) {
  c.File("./static/index.html")
})
```

Replace it with a safe default:
- If path starts with `/api/` → return JSON 404
- Otherwise → 308 redirect to `frontendBase + path + ?query` (required by this plan to match spec).

Note: **Do not remove `NoRoute` just to satisfy a gate**. `NoRoute` is acceptable and expected for implementing the spec’s explicit behavior, as long as it does not serve legacy HTML.

Example (recommended redirect):

```go
r.NoRoute(func(c *gin.Context) {
  p := c.Request.URL.Path
  if strings.HasPrefix(p, "/api/") {
    c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
    return
  }
  target := frontendBase + p
  if raw := c.Request.URL.RawQuery; raw != "" {
    target += "?" + raw
  }
  c.Redirect(http.StatusPermanentRedirect, target)
})
```

- [ ] **Step 5: Run the gate**

```bash
cd meituanAstro
node --test scripts/check-no-go-static-entrypoints.test.mjs
```

Expected: still FAIL (because `/:slug` static index is still present), but `NoRoute(` should no longer exist.

- [ ] **Step 6: Commit**

```bash
git add meituanGo/cmd/server/main.go
git commit -m "chore(go): remove legacy admin/master static pages"
```

---

### Task 4: Replace `GET /:slug` static HTML with redirect to frontend

**Files:**
- Modify: `meituanGo/cmd/server/main.go:155-175`
- Test: `meituanAstro/scripts/check-no-go-static-entrypoints.test.mjs`

- [ ] **Step 1: Change `/:slug` handler to redirect**

Replace the current legacy handler:

```go
r.GET("/:slug", func(c *gin.Context) {
  c.File("./static/index.html")
})
```

With a redirect to `frontendBase`:

```go
r.GET("/:slug", func(c *gin.Context) {
  slug := c.Param("slug")
  target := fmt.Sprintf("%s/%s", frontendBase, url.PathEscape(slug))
  if raw := c.Request.URL.RawQuery; raw != "" {
    target += "?" + raw
  }
  c.Redirect(http.StatusPermanentRedirect, target) // 308
})
```

- [ ] **Step 2: Ensure `/:slug/admin.html` redirect still works**

Because `/:slug/admin.html` is a more specific route, keep it registered (as it already is). If route matching order becomes an issue, register `/:slug/admin.html` before `/:slug`.

- [ ] **Step 3: Run the gate — it should now pass**

```bash
cd meituanAstro
node --test scripts/check-no-go-static-entrypoints.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run Go tests**

```bash
cd meituanGo
go test ./...
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add meituanGo/cmd/server/main.go
git commit -m "chore(go): redirect legacy /:slug to Astro frontend"
```

---

### Task 5: Define explicit `/assets/*` and `/favicon.ico` behavior on Go

**Files:**
- Modify: `meituanGo/cmd/server/main.go:111-116`

- [ ] **Step 1: Replace static mounts with redirect or 404 policy**

Spec requires explicit behavior; choose **redirect** so legacy bookmarks/QR codes still resolve.

Replace:

```go
r.Static("/assets", "./static/assets")
r.StaticFile("/favicon.ico", "./static/favicon.ico")
```

With:

```go
r.GET("/favicon.ico", func(c *gin.Context) {
  c.Redirect(http.StatusPermanentRedirect, frontendBase+"/favicon.ico")
})

r.GET("/assets/*path", func(c *gin.Context) {
  p := c.Param("path")
  c.Redirect(http.StatusPermanentRedirect, frontendBase+"/assets"+p)
})
```

- [ ] **Step 2: Run Go tests**

```bash
cd meituanGo
go test ./...
```

- [ ] **Step 3: Commit**

```bash
git add meituanGo/cmd/server/main.go
git commit -m "chore(go): redirect legacy assets and favicon to frontend"
```

---

## Chunk 3: Cloudflare-side polish + verification

### Task 6 (optional but recommended): Ensure Cloudflare origin has deterministic `/favicon.ico`

**Files:**
- Create: `meituanAstro/src/pages/favicon.ico.ts`

- [ ] **Step 1: Write the failing expectation (manual)**

After Go starts redirecting `/favicon.ico` to frontend, open frontend `/favicon.ico` and confirm a stable response.

- [ ] **Step 2: Implement minimal favicon behavior in Astro**

Create `meituanAstro/src/pages/favicon.ico.ts`:

```ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 308,
    headers: { Location: '/favicon.svg' },
  });
};
```

- [ ] **Step 3: Verify locally**

```bash
cd meituanAstro
pnpm run dev
# then visit http://127.0.0.1:4321/favicon.ico
```

Expected: 308 to `/favicon.svg`.

- [ ] **Step 4: Commit**

```bash
git add meituanAstro/src/pages/favicon.ico.ts
git commit -m "chore(astro): add favicon.ico redirect"
```

---

### Task 7: Verification run (local + build)

- [ ] **Step 1: Run Astro security suite**

```bash
cd meituanAstro
pnpm run test:security
```

Expected: PASS.

- [ ] **Step 2: Run Astro build**

```bash
cd meituanAstro
pnpm run build
```

Expected: build success.

- [ ] **Step 3: Run Go tests**

```bash
cd meituanGo
go test ./...
```

Expected: PASS.

- [ ] **Step 4: Manual route verification (local)**

Run Go with `MEITUAN_FRONTEND_URL=http://127.0.0.1:4321` (or your local Astro port), then verify:

**Go origin legacy behavior:**
- `GET http://<go-host>:<go-port>/master.html` → 404
- `GET http://<go-host>:<go-port>/admin.html` → 404
- `GET http://<go-host>:<go-port>/<slug>` → 308 to `http://127.0.0.1:4321/<slug>`
- `GET http://<go-host>:<go-port>/assets/...` → 308 to `http://127.0.0.1:4321/assets/...`
- `GET http://<go-host>:<go-port>/favicon.ico` → 308 to `http://127.0.0.1:4321/favicon.ico`
- `GET http://<go-host>:<go-port>/some/random/deep/link` → 308 to `http://127.0.0.1:4321/some/random/deep/link` (and NOT 200 legacy HTML)

**Astro origin smoke:**
- `GET http://127.0.0.1:4321/master` → 200 HTML
- `GET http://127.0.0.1:4321/<slug>` → 200 HTML
- `GET http://127.0.0.1:4321/<slug>/order-view/<order_no>` (or your chosen deep link) → 200 HTML

**Proxy-only runtime check:**
Open devtools Network on the Astro origin and confirm browser requests are same-origin `/api/**` (no direct requests to Go origin), including SSE/EventSource connections.

If you want quick terminal verification of Go behavior (replace host/port):

```bash
curl -i "http://127.0.0.1:8080/master.html"
curl -i "http://127.0.0.1:8080/admin.html"
curl -i "http://127.0.0.1:8080/test-shop?x=1"
curl -i "http://127.0.0.1:8080/assets/foo.js"
curl -i "http://127.0.0.1:8080/favicon.ico"
curl -i "http://127.0.0.1:8080/api/does-not-exist"
```

---

## Plan complete

Plan complete and saved to `docs/superpowers/plans/2026-03-13-go-minimalize-migrate-to-astro.md`. Ready to execute?
