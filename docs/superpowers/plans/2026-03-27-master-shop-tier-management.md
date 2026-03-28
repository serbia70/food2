# Master Shop Tier Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clean shop tier system (`subscription` / `business`) with global default + per-shop override in master, and use the resolved tier to control admin feature visibility.

**Architecture:** Introduce a dedicated shop-tier resolver separate from billing and old legacy flags. Master global settings own the default tier, shop edit owns per-shop mode/override, and admin consumes one resolved feature view so marketing/VIP/advanced analytics visibility comes from a single source of truth.

**Tech Stack:** Astro, TypeScript, Preact-free server-rendered admin/master pages, existing `/api/master/settings` and master shop edit flows, Node test runner (`node --test`), pnpm.

---

## File Map

### New files
- `src/lib/shop-tier.ts` — canonical tier types, normalization helpers, resolver, feature flags
- `src/lib/shop-tier.test.ts` — resolver unit tests

### Modified files
- `src/lib/master-settings-view.ts` — expose global default shop tier in master settings view
- `src/lib/master-settings-view.test.ts` — test global tier parsing/defaults
- `src/lib/master-dashboard-view.ts` — thread global tier defaults into shop management + edit panel defaults
- `src/lib/master-shop-view.ts` — resolve effective shop tier for master list rows and edit panel data
- `src/lib/master-shop-view.test.ts` — test effective tier/source text in shop management view
- `src/components/master/MasterPricingSettingsCard.astro` — add global default tier selector
- `src/lib/master-pricing-settings-payload.ts` — include `default_shop_tier`
- `src/lib/master-pricing-settings-payload.test.ts` — test payload serialization for default tier
- `src/components/master/MasterShopEditPanel.astro` — add shop tier mode + override controls
- `src/lib/master-shop-edit-payload.ts` — include `shop_tier_mode` and `shop_tier_override`
- `src/lib/master-shop-edit-payload.test.ts` — test shop tier edit payload behavior
- `src/scripts/master/shop-panels.ts` — hydrate shop tier values into edit form when opening panel
- `src/components/master/MasterShopManagementTable.astro` — show effective tier + source in shop list
- `src/pages/master/index.astro` — ensure existing bindings receive updated shop/edit/settings view data
- `src/components/admin/AdminTabs.astro` — add explicit advanced analytics prop instead of overloading billing state
- `src/components/admin/TabRenew.astro` — switch upgrade copy/visibility to tier-based logic
- `src/pages/admin/[slug]/index.astro` — resolve effective tier from settings + shop and drive all gated tabs from feature flags
- `src/pages/admin/[slug]/billing-ui.test.ts` or a new dedicated admin tier UI test — verify admin tier gating in page source

### Existing files to inspect while implementing
- `src/lib/master-pricing-settings-payload.ts`
- `src/lib/master-shop-edit-payload.ts`
- `src/lib/master-dashboard-view.ts`
- `src/lib/master-settings-view.ts`
- `src/scripts/master/pricing-actions.ts`
- `src/scripts/master/shop-panels.ts`
- `src/pages/admin/[slug]/index.astro`
- `src/components/admin/AdminTabs.astro`
- `src/components/admin/TabRenew.astro`

---

### Task 1: Add the canonical shop tier resolver

**Files:**
- Create: `src/lib/shop-tier.ts`
- Test: `src/lib/shop-tier.test.ts`

- [ ] **Step 1: Write the failing test for default-tier resolution**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShopTier } from './shop-tier.ts';

test('resolveShopTier uses global default when shop mode is global', () => {
  const view = resolveShopTier({
    defaults: { defaultShopTier: 'business' },
    shop: { shop_tier_mode: 'global', shop_tier_override: '' },
  });

  assert.equal(view.effectiveTier, 'business');
  assert.equal(view.source, 'global');
  assert.equal(view.displayText, '商务版');
  assert.equal(view.sourceLabel, '来自全局');
  assert.equal(view.features.marketing, true);
  assert.equal(view.features.vip, true);
  assert.equal(view.features.advancedAnalytics, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/shop-tier.test.ts`
Expected: FAIL with `Cannot find module` or `resolveShopTier is not a function`

- [ ] **Step 3: Add the minimal resolver implementation**

```ts
export type ShopTier = 'subscription' | 'business';
export type ShopTierMode = 'global' | 'override';

export type ShopTierView = {
  effectiveTier: ShopTier;
  source: 'global' | 'override';
  displayText: '会员版' | '商务版';
  sourceLabel: '来自全局' | '店铺覆盖';
  features: {
    marketing: boolean;
    vip: boolean;
    advancedAnalytics: boolean;
  };
};

function normalizeTier(value: unknown, fallback: ShopTier = 'subscription'): ShopTier {
  return value === 'business' ? 'business' : fallback;
}

function normalizeMode(value: unknown): ShopTierMode {
  return value === 'override' ? 'override' : 'global';
}

export function resolveShopTier(input: {
  defaults?: { defaultShopTier?: unknown };
  shop?: { shop_tier_mode?: unknown; shop_tier_override?: unknown };
}): ShopTierView {
  const defaultTier = normalizeTier(input.defaults?.defaultShopTier, 'subscription');
  const mode = normalizeMode(input.shop?.shop_tier_mode);
  const overrideTier = normalizeTier(input.shop?.shop_tier_override, defaultTier);
  const effectiveTier = mode === 'override' ? overrideTier : defaultTier;
  const isBusiness = effectiveTier === 'business';

  return {
    effectiveTier,
    source: mode === 'override' ? 'override' : 'global',
    displayText: isBusiness ? '商务版' : '会员版',
    sourceLabel: mode === 'override' ? '店铺覆盖' : '来自全局',
    features: {
      marketing: isBusiness,
      vip: isBusiness,
      advancedAnalytics: isBusiness,
    },
  };
}
```

- [ ] **Step 4: Expand tests for override behavior and fallback safety**

```ts
test('resolveShopTier uses shop override when mode is override', () => {
  const view = resolveShopTier({
    defaults: { defaultShopTier: 'subscription' },
    shop: { shop_tier_mode: 'override', shop_tier_override: 'business' },
  });

  assert.equal(view.effectiveTier, 'business');
  assert.equal(view.source, 'override');
  assert.equal(view.features.marketing, true);
});

test('resolveShopTier falls back to subscription on invalid input', () => {
  const view = resolveShopTier({
    defaults: { defaultShopTier: 'weird' },
    shop: { shop_tier_mode: 'weird', shop_tier_override: 'vip' },
  });

  assert.equal(view.effectiveTier, 'subscription');
  assert.equal(view.source, 'global');
  assert.equal(view.features.marketing, false);
  assert.equal(view.features.vip, false);
  assert.equal(view.features.advancedAnalytics, false);
});
```

- [ ] **Step 5: Run the resolver tests**

Run: `node --test src/lib/shop-tier.test.ts`
Expected: PASS with all `resolveShopTier` cases green

- [ ] **Step 6: Commit**

```bash
git add src/lib/shop-tier.ts src/lib/shop-tier.test.ts
git commit -m "feat: add shop tier resolver"
```

---

### Task 2: Add global default tier to master settings

**Files:**
- Modify: `src/lib/master-settings-view.ts`
- Modify: `src/lib/master-settings-view.test.ts`
- Modify: `src/components/master/MasterPricingSettingsCard.astro`
- Modify: `src/lib/master-pricing-settings-payload.ts`
- Modify: `src/lib/master-pricing-settings-payload.test.ts`
- Modify: `src/scripts/master/pricing-actions.ts`

- [ ] **Step 1: Write the failing settings view test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterSettingsView } from './master-settings-view.ts';

test('buildMasterSettingsView exposes default shop tier', () => {
  const view = buildMasterSettingsView({ default_shop_tier: 'business' });

  assert.equal(view.defaultShopTier, 'business');
  assert.equal(view.defaultShopTierText, '商务版');
});
```

- [ ] **Step 2: Run the settings view test to verify it fails**

Run: `node --test src/lib/master-settings-view.test.ts`
Expected: FAIL with missing `defaultShopTier` assertions

- [ ] **Step 3: Extend `MasterSettingsView` to include default tier fields**

```ts
export type MasterSettingsView = {
  reservationPlan: OrderChannelFeePlan;
  deliveryPlan: OrderChannelFeePlan;
  defaultShopTier: 'subscription' | 'business';
  defaultShopTierText: '会员版' | '商务版';
  // ...existing fields...
};

function buildDefaultShopTier(settings: MasterSettingsInput): 'subscription' | 'business' {
  return settings?.default_shop_tier === 'business' ? 'business' : 'subscription';
}

const defaultShopTier = buildDefaultShopTier(settings);

return {
  reservationPlan,
  deliveryPlan,
  defaultShopTier,
  defaultShopTierText: defaultShopTier === 'business' ? '商务版' : '会员版',
  // ...existing return...
};
```

- [ ] **Step 4: Add the global tier selector to the pricing settings card**

```astro
<section class="plan-card">
  <div class="plan-card-head">
    <div>
      <div class="plan-card-title">店铺版本默认值</div>
      <div class="plan-card-subtitle">当前：{settings.defaultShopTierText}</div>
    </div>
  </div>
  <label>
    <span>默认版本</span>
    <select name="defaultShopTier">
      <option value="subscription" selected={settings.defaultShopTier === 'subscription'}>会员版</option>
      <option value="business" selected={settings.defaultShopTier === 'business'}>商务版</option>
    </select>
  </label>
</section>
```

- [ ] **Step 5: Write and implement payload serialization for the new field**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterPricingSettingsPayload } from './master-pricing-settings-payload.ts';

test('buildMasterPricingSettingsPayload includes default shop tier', () => {
  const payload = buildMasterPricingSettingsPayload({
    defaultShopTier: 'business',
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '3',
    deliveryEnabled: '1',
    deliveryCommissionType: 'percentage',
    deliveryCommissionValue: '5',
  });

  assert.equal(payload.default_shop_tier, 'business');
});
```

```ts
function toShopTier(value: unknown): 'subscription' | 'business' {
  return value === 'business' ? 'business' : 'subscription';
}

return {
  reservation_enabled: reservationEnabled ? 1 : 0,
  reservation_commission_type: reservationCommissionType,
  reservation_commission_value: reservationCommissionValue,
  delivery_enabled: deliveryEnabled ? 1 : 0,
  delivery_commission_type: deliveryCommissionType,
  delivery_commission_value: deliveryCommissionValue,
  default_shop_tier: toShopTier(input.defaultShopTier),
};
```

- [ ] **Step 6: Run the master settings tests**

Run: `node --test src/lib/master-settings-view.test.ts src/lib/master-pricing-settings-payload.test.ts`
Expected: PASS with default tier parsing + payload serialization green

- [ ] **Step 7: Commit**

```bash
git add src/lib/master-settings-view.ts src/lib/master-settings-view.test.ts src/components/master/MasterPricingSettingsCard.astro src/lib/master-pricing-settings-payload.ts src/lib/master-pricing-settings-payload.test.ts src/scripts/master/pricing-actions.ts
git commit -m "feat: add global default shop tier setting"
```

---

### Task 3: Thread effective tier into master dashboard and shop list

**Files:**
- Modify: `src/lib/master-dashboard-view.ts`
- Modify: `src/lib/master-shop-view.ts`
- Modify: `src/lib/master-shop-view.test.ts`
- Modify: `src/components/master/MasterShopManagementTable.astro`

- [ ] **Step 1: Write the failing master shop view test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterShopView } from './master-shop-view.ts';

test('buildMasterShopView exposes effective shop tier and source', () => {
  const view = buildMasterShopView(
    { id: 9, name: 'Demo', slug: 'demo', shop_tier_mode: 'override', shop_tier_override: 'business' },
    { defaults: { defaultShopTier: 'subscription' } },
  );

  assert.equal(view.shopTier.effectiveTier, 'business');
  assert.equal(view.shopTier.displayText, '商务版');
  assert.equal(view.shopTier.sourceLabel, '店铺覆盖');
});
```

- [ ] **Step 2: Run the shop view test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL because `shopTier` does not exist on the view

- [ ] **Step 3: Resolve tier inside `buildMasterShopView` and thread defaults from dashboard**

```ts
import { resolveShopTier } from './shop-tier.ts';

const shopTier = resolveShopTier({
  defaults: { defaultShopTier: options.defaults?.defaultShopTier },
  shop: {
    shop_tier_mode: shop.shop_tier_mode,
    shop_tier_override: shop.shop_tier_override,
  },
});

return {
  // ...existing fields...
  shopTier,
};
```

```ts
const shopManagementShops = input.shops.map((shop) =>
  buildMasterShopView(shop, {
    defaults: {
      defaultShopTier: settings.defaultShopTier,
      reservationPlan: settings.reservationPlan,
      deliveryPlan: settings.deliveryPlan,
    },
  }),
);
```

- [ ] **Step 4: Show the tier summary in the master shop table**

```astro
<div class="plan-summary-row">
  <span class="plan-summary-label">版本</span>
  <span class="plan-summary-value">{shop.shopTier.displayText}</span>
  <span class="plan-summary-source">{shop.shopTier.sourceLabel}</span>
</div>
```

- [ ] **Step 5: Run dashboard/shop view tests**

Run: `node --test src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts`
Expected: PASS with effective tier shown in view data

- [ ] **Step 6: Commit**

```bash
git add src/lib/master-dashboard-view.ts src/lib/master-shop-view.ts src/lib/master-shop-view.test.ts src/components/master/MasterShopManagementTable.astro
git commit -m "feat: show effective shop tier in master"
```

---

### Task 4: Add shop tier controls to the master edit panel

**Files:**
- Modify: `src/components/master/MasterShopEditPanel.astro`
- Modify: `src/lib/master-shop-edit-payload.ts`
- Modify: `src/lib/master-shop-edit-payload.test.ts`
- Modify: `src/scripts/master/shop-panels.ts`
- Modify: `src/pages/master/index.astro`

- [ ] **Step 1: Write the failing shop edit payload test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterShopEditPayload } from './master-shop-edit-payload.ts';

test('buildMasterShopEditPayload serializes shop tier mode and override', () => {
  const payload = buildMasterShopEditPayload({
    id: '7',
    name: 'Demo',
    slug: 'demo',
    status: 'active',
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '3',
    deliveryEnabled: '1',
    deliveryCommissionType: 'percentage',
    deliveryCommissionValue: '5',
    shopTierMode: 'override',
    shopTierOverride: 'business',
  });

  assert.equal(payload.shop_tier_mode, 'override');
  assert.equal(payload.shop_tier_override, 'business');
});
```

- [ ] **Step 2: Run the payload test to verify it fails**

Run: `node --test src/lib/master-shop-edit-payload.test.ts`
Expected: FAIL because tier fields are absent

- [ ] **Step 3: Add UI controls to the edit panel**

```astro
<div class="form-section-title">店铺版本</div>
<section class="fee-section">
  <div class="fee-section-head">
    <div class="fee-section-title">版本来源</div>
    <div class="fee-section-note">和预订 / 外卖一样，支持跟随全局或店铺覆盖</div>
  </div>
  <label>
    <span>版本模式</span>
    <select name="shopTierMode">
      <option value="global">跟随全局</option>
      <option value="override">店铺覆盖</option>
    </select>
  </label>
  <label>
    <span>覆盖版本</span>
    <select name="shopTierOverride">
      <option value="subscription">会员版</option>
      <option value="business">商务版</option>
    </select>
  </label>
  <div class="side-feedback" id="master-shop-tier-summary">当前版本由表单值解析</div>
</section>
```

- [ ] **Step 4: Serialize the new fields in `buildMasterShopEditPayload`**

```ts
function toShopTierMode(value: unknown): 'global' | 'override' {
  return value === 'override' ? 'override' : 'global';
}

function toShopTier(value: unknown): 'subscription' | 'business' {
  return value === 'business' ? 'business' : 'subscription';
}

const shopTierMode = toShopTierMode(input.shopTierMode);
const shopTierOverride = toShopTier(input.shopTierOverride);

return {
  // ...existing payload...
  shop_tier_mode: shopTierMode,
  shop_tier_override: shopTierMode === 'override' ? shopTierOverride : null,
};
```

- [ ] **Step 5: Hydrate panel defaults in `shop-panels.ts` when opening edit**

```ts
form.elements.namedItem('shopTierMode').value = String(shop.shopTierMode || 'global');
form.elements.namedItem('shopTierOverride').value = String(shop.shopTierOverride || shop.effectiveShopTier || 'subscription');
const summary = document.getElementById('master-shop-tier-summary');
if (summary) {
  summary.textContent = `当前：${shop.shopTierDisplayText || '会员版'} · ${shop.shopTierSourceLabel || '来自全局'}`;
}
```

- [ ] **Step 6: Run the edit payload and master UI tests**

Run: `node --test src/lib/master-shop-edit-payload.test.ts src/pages/master/master-billing-ui.test.ts`
Expected: PASS with tier fields present in payload and page wiring intact

- [ ] **Step 7: Commit**

```bash
git add src/components/master/MasterShopEditPanel.astro src/lib/master-shop-edit-payload.ts src/lib/master-shop-edit-payload.test.ts src/scripts/master/shop-panels.ts src/pages/master/index.astro
git commit -m "feat: add shop tier controls to master edit"
```

---

### Task 5: Switch admin feature gating to resolved tier flags

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro`
- Modify: `src/components/admin/AdminTabs.astro`
- Modify: `src/components/admin/TabRenew.astro`
- Modify: `src/pages/admin/[slug]/billing-ui.test.ts` (or create `src/pages/admin/[slug]/shop-tier-ui.test.ts`)

- [ ] **Step 1: Write the failing admin gating test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro'), 'utf8');

test('admin page uses resolved shop tier feature flags for gated tabs', () => {
  assert.match(page, /resolveShopTier/);
  assert.match(page, /showMarketingTab = shopTierView\.features\.marketing/);
  assert.match(page, /showCustomersTab = shopTierView\.features\.vip/);
  assert.match(page, /showAdvancedAnalyticsTab = shopTierView\.features\.advancedAnalytics/);
});
```

- [ ] **Step 2: Run the admin gating test to verify it fails**

Run: `node --test src/pages/admin/[slug]/billing-ui.test.ts`
Expected: FAIL because page still gates by `billingPlanType`

- [ ] **Step 3: Resolve tier in the admin page and replace billing-based gating**

```ts
import { resolveShopTier } from '../../../lib/shop-tier.ts';

const shopTierView = resolveShopTier({
  defaults: { defaultShopTier: settings.default_shop_tier },
  shop: {
    shop_tier_mode: rawShop?.shop_tier_mode,
    shop_tier_override: rawShop?.shop_tier_override,
  },
});

const showStatsTab = shopTierView.features.advancedAnalytics;
const showMarketingTab = shopTierView.features.marketing;
const showCustomersTab = shopTierView.features.vip;
```

- [ ] **Step 4: Make `AdminTabs` accept the explicit analytics prop**

```astro
---
const {
  showReservationTab = true,
  showStatsTab = false,
  showMarketingTab = false,
  showCustomersTab = false,
} = Astro.props;
---
```

Keep the tab rendering the same, but now `showStatsTab` must represent advanced analytics instead of billing status.

- [ ] **Step 5: Update `TabRenew` upgrade block to be tier-based**

```astro
---
const { shopTier = 'subscription' } = Astro.props;
const isSubscriptionTier = shopTier === 'subscription';
---

{isSubscriptionTier && (
  <div style="margin-top:20px; padding:15px; background:#eff6ff; border-radius:10px; text-align:left; border:1px solid #dbeafe;">
    <h4 style="margin:0 0 8px; color:#1e40af; font-size:14px;">🚀 升级到商务版</h4>
    <p style="margin:0; font-size:12px; color:#3b82f6;">解锁营销工具、会员系统、以及更高级的数据分析功能。</p>
  </div>
)}
```

And pass it from `src/pages/admin/[slug]/index.astro`:

```astro
<TabRenew
  shopTier={shopTierView.effectiveTier}
  // ...existing props...
/>
```

- [ ] **Step 6: Run the admin tests**

Run: `node --test src/pages/admin/[slug]/billing-ui.test.ts src/pages/master/dine-in-panel-routing.test.ts`
Expected: PASS with tier-based gating visible in page source and unrelated routing tests still green

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/[slug]/index.astro src/components/admin/AdminTabs.astro src/components/admin/TabRenew.astro src/pages/admin/[slug]/billing-ui.test.ts
git commit -m "feat: gate admin features by shop tier"
```

---

### Task 6: Full verification and cleanup

**Files:**
- Modify: any touched files from Tasks 1-5 if verification finds issues
- Test: all related tests

- [ ] **Step 1: Run the focused automated tests**

Run: `node --test src/lib/shop-tier.test.ts src/lib/master-settings-view.test.ts src/lib/master-pricing-settings-payload.test.ts src/lib/master-shop-view.test.ts src/lib/master-shop-edit-payload.test.ts src/pages/admin/[slug]/billing-ui.test.ts src/pages/master/master-billing-ui.test.ts`
Expected: PASS with all tier, master, and admin checks green

- [ ] **Step 2: Run a broader regression sweep for touched master/admin surfaces**

Run: `pnpm exec astro check && node --test src/pages/master/dine-in-panel-routing.test.ts src/pages/admin/[slug]/dine-in-reminder.test.ts`
Expected: `astro check` completes without type errors and the regression tests PASS

- [ ] **Step 3: Manually verify the UI flows in browser/dev server**

Run: `pnpm dev`

Manual checklist:
- Open `/master`
- Change global default tier from 会员版 to 商务版 and save
- Confirm a shop still set to 跟随全局 shows `商务版 · 来自全局`
- Open shop edit, switch to 店铺覆盖 → 会员版, save, refresh, confirm master list shows `会员版 · 店铺覆盖`
- Impersonate that shop admin and confirm 营销 / 客户 / 统计 are hidden and 升级提示显示
- Switch same shop to 店铺覆盖 → 商务版, save, refresh, confirm 营销 / 客户 / 统计显示 and 升级提示消失

Expected: Master and admin both match the resolved tier in every case

- [ ] **Step 4: Remove any obsolete billing-plan-based gating found during verification**

Search and inspect:

Run: `grep not allowed in shell; use Grep tool for pattern "billingPlanType === 'business'|billingPlanType === 'subscription' || billingPlanType === 'business'|isPaidPlan" under src/pages/admin src/components/admin`

Expected: Only billing-specific fee logic remains; shop feature visibility no longer depends on billing plan type.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop-tier.ts src/lib/shop-tier.test.ts src/lib/master-settings-view.ts src/lib/master-settings-view.test.ts src/lib/master-dashboard-view.ts src/lib/master-shop-view.ts src/lib/master-shop-view.test.ts src/components/master/MasterPricingSettingsCard.astro src/lib/master-pricing-settings-payload.ts src/lib/master-pricing-settings-payload.test.ts src/components/master/MasterShopEditPanel.astro src/lib/master-shop-edit-payload.ts src/lib/master-shop-edit-payload.test.ts src/scripts/master/shop-panels.ts src/pages/master/index.astro src/pages/admin/[slug]/index.astro src/components/admin/AdminTabs.astro src/components/admin/TabRenew.astro src/pages/admin/[slug]/billing-ui.test.ts
git commit -m "feat: add master-controlled shop tier gating"
```
