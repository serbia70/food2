# Admin Click Delegation + Menu Image Fix Implementation Plan

> 状态说明（历史计划）：这份计划记录的是 admin 点击委托和菜单图片修复时的实施步骤，文中的 `历史红灯预期：` 属于当时的红灯预期，不应再被直接理解为当前代码状态。
> 若继续处理 admin 事件委托或图片路径归一化，请先以当前组件、脚本与测试为准。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify admin click handling via `data-admin-action`, remove iOS12-incompatible DOM APIs, and normalize menu image URLs so admin buttons work on mobile and menu images display correctly.

**Architecture:** Convert inline `onclick` handlers to centralized click delegation in `src/scripts/admin/click-delegation.ts`, replace `replaceChildren` with safe DOM clearing/append, and normalize image URLs in `src/pages/[slug]/index.astro`. Add lightweight node tests that fail until these changes are in place.

**Tech Stack:** Astro, TypeScript, node:test, simple file-content tests in `scripts/`.

---

## File Structure & Responsibilities

**Create (tests):**
- `scripts/check-admin-no-inline-onclick.test.mjs` — fail if admin components contain `onclick=`.
- `scripts/check-menu-image-url-normalization.test.mjs` — fail if the shop page lacks menu image URL normalization.

**Modify (admin delegation + iOS12):**
- `src/components/admin/TabCustomers.astro` — remove `onclick`, add `data-admin-action`, replace `replaceChildren`.
- `src/components/admin/TabMarketing.astro` — remove `onclick`, add `data-admin-action`, replace `replaceChildren`.
- `src/components/admin/TabReservations.astro` — remove `onclick`, rely on `data-admin-action`.
- `src/components/admin/AdminModals.astro` — remove `onclick`, add `data-admin-action`.
- `src/scripts/admin/click-delegation.ts` — add new action branches and input delegation.

**Modify (menu image URL):**
- `src/pages/[slug]/index.astro` — normalize `p.img` using `API_BASE_URL` when relative.

---

## Chunk 1: Add failing tests

### Task 1: Admin inline onclick guard

**Files:**
- Create: `scripts/check-admin-no-inline-onclick.test.mjs`

- [ ] **Step 1: Write failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '..');
const ADMIN_ROOT = join(REPO_ROOT, 'src', 'components', 'admin');
const ONCLICK_REGEX = /\bonclick\s*=/i;

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(abs)));
    } else if (entry.isFile()) {
      files.push(abs);
    }
  }
  return files;
}

function toPosix(p) {
  return p.replaceAll('\\\\', '/');
}

test('admin components should not use inline onclick', async () => {
  const files = await walkFiles(ADMIN_ROOT);
  const hits = [];
  for (const abs of files) {
    const rel = toPosix(relative(REPO_ROOT, abs));
    const content = await readFile(abs, 'utf8');
    if (ONCLICK_REGEX.test(content)) hits.push(rel);
  }
  assert.equal(hits.length, 0, `Found inline onclick in:\n${hits.join('\n')}`);
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `node --test scripts/check-admin-no-inline-onclick.test.mjs`
历史红灯预期： with list of admin files containing `onclick=`.

---

### Task 2: Menu image URL normalization guard

**Files:**
- Create: `scripts/check-menu-image-url-normalization.test.mjs`

- [ ] **Step 1: Write failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const PAGE = join(REPO_ROOT, 'src', 'pages', '[slug]', 'index.astro');

test('menu images should be normalized with API_BASE_URL when relative', async () => {
  const content = await readFile(PAGE, 'utf8');
  assert.match(content, /normalizeMenuImageUrl/);
  assert.match(content, /API_BASE_URL/);
  assert.match(content, /img:\s*normalizeMenuImageUrl\(/);
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `node --test scripts/check-menu-image-url-normalization.test.mjs`
历史红灯预期： because `normalizeMenuImageUrl` is not yet present.

---

## Chunk 2: Admin click delegation + iOS12 DOM compatibility

### Task 3: Convert inline onclick to delegation and remove replaceChildren

**Files:**
- Modify: `src/components/admin/TabCustomers.astro`
- Modify: `src/components/admin/TabMarketing.astro`
- Modify: `src/components/admin/TabReservations.astro`
- Modify: `src/components/admin/AdminModals.astro`
- Modify: `src/scripts/admin/click-delegation.ts`

- [ ] **Step 1: Update admin components to use data-admin-action**

Examples (use consistent naming):
- `openAddCustomerModal` → `data-admin-action="open-add-customer"`
- `closeAddCustomerModal` → `data-admin-action="close-add-customer"`
- `exportCustomers` → `data-admin-action="export-customers"`
- `giftPoints` → `data-admin-action="gift-points"`
- `setCustomerVIP` → `data-admin-action="set-customer-vip"`
- `openPromotionModal` → `data-admin-action="open-promotion"`
- `closePromotionModal` → `data-admin-action="close-promotion"`
- `savePointsSettings` → `data-admin-action="save-points-settings"`
- `confirmCheckin` → `data-admin-action="confirm-checkin"`
- `closeCheckinModal` → `data-admin-action="close-checkin"`
- `setReservationDateFilter('today|7days|all')` → keep `data-admin-action="reservation-filter"` and rely on `data-mode` only; remove onclick.

Also update the customer search input:
- Replace `oninput="filterCustomers(this.value)"` with `data-admin-action="filter-customers"` and let input delegation handle it.

- [ ] **Step 2: Add input delegation in click-delegation**

Add an input listener (in addition to existing click listener):

```ts
  document.addEventListener('input', (e: any) => {
    const el = e.target.closest('[data-admin-action]');
    if (!el) return;
    const action = el.dataset.adminAction;
    if (action === 'filter-customers') {
      const value = (el as HTMLInputElement).value;
      (window as any).filterCustomers?.(value);
    }
  });
```

Add new click actions in the existing click chain, mapping to globals:

```ts
else if (action === 'open-add-customer') (window as any).openAddCustomerModal?.();
else if (action === 'close-add-customer') (window as any).closeAddCustomerModal?.();
else if (action === 'export-customers') (window as any).exportCustomers?.();
else if (action === 'gift-points') (window as any).giftPoints?.();
else if (action === 'set-customer-vip') (window as any).setCustomerVIP?.();
else if (action === 'open-promotion') (window as any).openPromotionModal?.();
else if (action === 'close-promotion') (window as any).closePromotionModal?.();
else if (action === 'save-points-settings') (window as any).savePointsSettings?.();
else if (action === 'confirm-checkin') (window as any).confirmCheckin?.();
else if (action === 'close-checkin') (window as any).closeCheckinModal?.();
else if (action === 'reservation-filter') (window as any).setReservationDateFilter?.(val || '');
```

- [ ] **Step 3: Replace replaceChildren with safe clear + append**

In `TabCustomers.astro` and `TabMarketing.astro`, add a local helper:

```js
  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
```

Then replace:
- `container.replaceChildren(node)` → `clearChildren(container); container.appendChild(node);`
- `container.replaceChildren(...nodes)` → `clearChildren(container); nodes.forEach((n) => container.appendChild(n));`

- [ ] **Step 4: Run admin test to confirm pass**

Run: `node --test scripts/check-admin-no-inline-onclick.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit (only if user requests)**

```bash
git add src/components/admin/TabCustomers.astro src/components/admin/TabMarketing.astro src/components/admin/TabReservations.astro src/components/admin/AdminModals.astro src/scripts/admin/click-delegation.ts scripts/check-admin-no-inline-onclick.test.mjs
# git commit -m "fix: unify admin click delegation"
```

---

## Chunk 3: Menu image URL normalization

### Task 4: Normalize menu image URLs

**Files:**
- Modify: `src/pages/[slug]/index.astro`
- Test: `scripts/check-menu-image-url-normalization.test.mjs`

- [ ] **Step 1: Add normalizeMenuImageUrl helper**

Add near the top of the page (server-side script section):

```ts
const normalizeMenuImageUrl = (raw: any): string => {
  if (typeof raw !== 'string' || raw.trim() === '') return raw;
  const img = raw.trim();
  if (img.startsWith('http://') || img.startsWith('https://')) return img;
  if (img.startsWith('/uploads/')) return `${API_BASE_URL}${img}`;
  return img;
};
```

Use it in the menu mapping:

```ts
img: normalizeMenuImageUrl(p?.img) || '/favicon.svg',
```

- [ ] **Step 2: Run image test**

Run: `node --test scripts/check-menu-image-url-normalization.test.mjs`
Expected: PASS.

- [ ] **Step 3: Run both tests together**

Run:
```
node --test scripts/check-admin-no-inline-onclick.test.mjs
node --test scripts/check-menu-image-url-normalization.test.mjs
```
Expected: PASS.

- [ ] **Step 4: Commit (only if user requests)**

```bash
git add src/pages/[slug]/index.astro scripts/check-menu-image-url-normalization.test.mjs
# git commit -m "fix: normalize menu image urls"
```

---

## Manual Verification (post-change)
- iOS12 device: `/admin/<slug>` → 客户/营销/预约按钮可点击。
- `/[slug]`：菜单图片显示（非文本模式）。
