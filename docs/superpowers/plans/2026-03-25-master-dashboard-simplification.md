# Master Dashboard Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 master 后台页面收口为清晰的入口层，引入统一 dashboard view-model，减少 page / component / lib 的耦合，并在不改后端/BFF 的前提下降低后续修改成本。

**Architecture:** 现有 `src/pages/master/index.astro` 保留鉴权、初始化请求与装配职责，把 totals、CTA/notice、shop/settings 展示数据聚合统一迁移到新的 `src/lib/master-dashboard-view.ts`。`master-shop-view.ts` 与 `master-settings-view.ts` 继续分别负责单店与全局设置展示模型，组件只消费 typed view-model，不再直接依赖原始 shop/settings。

**Tech Stack:** Astro, TypeScript, Node.js built-in test runner (`node:test`), existing master view/payload helpers

---

## File Map

### Create
- `src/lib/master-dashboard-view.ts` — 统一构建 master 页面需要的 dashboard view-model，输出 `pageState`、`overview`、`shopManagement`、`settings`、`notices`、`actions`、`panels`
- `src/lib/master-dashboard-view.test.ts` — 锁定 dashboard builder 的聚合逻辑、页面状态分支与组件输入边界

### Modify
- `src/pages/master/index.astro` — 从“大总管”收缩为入口装配层，仅保留鉴权、init fetch、activeTab 归一化、builder 调用与组件装配
- `src/lib/master-shop-view.ts` — 如有必要，仅移除不属于单店展示模型的页面级决策残留；保留单店状态/渠道/排序/标签构建
- `src/lib/master-settings-view.ts` — 如有必要，仅移除不属于 settings 展示模型的页面级决策残留；保留全局设置归一化
- `src/components/master/MasterShopManagementTable.astro` — 改为只消费 dashboard/shop view-model，不继续读取原始实体或页面临时拼装字段
- `src/pages/master/master-billing-ui.test.ts` — 更新源码级断言，锁定 page 入口职责与新 builder 接线

### Verify unchanged
- `src/lib/master-shop-edit-payload.test.ts` — 提交层回归必须继续通过
- `src/lib/master-pricing-settings-payload.test.ts` — 提交层回归必须继续通过
- `src/lib/master-shop-view.test.ts` — 单店展示模型回归
- `src/lib/master-settings-view.test.ts` — 全局设置展示模型回归

### References
- Spec: `docs/superpowers/specs/2026-03-25-master-dashboard-simplification-design.md`
- Existing source tests: `src/pages/master/master-billing-ui.test.ts`
- Existing view builders: `src/lib/master-shop-view.ts`, `src/lib/master-settings-view.ts`

---

### Task 1: Lock the new dashboard builder contract with tests

**Files:**
- Create: `src/lib/master-dashboard-view.test.ts`
- Reference: `docs/superpowers/specs/2026-03-25-master-dashboard-simplification-design.md`
- Reference: `src/lib/master-shop-view.test.ts`
- Reference: `src/lib/master-settings-view.test.ts`

- [ ] **Step 1: Write the failing test for ready state aggregation**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterDashboardView } from './master-dashboard-view.ts';

test('buildMasterDashboardView aggregates overview and typed child views in ready state', () => {
  const view = buildMasterDashboardView({
    shops: [
      { id: 1, name: 'A 店', slug: 'a', today_revenue: 100, today_order_count: 2, billing_balance_rsd: 30 },
      { id: 2, name: 'B 店', slug: 'b', today_revenue: 250, today_order_count: 5, billing_balance_rsd: 70 },
    ],
    settings: {},
    activeTab: 'shops',
    isUnauthorized: false,
    loadError: '',
  });

  assert.equal(view.pageState.kind, 'ready');
  assert.equal(view.overview.todayRevenue, 350);
  assert.equal(view.overview.todayOrders, 7);
  assert.equal(view.overview.totalBalance, 100);
  assert.equal(view.shopManagement.activeTab, 'shops');
  assert.ok(Array.isArray(view.shopManagement.shops));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-dashboard-view.test.ts`
Expected: FAIL with missing module or missing export for `buildMasterDashboardView`

- [ ] **Step 3: Write the failing tests for non-ready page states and input boundaries**

```ts
test('buildMasterDashboardView returns unauthorized page state with actions', () => {
  const view = buildMasterDashboardView({
    shops: [],
    settings: {},
    activeTab: 'overview',
    isUnauthorized: true,
    loadError: '加载失败 (401)',
  });

  assert.equal(view.pageState.kind, 'unauthorized');
  assert.deepEqual(
    view.pageState.actions.map((item) => item.key),
    ['login', 'logout', 'refresh'],
  );
});

test('buildMasterDashboardView exposes typed child models instead of raw shop/settings payloads', () => {
  const view = buildMasterDashboardView({
    shops: [{ id: 9, name: 'Typed Shop', slug: 'typed-shop' }],
    settings: { mqtt_broker: 'mqtt.example.com' },
    activeTab: 'settings',
    isUnauthorized: false,
    loadError: '',
  });

  assert.equal('today_revenue' in view.shopManagement.shops[0], false);
  assert.equal('mqtt_broker' in view.settings, false);
  assert.equal(view.settings.server.mqttBroker, 'mqtt.example.com');
});
```

- [ ] **Step 4: Run tests to verify they fail for the intended reason**

Run: `node --test src/lib/master-dashboard-view.test.ts`
Expected: FAIL because builder behavior does not exist yet

- [ ] **Step 5: Commit test scaffold**

```bash
git add src/lib/master-dashboard-view.test.ts
git commit -m "test: lock master dashboard view contract"
```

---

### Task 2: Implement the dashboard builder

**Files:**
- Create: `src/lib/master-dashboard-view.ts`
- Modify: `src/lib/master-shop-view.ts`
- Modify: `src/lib/master-settings-view.ts`
- Test: `src/lib/master-dashboard-view.test.ts`
- Test: `src/lib/master-shop-view.test.ts`
- Test: `src/lib/master-settings-view.test.ts`

- [ ] **Step 1: Implement the minimal typed builder shell**

```ts
import { buildMasterSettingsView, type MasterSettingsView } from './master-settings-view.ts';
import { buildMasterShopView, type MasterShopView } from './master-shop-view.ts';

export type MasterDashboardBuildInput = {
  shops: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  activeTab: 'overview' | 'shops' | 'settings' | 'backup';
  isUnauthorized: boolean;
  loadError: string;
};

export type MasterDashboardAction =
  | { key: 'login'; kind: 'link'; label: string; href: string; className: string }
  | { key: 'logout' | 'refresh'; kind: 'button'; label: string; handler: 'logoutMaster' | 'reloadPage'; className: string };

export type MasterDashboardPageState =
  | { kind: 'ready' }
  | { kind: 'unauthorized'; message: string; actions: MasterDashboardAction[] }
  | { kind: 'load_error'; message: string; actions: MasterDashboardAction[] };

export type MasterDashboardView = {
  pageState: MasterDashboardPageState;
  overview: {
    totalShops: number;
    todayRevenue: number;
    todayOrders: number;
    monthCommission: number;
    totalBalance: number;
  };
  shopManagement: {
    shops: MasterShopView[];
    activeTab: 'overview' | 'shops' | 'settings' | 'backup';
  };
  settings: MasterSettingsView;
  notices: Array<{ kind: 'info' | 'warning' | 'error'; message: string }>;
  actions: MasterDashboardAction[];
  panels: {
    shopEdit: { defaultsFromSettings: boolean };
    shopTopup: Record<string, never>;
    shopDineIn: Record<string, never>;
  };
};

export function buildMasterDashboardView(input: MasterDashboardBuildInput): MasterDashboardView {
  throw new Error('not implemented');
}
```

Constraint: `buildMasterDashboardView()` only accepts already-normalized `activeTab`; do not move `normalizeMasterTab()` into the builder.

- [ ] **Step 2: Run dashboard builder tests and confirm the failure narrows to behavior**

Run: `node --test src/lib/master-dashboard-view.test.ts`
Expected: FAIL with assertions against `not implemented` or wrong output shape

- [ ] **Step 3: Implement ready/unauthorized/load_error branches and overview aggregation**

```ts
function buildOverview(shops: Array<Record<string, unknown>>) {
  return shops.reduce(
    (acc, shop) => {
      acc.totalShops += 1;
      acc.todayRevenue += Number(shop.today_revenue || 0);
      acc.todayOrders += Number(shop.today_order_count || 0);
      acc.monthCommission += Number(shop.commission_month_rsd || 0);
      acc.totalBalance += Number(shop.billing_balance_rsd || 0);
      return acc;
    },
    { totalShops: 0, todayRevenue: 0, todayOrders: 0, monthCommission: 0, totalBalance: 0 },
  );
}
```

Use `buildMasterSettingsView(settings)` and `buildMasterShopView(shop, { defaults: ... })` inside the ready path. Build discrete actions with `handler` values, not inline script strings.

- [ ] **Step 4: Run dashboard + existing view tests**

Run: `node --test src/lib/master-dashboard-view.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts`
Expected: PASS

- [ ] **Step 5: Commit builder implementation**

```bash
git add src/lib/master-dashboard-view.ts src/lib/master-dashboard-view.test.ts src/lib/master-shop-view.ts src/lib/master-settings-view.ts
git commit -m "feat: add master dashboard view builder"
```

---

### Task 3: Refactor `src/pages/master/index.astro` to consume the dashboard builder

**Files:**
- Modify: `src/pages/master/index.astro`
- Test: `src/pages/master/master-billing-ui.test.ts`
- Test: `src/lib/master-dashboard-view.test.ts`

- [ ] **Step 1: Write the failing source test for page entry responsibilities**

Add assertions to `src/pages/master/master-billing-ui.test.ts` that require the new builder import, require page-side tab normalization, and remove direct page-level view aggregation.

```ts
assert.match(page, /import \{ buildMasterDashboardView \} from '\.\.\/\.\.\/lib\/master-dashboard-view';/);
assert.match(page, /const activeTab = normalizeMasterTab\(Astro\.url\.searchParams\.get\('tab'\)\);/);
assert.match(page, /const dashboardView = buildMasterDashboardView\([\s\S]*activeTab,[\s\S]*\);/);
assert.doesNotMatch(page, /const totals = shops\.reduce\(/);
assert.doesNotMatch(page, /const settingsView = buildMasterSettingsView\(masterSettings\);/);
assert.doesNotMatch(page, /buildMasterShopView\(shop, \{/);
```

- [ ] **Step 2: Run the source test and verify it fails**

Run: `node --test src/pages/master/master-billing-ui.test.ts`
Expected: FAIL because page still imports/builds old pieces directly

- [ ] **Step 3: Replace page-level aggregation with dashboard builder wiring**

Implement the minimal page flow:

```astro
import { buildMasterDashboardView } from '../../lib/master-dashboard-view';

const dashboardView = buildMasterDashboardView({
  shops,
  settings: masterSettings,
  activeTab,
  isUnauthorized,
  loadError,
});
```

Then route component props from `dashboardView` instead of hand-built `settingsView`, `shopViews`, totals, CTA HTML sources.

- [ ] **Step 4: Run page source test and builder test together**

Run: `node --test src/pages/master/master-billing-ui.test.ts src/lib/master-dashboard-view.test.ts`
Expected: PASS

- [ ] **Step 5: Commit page refactor**

```bash
git add src/pages/master/index.astro src/pages/master/master-billing-ui.test.ts
git commit -m "refactor: route master page through dashboard view"
```

---

### Task 4: Tighten `MasterShopManagementTable` to consume stable view-model props only

**Files:**
- Modify: `src/components/master/MasterShopManagementTable.astro`
- Test: `src/pages/master/master-billing-ui.test.ts`
- Test: `src/lib/master-dashboard-view.test.ts`

- [ ] **Step 1: Write the failing source assertion for stable component consumption**

Add a source-level test asserting the table consumes typed `MasterShopView[]` input and does not introduce new raw payload access patterns.

```ts
assert.match(table, /MasterShopView\[\]/);
assert.doesNotMatch(table, /shop\?\.today_revenue/);
assert.doesNotMatch(table, /shop\?\.billing_balance_rsd/);
assert.doesNotMatch(table, /settings\./);
```

The goal is to lock the boundary, not to force an exact line-for-line component shape.

- [ ] **Step 2: Run the source test and confirm failure if raw dependencies remain**

Run: `node --test src/pages/master/master-billing-ui.test.ts`
Expected: FAIL only if table still depends on raw payload or the new assertions are not yet satisfied

- [ ] **Step 3: Trim the component to pure display concerns**

Keep only UI helpers like:

```astro
const fmt = (value: number) => Number(value || 0).toLocaleString('zh-CN');
```

Do not add shop/settings fallback logic to the component. If a needed display field is missing, add it to the builder layer instead.

- [ ] **Step 4: Re-run source and dashboard tests**

Run: `node --test src/pages/master/master-billing-ui.test.ts src/lib/master-dashboard-view.test.ts`
Expected: PASS

- [ ] **Step 5: Commit component cleanup**

```bash
git add src/components/master/MasterShopManagementTable.astro src/pages/master/master-billing-ui.test.ts
git commit -m "refactor: keep master shop table view-model driven"
```

---

### Task 5: Verify panel initialization handoff and payload compatibility

**Files:**
- Modify: `src/pages/master/master-billing-ui.test.ts`
- Verify: `src/lib/master-shop-edit-payload.test.ts`
- Verify: `src/lib/master-pricing-settings-payload.test.ts`
- Verify: `src/lib/master-dashboard-view.test.ts`

- [ ] **Step 1: Add a failing source-level regression test for panel handoff**

Add assertions that the page reads all touched panel defaults from `dashboardView.panels` rather than rebuilding scattered defaults locally.

```ts
assert.match(page, /dashboardView\.panels\.shopEdit/);
assert.match(page, /dashboardView\.panels\.shopTopup/);
assert.match(page, /dashboardView\.panels\.shopDineIn/);
assert.doesNotMatch(page, /const masterFeeDefaults = \{/);
```

- [ ] **Step 2: Run the page source test and verify it fails**

Run: `node --test src/pages/master/master-billing-ui.test.ts`
Expected: FAIL because the page still builds panel defaults locally

- [ ] **Step 3: Rewire panel default reads without changing payload contracts**

When implementing, ensure:
- shop edit / pricing form defaults come from `dashboardView.panels`
- topup / dine-in panel default reads also come from `dashboardView.panels`
- existing payload builder call sites stay on the same contract
- no backend/BFF request shape changes are introduced

- [ ] **Step 4: Add a page-side payload regression assertion**

Extend `src/pages/master/master-billing-ui.test.ts` with source-level request-shape assertions around the page submit path so that the page still passes `Object.fromEntries(formData.entries())` and the same options/default contract into existing payload builders.

```ts
assert.match(page, /buildMasterShopEditPayload\(Object\.fromEntries\(formData\.entries\(\)\),\s*\{\s*defaults:/s);
assert.match(page, /buildMasterPricingSettingsPayload\(Object\.fromEntries\(formData\.entries\(\)\)\)/);
```

- [ ] **Step 5: Run payload compatibility regressions**

Run: `node --test src/lib/master-shop-edit-payload.test.ts src/lib/master-pricing-settings-payload.test.ts src/pages/master/master-billing-ui.test.ts`
Expected: PASS

- [ ] **Step 6: Add an activeTab behavior regression test**

Add a focused builder test that proves the builder only handles legal tab values and assumes page-side normalization already happened.

```ts
test('buildMasterDashboardView preserves normalized activeTab values', () => {
  const view = buildMasterDashboardView({
    shops: [],
    settings: {},
    activeTab: 'overview',
    isUnauthorized: false,
    loadError: '',
  });

  assert.equal(view.shopManagement.activeTab, 'overview');
});
```

Do not add a builder test for raw invalid tab strings; that belongs to page-side normalization responsibility.

- [ ] **Step 7: Commit panel handoff verification**

```bash
git add src/pages/master/master-billing-ui.test.ts src/pages/master/index.astro src/lib/master-dashboard-view.test.ts
git commit -m "test: lock master panel defaults to dashboard view"
```

---

### Task 6: Verify that payload builders and existing master view tests still hold

**Files:**
- Verify: `src/lib/master-shop-edit-payload.test.ts`
- Verify: `src/lib/master-pricing-settings-payload.test.ts`
- Verify: `src/lib/master-shop-view.test.ts`
- Verify: `src/lib/master-settings-view.test.ts`
- Verify: `src/lib/master-dashboard-view.test.ts`
- Verify: `src/pages/master/master-billing-ui.test.ts`

- [ ] **Step 1: Run payload builder regression tests**

Run: `node --test src/lib/master-shop-edit-payload.test.ts src/lib/master-pricing-settings-payload.test.ts`
Expected: PASS

- [ ] **Step 2: Run all master view-related tests**

Run: `node --test src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-dashboard-view.test.ts src/pages/master/master-billing-ui.test.ts`
Expected: PASS

- [ ] **Step 3: Run the focused security-safe master regression batch**

Run: `pnpm exec node --test src/lib/master-shop-edit-payload.test.ts src/lib/master-pricing-settings-payload.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-dashboard-view.test.ts src/pages/master/master-billing-ui.test.ts`
Expected: PASS with no failing tests

- [ ] **Step 4: Inspect git diff for scope control**

Run: `git diff -- src/pages/master/index.astro src/lib/master-dashboard-view.ts src/lib/master-dashboard-view.test.ts src/lib/master-shop-view.ts src/lib/master-settings-view.ts src/components/master/MasterShopManagementTable.astro src/pages/master/master-billing-ui.test.ts`
Expected: Diff is limited to master page entry wiring, dashboard builder, and view-model cleanup only

- [ ] **Step 5: Commit final verification pass**

```bash
git add src/pages/master/index.astro src/lib/master-dashboard-view.ts src/lib/master-dashboard-view.test.ts src/lib/master-shop-view.ts src/lib/master-settings-view.ts src/components/master/MasterShopManagementTable.astro src/pages/master/master-billing-ui.test.ts
git commit -m "refactor: simplify master dashboard structure"
```

---

## Notes for the implementing agent

- Do **not** change `src/pages/api/**`.
- Do **not** move business rules into components to “make tests pass faster”.
- If page wiring requires handler execution, use a fixed handler map for `'logoutMaster' | 'reloadPage'`; do not regress to arbitrary inline script strings in builder output.
- If a panel still needs page-owned local state, keep that state minimal and derived from `dashboardView.panels`, not from scattered raw variables.
- If `master-shop-view.ts` or `master-settings-view.ts` already satisfy the spec boundary, keep their implementation changes minimal; unnecessary churn is not a goal.
- Prefer the smallest code change that makes the new tests pass.

## Definition of Done

- `src/pages/master/index.astro` no longer computes totals or directly builds `shopViews/settingsView`.
- `src/pages/master/index.astro` continues to normalize `activeTab` before calling the dashboard builder.
- `src/lib/master-dashboard-view.ts` exists and is fully covered by focused tests.
- `buildMasterDashboardView()` uses explicit input/output types and does not absorb `normalizeMasterTab()` responsibility.
- `MasterShopManagementTable.astro` remains a pure display component over typed view-model input.
- Panel defaults are read from `dashboardView.panels`, while payload builder contracts remain unchanged.
- Existing payload builder regressions still pass unchanged.
- `src/pages/master/index.astro` does not gain new page-level style/script aggregation during this refactor.
- No backend/BFF file changes are required.
