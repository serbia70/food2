# Tier And Promotion Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move admin statistics into the subscription tier, keep business tier as subscription plus only marketing/customers, and simplify promotions to special + spend_discount with spend-discount surfaced on the storefront and cart.

**Architecture:** Keep the existing tier-resolution entrypoint in `src/lib/shop-tier.ts` and flow the new capability flags into the admin page/tab visibility. Keep the current promotion data path, but narrow both frontend and backend to two supported promo types (`special`, `spend_discount`) and add a single spend-discount selection/summary path that powers both menu-top messaging and cart messaging. Reuse existing totals and active-promotion filtering so storefront messaging and checkout calculation stay aligned.

**Tech Stack:** Astro, Preact, TypeScript, Nanostores, Node.js `node:test`, Go, Gin, SQLite

---

## File Map

### Tier visibility
- Modify: `src/lib/shop-tier.ts` — redefine tier feature flags so subscription includes analytics while business only adds marketing/customers.
- Modify: `src/lib/shop-tier.test.ts` — lock the new capability matrix.
- Modify: `src/pages/admin/[slug]/index.astro` — keep `showStatsTab` enabled for subscription/business, keep `showMarketingTab` and `showCustomersTab` business-only.
- Modify: `src/components/admin/AdminTabs.astro` — keep tab rendering source stable, driven by the updated props.

### Admin promotion UI
- Modify: `src/components/admin/TabMarketing.astro` — remove `percent_discount` / `bonus_points` from the form and source logic, keep only `special` and `spend_discount` field groups.
- Modify: `src/pages/admin/promotion-ui.test.ts` — assert only two promo types remain and old fields disappear.

### Storefront + cart promotion surface
- Modify: `src/store/cartStore.ts` — add normalized spend-discount support, active-promotion filtering, chosen storefront spend-discount summary, and cart progress helpers while preserving special-price behavior.
- Modify: `src/lib/cart-store-promotions.test.ts` — lock spend-discount filtering, no-render cases, and cart threshold messaging inputs.
- Modify: `src/components/MenuList.tsx` — render a top spend-discount card only when an active spend-discount exists.
- Modify: `src/pages/menu-list-promotions.test.ts` — assert storefront source renders spend-discount messaging only when active.
- Modify: `src/components/CartModal.tsx` — show spend-discount status/pending message only when an active spend-discount exists.
- Modify: `src/lib/cart-order-submit-promotions.test.ts` — verify removed promo types no longer affect checkout payload/total calculation.

### Backend promotion narrowing
- Modify: `foos2Go/internal/handlers/promotions.go` — reject removed promo types on create/update and filter them out from list/active queries.
- Create or modify: `foos2Go/internal/handlers/promotions_test.go` — add backend coverage for accepted promo types and filtering of disabled legacy promo types.
- Modify: backend order/promotion application code if it still consumes removed promo types after narrowing (identify exact file during Task 4 and update only that file).

---

### Task 1: Re-map subscription/business capability flags

**Files:**
- Modify: `src/lib/shop-tier.ts`
- Test: `src/lib/shop-tier.test.ts`
- Test: `src/pages/admin/[slug]/index.astro` (covered indirectly in later source assertions if needed)

- [ ] **Step 1: Write the failing tier capability tests**

Add/adjust assertions in `src/lib/shop-tier.test.ts` so subscription keeps analytics but not marketing/customers, and business keeps all three.

```ts
test('subscription tier keeps analytics but not marketing/customers', () => {
  const view = resolveShopTier({
    defaultShopTier: 'subscription',
    billing_plan_type: 'subscription',
  });

  assert.equal(view.effectiveTier, 'subscription');
  assert.equal(view.features.advancedAnalytics, true);
  assert.equal(view.features.marketing, false);
  assert.equal(view.features.vip, false);
});

test('business tier adds marketing/customers on top of analytics', () => {
  const view = resolveShopTier({
    defaultShopTier: 'subscription',
    billing_plan_type: 'business',
  });

  assert.equal(view.effectiveTier, 'business');
  assert.equal(view.features.advancedAnalytics, true);
  assert.equal(view.features.marketing, true);
  assert.equal(view.features.vip, true);
});
```

- [ ] **Step 2: Run the tier tests to verify they fail**

Run:
```bash
node --test src/lib/shop-tier.test.ts
```

Expected: FAIL because subscription currently has `advancedAnalytics: false`.

- [ ] **Step 3: Implement the minimal tier flag change**

Update `src/lib/shop-tier.ts` so `advancedAnalytics` is always true for both supported tiers while `marketing` and `vip` remain business-only.

```ts
const isBusiness = effectiveTier === 'business';
const isSubscriptionOrBusiness = effectiveTier === 'subscription' || effectiveTier === 'business';

return {
  effectiveTier,
  source,
  displayText: isBusiness ? '商务版' : '会员版',
  sourceLabel: source === 'override' ? '店铺覆盖' : '来自全局',
  features: {
    marketing: isBusiness,
    vip: isBusiness,
    advancedAnalytics: isSubscriptionOrBusiness,
  },
};
```

- [ ] **Step 4: Run the tier tests to verify they pass**

Run:
```bash
node --test src/lib/shop-tier.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop-tier.ts src/lib/shop-tier.test.ts
git commit -m "feat: move analytics into subscription tier"
```

---

### Task 2: Apply the new tier rules to admin tab visibility

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro:98-108`
- Modify: `src/components/admin/AdminTabs.astro:1-18`
- Test: existing admin source assertions if present; otherwise rely on `shop-tier` + page source assertion updates in this task

- [ ] **Step 1: Write the failing admin page source test**

Add a source assertion test (either extend an existing admin source test file or add a focused one if one already exists for this page) to prove `showStatsTab` is no longer business-only.

```ts
test('admin page source keeps stats available outside business-only flags', async () => {
  const file = await readFile(adminPagePath, 'utf8');

  assert.match(file, /const showStatsTab = shopTierView\.features\.advancedAnalytics;/);
  assert.match(file, /const showMarketingTab = shopTierView\.features\.marketing;/);
  assert.match(file, /const showCustomersTab = shopTierView\.features\.vip;/);
});
```

- [ ] **Step 2: Run the targeted admin source test to verify current failure (if adding a new failing assertion)**

Run the exact file you modified, for example:
```bash
node --test src/pages/admin/<target-test-file>.ts
```

Expected: FAIL if the old assumption is still encoded in assertions.

- [ ] **Step 3: Update admin page/tab wiring**

Keep `src/pages/admin/[slug]/index.astro` driven by the updated tier flags and do not introduce extra branching. If `AdminTabs.astro` already accepts the correct props, only keep it unchanged except for any label/source assertion updates needed.

```astro
const showStatsTab = shopTierView.features.advancedAnalytics;
const showMarketingTab = shopTierView.features.marketing;
const showCustomersTab = shopTierView.features.vip;

<AdminTabs
  showReservationTab={showReservationTab}
  showStatsTab={showStatsTab}
  showMarketingTab={showMarketingTab}
  showCustomersTab={showCustomersTab}
/>
```

- [ ] **Step 4: Re-run the admin source test**

Run:
```bash
node --test src/pages/admin/<target-test-file>.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/[slug]/index.astro src/components/admin/AdminTabs.astro src/pages/admin/<target-test-file>.ts
git commit -m "feat: align admin tabs with new tier matrix"
```

---

### Task 3: Simplify the admin marketing form to two promo types

**Files:**
- Modify: `src/components/admin/TabMarketing.astro`
- Test: `src/pages/admin/promotion-ui.test.ts`

- [ ] **Step 1: Write the failing marketing UI source tests**

Extend `src/pages/admin/promotion-ui.test.ts` with assertions that only `spend_discount` and `special` remain, and removed promo types/fields disappear.

```ts
test('promotion modal source only exposes spend_discount and special promo types', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /<option value="spend_discount">满减/);
  assert.match(file, /<option value="special">今日特价/);
  assert.doesNotMatch(file, /percent_discount/);
  assert.doesNotMatch(file, /bonus_points/);
});

test('promotion modal source removes bonus-points-only field group', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.doesNotMatch(file, /id="promo-points-fields"/);
  assert.doesNotMatch(file, /promotion-bonus-points/);
});
```

- [ ] **Step 2: Run the marketing UI tests to verify they fail**

Run:
```bash
node --test src/pages/admin/promotion-ui.test.ts
```

Expected: FAIL because the file still contains `percent_discount`, `bonus_points`, and points-only fields.

- [ ] **Step 3: Update the marketing form and source logic**

In `src/components/admin/TabMarketing.astro`, reduce the select options and remove UI branches for deleted types.

```astro
<select id="promotion-type" required ...>
  <option value="spend_discount">满减（满X减Y）</option>
  <option value="special">今日特价</option>
</select>
```

Remove the deleted field block entirely:

```astro
<!-- delete this block -->
<div id="promo-points-fields" class="form-group" ...>
  ...
</div>
```

And update any JS branching to a two-type switch:

```js
const type = String(document.getElementById('promotion-type')?.value || 'spend_discount');
const isSpecial = type === 'special';

promoSpecialFields.style.display = isSpecial ? 'block' : 'none';
promoSpecialPriceField.style.display = isSpecial ? 'block' : 'none';
promoSpendFields.style.display = isSpecial ? 'none' : 'block';
promoDiscountFields.style.display = isSpecial ? 'none' : 'block';
```

- [ ] **Step 4: Re-run the marketing UI tests**

Run:
```bash
node --test src/pages/admin/promotion-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabMarketing.astro src/pages/admin/promotion-ui.test.ts
git commit -m "refactor: trim admin promotions to special and spend discount"
```

---

### Task 4: Narrow backend promotion types and hide legacy data

**Files:**
- Modify: `foos2Go/internal/handlers/promotions.go`
- Test: `foos2Go/internal/handlers/promotions_test.go`
- Modify if needed: exact backend order/promotion application file found while implementing this task

- [ ] **Step 1: Write the failing Go tests for allowed promo types and filtering**

Extend `foos2Go/internal/handlers/promotions_test.go` with tests that:
- reject `percent_discount`
- reject `bonus_points`
- filter legacy promo types out of admin list / active promotion results

Example test content:

```go
func TestCreatePromotionRejectsRemovedPromoTypes(t *testing.T) {
  req := createPromotionRequest{Name: "legacy", PromoType: "percent_discount"}
  if err := req.normalize(); err == nil {
    t.Fatalf("expected removed percent_discount to be rejected")
  }

  req = createPromotionRequest{Name: "legacy", PromoType: "bonus_points"}
  if err := req.normalize(); err == nil {
    t.Fatalf("expected removed bonus_points to be rejected")
  }
}
```

```go
func TestListPromotionsByShopFiltersRemovedPromoTypes(t *testing.T) {
  // seed shop_promotions with spend_discount, special, percent_discount, bonus_points
  // call listPromotionsByShop
  // assert only spend_discount and special remain
}
```

- [ ] **Step 2: Run the Go promotion tests to verify they fail**

Run:
```bash
cd /d/ai/food/.worktrees/260311/foos2Go && go test ./internal/handlers -run 'Test(CreatePromotionRejectsRemovedPromoTypes|ListPromotionsByShopFiltersRemovedPromoTypes|GetActivePromotionsUsesBelgradeNowBoundary)$'
```

Expected: FAIL because removed types are still accepted/returned.

- [ ] **Step 3: Implement backend narrowing**

Update `foos2Go/internal/handlers/promotions.go` so only `spend_discount` and `special` are valid.

```go
func (pr *createPromotionRequest) normalize() error {
  if pr.PromoType != "spend_discount" && pr.PromoType != "special" {
    return fmt.Errorf("invalid promo_type")
  }
  return nil
}
```

Filter list queries:

```go
FROM shop_promotions
WHERE shop_id = ?
  AND promo_type IN ('spend_discount', 'special')
ORDER BY created_at DESC
```

And filter active queries the same way:

```go
WHERE shop_id = ?
  AND is_active = 1
  AND promo_type IN ('spend_discount', 'special')
  AND (starts_at IS NULL OR starts_at <= ?)
  AND (ends_at IS NULL OR ends_at >= ?)
```

If an order-calculation path still handles `percent_discount` / `bonus_points`, remove those branches in that exact file and add a focused test there before editing.

- [ ] **Step 4: Re-run the Go promotion tests**

Run:
```bash
cd /d/ai/food/.worktrees/260311/foos2Go && go test ./internal/handlers -run 'Test(CreatePromotionRejectsRemovedPromoTypes|ListPromotionsByShopFiltersRemovedPromoTypes|GetActivePromotionsUsesBelgradeNowBoundary)$'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/ai/food/.worktrees/260311/foos2Go && git add internal/handlers/promotions.go internal/handlers/promotions_test.go && git commit -m "refactor: disable legacy promotion types"
```

---

### Task 5: Add spend-discount normalization and cart messaging primitives

**Files:**
- Modify: `src/store/cartStore.ts`
- Test: `src/lib/cart-store-promotions.test.ts`

- [ ] **Step 1: Write the failing cart promotion tests**

Add tests for:
- active spend-discount selection
- no-display when no active spend-discount exists
- cart progress text inputs (`remaining`, `qualified`, `discountAmount`)
- removed promo types not affecting totals

```ts
test('normalizeSpendDiscountPromotions returns the top active spend discount only', () => {
  const result = normalizeSpendDiscountPromotions([
    { promo_type: 'spend_discount', is_active: 1, min_spend_rsd: 2000, discount_amount_rsd: 300 },
    { promo_type: 'spend_discount', is_active: 1, min_spend_rsd: 1500, discount_amount_rsd: 200 },
  ]);

  assert.deepEqual(result, { minSpend: 2000, discountAmount: 300 });
});

test('getSpendDiscountStatus returns null when no active spend discount exists', () => {
  assert.equal(getSpendDiscountStatus(1800, null), null);
});

test('getSpendDiscountStatus reports remaining amount before threshold', () => {
  assert.deepEqual(getSpendDiscountStatus(1880, { minSpend: 2000, discountAmount: 300 }), {
    minSpend: 2000,
    discountAmount: 300,
    qualified: false,
    remaining: 120,
  });
});
```

- [ ] **Step 2: Run the cart promotion tests to verify they fail**

Run:
```bash
node --test src/lib/cart-store-promotions.test.ts
```

Expected: FAIL because spend-discount helpers do not exist yet.

- [ ] **Step 3: Implement the minimal spend-discount helpers in the store**

Add a small parallel type/helper set without disturbing `special` logic.

```ts
export interface SpendDiscountPromotion {
  minSpend: number;
  discountAmount: number;
}

export function normalizeSpendDiscountPromotions(promotions: unknown): SpendDiscountPromotion | null {
  if (!Array.isArray(promotions)) return null;
  const now = Date.now();

  const active = promotions
    .filter((promotion) => {
      const record = promotion as PromotionRecord;
      if (record.promo_type !== 'spend_discount') return false;
      if (!isPromotionRecordActive(record, now)) return false;
      return Number(record.min_spend_rsd || 0) > 0 && Number(record.discount_amount_rsd || 0) > 0;
    })
    .sort((a, b) => Number(b.min_spend_rsd || 0) - Number(a.min_spend_rsd || 0) || Number(b.discount_amount_rsd || 0) - Number(a.discount_amount_rsd || 0));

  const top = active[0] as PromotionRecord | undefined;
  if (!top) return null;
  return {
    minSpend: Number(top.min_spend_rsd || 0),
    discountAmount: Number(top.discount_amount_rsd || 0),
  };
}

export function getSpendDiscountStatus(total: number, promotion: SpendDiscountPromotion | null) {
  if (!promotion) return null;
  const subtotal = Number(total || 0);
  const qualified = subtotal >= promotion.minSpend;
  return {
    minSpend: promotion.minSpend,
    discountAmount: promotion.discountAmount,
    qualified,
    remaining: qualified ? 0 : promotion.minSpend - subtotal,
  };
}
```

Use a shared activity check helper so both `special` and `spend_discount` use the same active-window logic.

- [ ] **Step 4: Re-run the cart promotion tests**

Run:
```bash
node --test src/lib/cart-store-promotions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/cartStore.ts src/lib/cart-store-promotions.test.ts
git commit -m "feat: add spend discount storefront helpers"
```

---

### Task 6: Surface active spend-discount on the menu page

**Files:**
- Modify: `src/components/MenuList.tsx`
- Test: `src/pages/menu-list-promotions.test.ts`

- [ ] **Step 1: Write the failing storefront source test**

Extend `src/pages/menu-list-promotions.test.ts` with assertions for a top spend-discount card and no-render guard.

```ts
test('MenuList source renders spend discount promo block only when active promo exists', async () => {
  const file = await readFile(menuListPath, 'utf8');

  assert.match(file, /const activeSpendDiscount = getActiveSpendDiscount/);
  assert.match(file, /activeSpendDiscount && \(/);
  assert.match(file, /满\s*\{activeSpendDiscount\.minSpend\}\s*减\s*\{activeSpendDiscount\.discountAmount\}/);
});
```

- [ ] **Step 2: Run the storefront source test to verify it fails**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: FAIL because `MenuList.tsx` has no spend-discount block yet.

- [ ] **Step 3: Implement the menu-top spend-discount card**

Import the new helper and render the block only when present.

```tsx
import {
  ...,
  getActiveSpendDiscount,
} from '../store/cartStore';

const activeSpendDiscount = getActiveSpendDiscount(rawPromotions);
```

```tsx
{activeSpendDiscount && (
  <div style={{ marginBottom: '16px', padding: '12px', background: '#fffaf0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
    <div style={{ fontSize: '16px', fontWeight: '800', color: '#744210', marginBottom: '6px' }}>满减活动</div>
    <div style={{ fontSize: '14px', fontWeight: '700', color: '#c05621' }}>
      满 {activeSpendDiscount.minSpend} 减 {activeSpendDiscount.discountAmount} RSD
    </div>
  </div>
)}
```

Do not render anything when the helper returns `null`.

- [ ] **Step 4: Re-run the storefront source test**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MenuList.tsx src/pages/menu-list-promotions.test.ts
git commit -m "feat: show active spend discount on menu page"
```

---

### Task 7: Surface spend-discount progress in the cart and keep checkout aligned

**Files:**
- Modify: `src/components/CartModal.tsx`
- Modify if needed: `src/components/cart-modal/useCartOrderSubmit.ts`
- Test: `src/lib/cart-order-submit-promotions.test.ts`
- Test: `src/lib/cart-store-promotions.test.ts` (reuse if helper-level assertions belong there)

- [ ] **Step 1: Write the failing cart UI / submit tests**

Add a source assertion or functional test proving the cart shows threshold progress from the new helper and removed promo types do not affect checkout.

```ts
test('useCartOrderSubmit ignores removed promotion types in checkout totals', async () => {
  const promotionMap = normalizeSpecialPromotions([
    { promo_type: 'percent_discount', is_active: 1, discount_percent: 20 },
    { promo_type: 'bonus_points', is_active: 1, bonus_points: 30 },
  ]);

  // submit order and assert total/items stay unchanged
});
```

If there is an existing CartModal source test file, add:

```ts
assert.match(file, /再买 \{spendDiscountStatus\.remaining\} RSD/);
assert.match(file, /已享满 \{spendDiscountStatus\.minSpend\} 减 \{spendDiscountStatus\.discountAmount\}/);
```

- [ ] **Step 2: Run the targeted cart tests to verify they fail**

Run:
```bash
node --test src/lib/cart-order-submit-promotions.test.ts
```

And, if you added a cart UI source test:
```bash
node --test <cart-ui-test-file>
```

Expected: FAIL because cart UI/message wiring does not exist yet.

- [ ] **Step 3: Implement cart spend-discount messaging and keep totals single-sourced**

In `CartModal.tsx`, derive the subtotal from existing totals, derive `spendDiscountStatus`, and conditionally render the message block.

```tsx
const spendDiscountStatus = getSpendDiscountStatus(totals.price, activeSpendDiscount);
```

```tsx
{spendDiscountStatus && (
  <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '10px', background: '#fffaf0', color: '#9c4221' }}>
    {spendDiscountStatus.qualified
      ? `已享满 ${spendDiscountStatus.minSpend} 减 ${spendDiscountStatus.discountAmount}`
      : `再买 ${spendDiscountStatus.remaining} RSD，即可满 ${spendDiscountStatus.minSpend} 减 ${spendDiscountStatus.discountAmount}`}
  </div>
)}
```

Only render this block when an active spend-discount exists. Do not add a second pricing path; keep final submit totals driven by the same computed values already used by checkout.

- [ ] **Step 4: Re-run the targeted cart tests**

Run:
```bash
node --test src/lib/cart-order-submit-promotions.test.ts
```

And, if applicable:
```bash
node --test <cart-ui-test-file>
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CartModal.tsx src/components/cart-modal/useCartOrderSubmit.ts src/lib/cart-order-submit-promotions.test.ts <cart-ui-test-file>
git commit -m "feat: show spend discount progress in cart"
```

---

### Task 8: Run final regression across tier visibility, promo UI, storefront, cart, and Go handlers

**Files:**
- Test only: `src/lib/shop-tier.test.ts`
- Test only: `src/pages/admin/promotion-ui.test.ts`
- Test only: `src/pages/menu-list-promotions.test.ts`
- Test only: `src/lib/cart-store-promotions.test.ts`
- Test only: `src/lib/cart-order-submit-promotions.test.ts`
- Test only: `foos2Go/internal/handlers/promotions_test.go`

- [ ] **Step 1: Run the full targeted frontend regression batch**

Run:
```bash
node --test src/lib/shop-tier.test.ts src/pages/admin/promotion-ui.test.ts src/pages/menu-list-promotions.test.ts src/lib/cart-store-promotions.test.ts src/lib/cart-order-submit-promotions.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full targeted backend promotion regression batch**

Run:
```bash
cd /d/ai/food/.worktrees/260311/foos2Go && go test ./internal/handlers -run 'Test(CreatePromotionRejectsRemovedPromoTypes|ListPromotionsByShopFiltersRemovedPromoTypes|GetActivePromotionsUsesBelgradeNowBoundary)$'
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff for only intended files**

Run:
```bash
git diff -- src/lib/shop-tier.ts src/lib/shop-tier.test.ts src/pages/admin/[slug]/index.astro src/components/admin/AdminTabs.astro src/components/admin/TabMarketing.astro src/pages/admin/promotion-ui.test.ts src/components/MenuList.tsx src/pages/menu-list-promotions.test.ts src/store/cartStore.ts src/lib/cart-store-promotions.test.ts src/components/CartModal.tsx src/lib/cart-order-submit-promotions.test.ts
```

And:
```bash
cd /d/ai/food/.worktrees/260311/foos2Go && git diff -- internal/handlers/promotions.go internal/handlers/promotions_test.go
```

Expected: Diff only covers tier remapping, promo narrowing, storefront/cart messaging, and Go promo filtering.

- [ ] **Step 4: Commit the final integration batch**

```bash
git add src/lib/shop-tier.ts src/lib/shop-tier.test.ts src/pages/admin/[slug]/index.astro src/components/admin/AdminTabs.astro src/components/admin/TabMarketing.astro src/pages/admin/promotion-ui.test.ts src/components/MenuList.tsx src/pages/menu-list-promotions.test.ts src/store/cartStore.ts src/lib/cart-store-promotions.test.ts src/components/CartModal.tsx src/lib/cart-order-submit-promotions.test.ts
```

```bash
cd /d/ai/food/.worktrees/260311/foos2Go && git add internal/handlers/promotions.go internal/handlers/promotions_test.go
```

```bash
git commit -m "feat: simplify tiers and storefront promotions"
```
