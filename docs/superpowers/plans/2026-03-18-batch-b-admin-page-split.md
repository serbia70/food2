# Batch B (Admin Page Split) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/pages/admin/[slug]/index.astro` into focused, tested library utilities while preserving admin behavior (routes, redirects, render output semantics) and keeping the repo secure, simple, and maintainable.

**Architecture:**
- Move the *pure helper logic* currently embedded in `src/pages/admin/[slug]/index.astro` into a dedicated lib module under `src/lib/`.
- Keep `index.astro` responsible only for: auth gate (cookie presence + backend status checks), upstream data fetch orchestration, calling the extracted helpers, and rendering existing admin components.
- Add node:test unit tests that lock the extracted helper behavior. Avoid refactors that change runtime semantics.

**Tech Stack:** Astro (Cloudflare adapter, `output: "server"`), TypeScript, node:test, pnpm.

---

## Scope / non-goals

**In scope (Batch B only):**
- Extract helper functions from `src/pages/admin/[slug]/index.astro`:
  - JSON parsing/normalization helpers
  - DB date parsing/formatting helpers
  - table config resolution + table card building
  - (optional) the local `fetchJSON()` wrapper *only if* we can lock its behavior with tests without requiring real network calls

**Out of scope (explicitly NOT doing in this batch):**
- Any UI redesign, CSS rework, or changing admin tab components
- Any API route changes (Batch A already did route boundary unification)
- Any behavior changes to admin redirects, cookie keys, request header semantics, or status codes

---

## Known current state (evidence)

The following helpers exist only inside the admin page and are not shared elsewhere:
- `src/pages/admin/[slug]/index.astro:40-269` defines:
  - `fetchJSON()`
  - `asObject()`
  - `parseMaybeJSON()`
  - `normalizeJSONString()`
  - `parseDBDateMs()`
  - `formatHHmm()`
  - `resolveTableConfig()`
  - `buildTableCards()` (+ local helpers used by it)

`src/lib/table-config.ts` already contains table label/prefix logic and should remain the single source of truth for:
- `buildTableValue()`, `isHallLikeZoneName()`, `isPlaceholderZoneName()`, `isSimpleHallMode()`

---

## Files to change / create

**Modify:**
- `src/pages/admin/[slug]/index.astro`

**Create:**
- `src/lib/admin-dashboard-utils.ts`
- `src/lib/admin-dashboard-utils.test.ts`

*(Optional, only if it helps and is low-risk)*
- `src/lib/admin-fetch-json.ts`
- `src/lib/admin-fetch-json.test.ts`

---

## Guardrails (must preserve)

- Keep all existing admin page routes and redirects identical.
  - Cookie key remains `admin_token`.
  - Missing token should still redirect to `/admin/<slug>/login` with the original query string.
- Keep upstream fetch semantics consistent:
  - `cache: 'no-store'`
  - request headers include `Cache-Control: no-cache` and `Pragma: no-cache` where currently applied
- Do not introduce Node-only APIs into runtime code.
- Do not change output JSON payloads embedded into the page (`cities-data`, `table-config-data`, `categories-data`, `products-data`).

## Stop conditions (from spec)

Stop and re-align before proceeding if any of these happen:
- This batch needs changes across **10+ files** and we cannot clearly justify why they must change together.
- `pnpm -s build` or `pnpm -s run test:security` fails, and we can’t fix it within **2 attempts** inside this batch.
- Preserving behavior would require a product/backend contract decision, or changing Cloudflare environment variable semantics.

---

## Task 1: Create `admin-dashboard-utils` with tests (TDD)

**Files:**
- Create: `src/lib/admin-dashboard-utils.ts`
- Test: `src/lib/admin-dashboard-utils.test.ts`

### Step 1.1: Write failing tests for JSON helpers

- [ ] **Step 1.1.1: Create initial test file scaffold**

Create `src/lib/admin-dashboard-utils.test.ts` using node:test:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  asObject,
  parseMaybeJSON,
  normalizeJSONString,
} from './admin-dashboard-utils.ts';

test('asObject: returns {} for non-object values', () => {
  assert.deepEqual(asObject(null), {});
  assert.deepEqual(asObject(undefined), {});
  assert.deepEqual(asObject(1), {});
  assert.deepEqual(asObject('x'), {});
  assert.deepEqual(asObject([1, 2]), {});
});

test('asObject: returns the same object for plain object', () => {
  const o = { a: 1 };
  assert.equal(asObject(o), o);
});

test('parseMaybeJSON: passes through non-string', () => {
  assert.equal(parseMaybeJSON(1 as any), 1);
  assert.deepEqual(parseMaybeJSON({ a: 1 } as any), { a: 1 });
});

test('parseMaybeJSON: trims and parses JSON strings; empty string -> null; invalid -> null', () => {
  assert.deepEqual(parseMaybeJSON(' {"a":1} '), { a: 1 });
  assert.equal(parseMaybeJSON('   '), null);
  assert.equal(parseMaybeJSON('not-json'), null);
});

test('normalizeJSONString: nullish -> fallback', () => {
  assert.equal(normalizeJSONString(null as any, '[]'), '[]');
  assert.equal(normalizeJSONString(undefined as any, '{}'), '{}');
});

test('normalizeJSONString: string JSON -> canonical JSON.stringify(parsed)', () => {
  assert.equal(normalizeJSONString(' {"a":1} ', '{}'), '{"a":1}');
});

test('normalizeJSONString: invalid string -> fallback', () => {
  assert.equal(normalizeJSONString('oops', '[]'), '[]');
});

test('normalizeJSONString: object -> JSON.stringify(object); stringify error -> fallback', () => {
  assert.equal(normalizeJSONString({ a: 1 }, '{}'), '{"a":1}');
  const cyclic: any = {};
  cyclic.self = cyclic;
  assert.equal(normalizeJSONString(cyclic, '{}'), '{}');
});
```

- [ ] **Step 1.1.2: Run tests (should FAIL because module does not exist yet)**

Run:
- `node --test src/lib/admin-dashboard-utils.test.ts`

Expected:
- FAIL with module import / missing exports.

### Step 1.2: Implement minimal JSON helpers

- [ ] **Step 1.2.1: Create `src/lib/admin-dashboard-utils.ts` with only the tested exports**

Implement as a minimal port from `src/pages/admin/[slug]/index.astro`:

```ts
export function asObject(v: any): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export function parseMaybeJSON(v: any): any {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function normalizeJSONString(v: any, fallback: string): string {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return fallback;
    try {
      return JSON.stringify(JSON.parse(t));
    } catch {
      return fallback;
    }
  }
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 1.2.2: Run tests (should PASS)**

Run:
- `node --test src/lib/admin-dashboard-utils.test.ts`

Expected:
- PASS.

### Step 1.3: Write failing tests for date parsing/formatting

- [ ] **Step 1.3.1: Add tests for `parseDBDateMs` and `formatHHmm`**

Append to `src/lib/admin-dashboard-utils.test.ts`:

```ts
import { parseDBDateMs, formatHHmm } from './admin-dashboard-utils.ts';

test('parseDBDateMs: empty -> 0', () => {
  assert.equal(parseDBDateMs(null as any), 0);
  assert.equal(parseDBDateMs(''), 0);
  assert.equal(parseDBDateMs('   '), 0);
});

test('parseDBDateMs: parses db date with space separator by converting to ISO', () => {
  const ms = parseDBDateMs('2026-03-18 10:11:12');
  assert.ok(ms > 0);
});

test('formatHHmm: empty -> --:--', () => {
  assert.equal(formatHHmm(''), '--:--');
});

test('formatHHmm: formats to HH:mm in Europe/Belgrade (sr-RS)', () => {
  const v = '2026-03-18 10:11:12';
  const out = formatHHmm(v);
  assert.match(out, /^\d{2}:\d{2}$/);
});
```

- [ ] **Step 1.3.2: Run tests (should FAIL until implemented)**

Run:
- `node --test src/lib/admin-dashboard-utils.test.ts`

Expected:
- FAIL due to missing exports.

### Step 1.4: Implement date helpers

- [ ] **Step 1.4.1: Port `parseDBDateMs` + `formatHHmm` exactly**

Add to `src/lib/admin-dashboard-utils.ts`:

```ts
export function parseDBDateMs(v: any): number {
  if (!v) return 0;
  const raw = String(v).trim();
  if (!raw) return 0;
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d1 = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (!Number.isNaN(d1.getTime())) return d1.getTime();
  const d2 = new Date(iso);
  if (!Number.isNaN(d2.getTime())) return d2.getTime();
  return 0;
}

export function formatHHmm(v: any): string {
  const ms = parseDBDateMs(v);
  if (!ms) return '--:--';
  return new Intl.DateTimeFormat('sr-RS', {
    timeZone: 'Europe/Belgrade',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}
```

- [ ] **Step 1.4.2: Run tests (should PASS)**

Run:
- `node --test src/lib/admin-dashboard-utils.test.ts`

Expected:
- PASS.

### Step 1.5: Table config + table card helpers (TDD)

**Note:** These functions touch the most domain logic. Keep them as a direct port; do not “clean up” logic in this batch.

- [ ] **Step 1.5.1: Add failing tests for `resolveTableConfig`**

Add tests that cover:
- reading candidates from `shop.table_config` (string JSON), `settings.table_config`, `settings.tables`
- normalization: `count` clamps to 1..300; trims strings
- default fallback when no config: `[{ name: '大厅', prefix: '', count: 12 }]`
- single-zone prefix cleanup rules (placeholder/hall-like)

Concrete tests (explicit assertions; do not “refine later”):

```ts
import { resolveTableConfig } from './admin-dashboard-utils.ts';

test('resolveTableConfig: uses shop.table_config JSON zones when present (single hall-like zone clears prefix)', () => {
  const shop = {
    table_config: JSON.stringify({ zones: [{ name: '大厅', prefix: '大厅', count: 3 }] }),
  };
  const out = resolveTableConfig(shop, {});
  assert.deepEqual(out, [{ name: '大厅', prefix: '', count: 3 }]);
});

test('resolveTableConfig: clamps count and trims strings', () => {
  const shop = {
    table_config: JSON.stringify([{ name: ' A ', prefix: ' B ', count: 999 }]),
  };
  const out = resolveTableConfig(shop, {});
  assert.deepEqual(out, [{ name: 'A', prefix: 'B', count: 300 }]);
});

test('resolveTableConfig: falls back to settings.tables array', () => {
  const settings = { tables: [{ name: 'Zone', prefix: 'Z', count: 2 }] };
  const out = resolveTableConfig({}, settings);
  assert.deepEqual(out, [{ name: 'Zone', prefix: 'Z', count: 2 }]);
});

test('resolveTableConfig: default fallback when no candidates', () => {
  const out = resolveTableConfig({}, {});
  assert.deepEqual(out, [{ name: '大厅', prefix: '', count: 12 }]);
});
```

- [ ] **Step 1.5.2: Run tests (should FAIL until implemented)**

Run:
- `node --test src/lib/admin-dashboard-utils.test.ts`

Expected:
- FAIL due to missing export.

- [ ] **Step 1.5.3: Implement `resolveTableConfig` by porting from `index.astro`**

Implementation should:
- reuse `parseMaybeJSON` internally
- call `isHallLikeZoneName` / `isPlaceholderZoneName` from `src/lib/table-config.ts` (do not duplicate regex)

- [ ] **Step 1.5.4: Add failing tests for `buildTableCards`**

Cover:
- filters dine-in, excludes completed/cancelled/archived/paid, excludes deleted
- matches orders to table by `parseTableRef` rules and legacy simple hall match via `inferLegacySimpleHallNumber`
- `latestActiveId` influences `isNew`

Because `isNew` depends on time, freeze time in test by temporarily stubbing `Date.now` **and always restore it** after the assertion to avoid cross-test contamination.

Concrete test (explicit and deterministic):

```ts
import { buildTableCards } from './admin-dashboard-utils.ts';

test('buildTableCards: filters active dine-in and marks newest as isNew', () => {
  const originalNow = Date.now;
  Date.now = () => 1_700_000_000_000;

  try {
    const tableConfig = [{ name: '大厅', prefix: '', count: 1 }];
    const orders = [
      {
        id: 1,
        order_type: 'dine_in',
        status: 'pending',
        is_deleted: 0,
        table_info: '1号桌',
        created_at: '2026-03-18 10:11:12',
        total_amount: 10,
      },
      {
        id: 2,
        order_type: 'delivery',
        status: 'pending',
        is_deleted: 0,
        table_info: '1号桌',
        created_at: '2026-03-18 10:11:30',
        total_amount: 20,
      },
    ];

    const cards = buildTableCards(orders as any[], tableConfig as any);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].hasOrder, true);
    assert.equal(cards[0].isNew, true);
  } finally {
    Date.now = originalNow;
  }
});
```


- [ ] **Step 1.5.5: Implement `buildTableCards` by direct port**

Keep imports:
- `buildTableValue`, `isSimpleHallMode`, `isPlaceholderZoneName`, `isHallLikeZoneName` from `src/lib/table-config.ts`
- `parseTableRef`, `inferLegacySimpleHallNumber`, `orderMatchesAnyConfiguredTable` from `src/lib/admin-table-ref.ts`

- [ ] **Step 1.5.6: Run tests (should PASS)**

Run:
- `node --test src/lib/admin-dashboard-utils.test.ts`

Expected:
- PASS.

### Step 1.6: Commit Task 1

- [ ] **Step 1.6.1: Verify working tree has only intended files**

Run:
- `git status -sb`

Expected:
- shows modifications only to: `src/lib/admin-dashboard-utils.ts` + `src/lib/admin-dashboard-utils.test.ts`

- [ ] **Step 1.6.2: Commit**

Stage & commit (example):

```bash
git add src/lib/admin-dashboard-utils.ts src/lib/admin-dashboard-utils.test.ts

git commit -m "refactor(admin): extract tested admin dashboard helpers"
```

---

## Task 2: Switch `admin/[slug]/index.astro` to use extracted helpers

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro`
- Uses: `src/lib/admin-dashboard-utils.ts`

### Step 2.1: Write a safety net test (optional but recommended)

Because `.astro` is not easily unit-tested with node:test, the safety net is:
- keep the extracted helper behavior locked (already done in Task 1)
- ensure build + security suite passes

### Step 2.2: Modify `index.astro` to import helpers

- [ ] **Step 2.2.1: Replace local helper definitions with imports**

At top of `src/pages/admin/[slug]/index.astro`, add:

```ts
import {
  asObject,
  parseMaybeJSON,
  normalizeJSONString,
  parseDBDateMs,
  formatHHmm,
  resolveTableConfig,
  buildTableCards,
} from '../../../lib/admin-dashboard-utils';
```

Then delete the corresponding local function definitions.

**Important:** keep `fetchJSON()` local for now unless we also extracted and tested it.

- [ ] **Step 2.2.2: Run build**

Run:
- `pnpm -s build`

Expected:
- PASS.

- [ ] **Step 2.2.3: Run unit test suite for the new helpers**

Run:
- `node --test src/lib/admin-dashboard-utils.test.ts`

Expected:
- PASS.

### Step 2.3: Commit Task 2

- [ ] **Step 2.3.1: Commit**

```bash
git add src/pages/admin/[slug]/index.astro

git commit -m "refactor(admin): use shared dashboard utils in admin page"
```

---

## Task 3: (Optional) Extract and test `fetchJSON` wrapper

**Rationale:** If we can lock it with deterministic tests (via stubbing `globalThis.fetch`), we can reduce page size further.

**Files:**
- Create: `src/lib/admin-fetch-json.ts`
- Test: `src/lib/admin-fetch-json.test.ts`
- Modify: `src/pages/admin/[slug]/index.astro`

### Steps

- [ ] Write failing tests that stub `globalThis.fetch` to return:
  - ok JSON body
  - non-JSON body
  - fetch throws

- [ ] Implement `fetchJSON(url, init)` returning `{ ok, status, data }` exactly as current page behavior.
- [ ] Switch page to import it.
- [ ] Verify build + tests.
- [ ] Commit.

---

## Batch B completion verification (hard gate)

After all tasks above are complete, run **fresh**:

- `pnpm -s build`
- `pnpm -s run test:security`
- `node --test src/lib/admin-dashboard-utils.test.ts`

Recommended additional checks (fast, keep confidence high):
- `node --test scripts/check-admin-api-routes-use-proxyAdminRequest.test.mjs`
- `node --test scripts/check-master-api-routes-use-proxyMasterRequest.test.mjs`

Expected:
- All PASS, 0 failures.

---

## Required manual smoke (spec gate)

> The automated gates (build + security tests) are necessary but **not sufficient** to claim “behavior unchanged”. Per spec, run this lightweight smoke after Batch B.

### User side (ordering core)
- Open a shop page: category/product list renders; images do not block interaction.
- Add to cart: add, adjust quantity, remove.
- Cart modal: open/close; checkout button clickable.
- Checkout flow: navigate to checkout page (success/failure both must not white-screen).
- User center: open; login/register entry usable; order history list can render.

### Reservation + chat
- Reservation entry visible and bilingual text preserved (“预订” + “Rezervacija”).
- Chat entry opens; MQTT may depend on environment, but UI and graceful degradation must work.

### Admin
- Visit `/admin/<slug>` without cookie: should redirect to `/admin/<slug>/login` preserving `Astro.url.search`.
- With cookie: page renders; switching tabs (Tables/Orders/Menu/Settings at least) does not break.

### Master
- Master entry page opens and main cards render (real data not required).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-18-batch-b-admin-page-split.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — Execute tasks in this session using executing-plans with checkpoints.

Which approach?