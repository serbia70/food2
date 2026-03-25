# master / admin 渠道费率对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 master 店铺编辑页“预订 / 预约”语义重复，并让 admin 页始终显示店铺当前生效的预订 / 外卖费率。

**Architecture:** 保持现有 `order-channel-fees-view` 作为最终格式化层，不改扣费算法。`admin-order-channel-billing-view` 改成按来源解析 `billing + shop + settings`，规则是“店铺覆盖优先，billing 只作补位”；master 店铺编辑面板只改文案和分组，不改现有提交字段。

**Tech Stack:** Astro、TypeScript、node:test、pnpm

---

## File Structure & Responsibilities

**Reference:** `docs/superpowers/specs/2026-03-24-master-admin-order-channel-alignment-design.md`

**Modify:**
- `src/lib/admin-order-channel-billing-view.ts`
  - 把 helper 输入从“拍平后的 billing 字段”升级为按来源接收 `billing`、`shop`、`settings`。
  - 实现 reservation / delivery 的优先级解析，以及 `commission_mode` 的 override 判定。
- `src/lib/admin-order-channel-billing-view.test.ts`
  - 锁定“店铺覆盖优先于 billing”与 `settings → billing → 默认值` 的回退矩阵。
  - 锁定 `0`、空字符串、`null`、非法 `commission_mode` 的边界行为。
- `src/pages/admin/[slug]/index.astro`
  - 不再手工拍平 `billingData.*` 传给 helper，而是按来源传 `{ billing, shop, settings }`。
  - 保持后续 `adminBillingView.deliveryPlan.commissionValue` 的累计逻辑不变。
- `src/pages/admin/[slug]/billing-ui.test.ts`
  - 锁定 admin 页面源码使用新 helper 调用形态。
  - 锁定“预订 / 外卖余额”和技术服务费相关文案没有回退。
- `src/components/master/MasterShopEditPanel.astro`
  - 把下方业务开关分组明确成“店铺业务开关”，把“外卖 / 预约”文案改成“外卖接单 / 预约接单”。
- `src/pages/master/master-billing-ui.test.ts`
  - 锁定 master 编辑面板同时存在“预订”费率区和“预约接单”业务开关文案。

**Not touching unless tests prove it is required:**
- `src/components/admin/TabRenew.astro`（当前只消费 props，不负责费率来源判断）
- `src/lib/order-channel-fees-view.ts`（当前只负责格式化与 source 标记）
- `src/pages/master/index.astro`（本任务不改 master 页面提交逻辑）

---

## Task 1: 让 admin helper 按“店铺覆盖优先”解析当前生效费率

**Files:**
- Modify: `src/lib/admin-order-channel-billing-view.ts`
- Modify: `src/lib/admin-order-channel-billing-view.test.ts`
- Reference: `src/lib/master-shop-view.ts`

- [ ] **Step 1: 先写会失败的 helper 测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminOrderChannelBillingView } from './admin-order-channel-billing-view.ts';

test('shop 外卖覆盖值必须压过 stale billing 快照', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 5,
      },
      shop: {
        commission_mode: 'override',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 6,
      },
      settings: {},
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '6%');
  assert.equal(view.deliveryPlan.commissionValue, 6);
});

test('shop commission_mode 为空时应继续回退到 settings override', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 5,
      },
      shop: {
        commission_mode: '',
      },
      settings: {
        commission_mode: 'override',
        commission_override_type: 'percentage',
        commission_override_value: 6,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '6%');
});

test('reservation 0 值不能被空字符串 billing 覆盖掉', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 1800,
        billing_alert_level: 'normal',
        reservation_commission_type: '',
        reservation_commission_value: '',
      },
      shop: {
        reservation_commission_type: 'percentage',
        reservation_commission_value: 0,
      },
      settings: {},
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '免费');
});
```

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/lib/admin-order-channel-billing-view.test.ts`

Expected:
- FAIL，至少一个断言会显示 `Expected values to be strictly equal: '6%' !== '5%'`
- 说明当前 helper 仍把 billing 快照当成主要来源

- [ ] **Step 3: 写最小实现，让 helper 接收来源并按优先级解析**

在 `src/lib/admin-order-channel-billing-view.ts` 内做最小改动：

```ts
type BillingSourceInput = {
  billing?: BillingInput;
  shop?: BillingInput;
  settings?: BillingInput;
};

function asRecord(value: unknown): BillingInput {
  return value && typeof value === 'object' ? (value as BillingInput) : {};
}

function resolveCommissionMode(shop: BillingInput, settings: BillingInput): 'global' | 'override' {
  const shopMode = String(shop.commission_mode ?? '').trim().toLowerCase();
  if (shopMode === 'global' || shopMode === 'override') return shopMode;

  const settingsMode = String(settings.commission_mode ?? '').trim().toLowerCase();
  if (settingsMode === 'global' || settingsMode === 'override') return settingsMode;

  return 'global';
}

function buildDeliveryPlan(input: BillingSourceInput, defaults?: AdminOrderChannelBillingDefaults): OrderChannelFeePlan {
  const billing = asRecord(input.billing);
  const shop = asRecord(input.shop);
  const settings = asRecord(input.settings);
  const commissionMode = resolveCommissionMode(shop, settings);

  return buildOrderChannelFeePlan({
    channel: 'delivery',
    scope: 'shop',
    enabled: firstValue(shop.delivery_enabled, shop.enableDelivery, settings.delivery_enabled, billing.delivery_enabled),
    commissionType: firstValue(
      shop.delivery_commission_type,
      shop.businessDeliveryCommissionType,
      shop.business_delivery_commission_type,
      commissionMode === 'override' ? shop.commission_override_type : undefined,
      commissionMode === 'override' ? shop.commission_type : undefined,
      settings.delivery_commission_type,
      settings.business_delivery_commission_type,
      commissionMode === 'override' ? settings.commission_override_type : undefined,
      commissionMode === 'override' ? settings.commission_type : undefined,
      billing.delivery_commission_type,
      billing.business_delivery_commission_type,
    ),
    commissionValue: firstValue(
      shop.delivery_commission_value,
      shop.businessDeliveryCommissionValue,
      shop.business_delivery_commission_value,
      commissionMode === 'override' ? shop.commission_override_value : undefined,
      commissionMode === 'override' ? shop.commission_value : undefined,
      commissionMode === 'override' ? shop.businessFeeRsd : undefined,
      settings.delivery_commission_value,
      settings.business_delivery_commission_value,
      commissionMode === 'override' ? settings.commission_override_value : undefined,
      commissionMode === 'override' ? settings.commission_value : undefined,
      commissionMode === 'override' ? settings.businessFeeRsd : undefined,
      billing.delivery_commission_value,
      billing.business_delivery_commission_value,
    ),
    legacyEnabled: firstValue(shop.enable_delivery, shop.business_enabled, settings.business_enabled, billing.business_enabled),
    legacyCommissionType: firstValue(shop.businessDeliveryCommissionType, shop.business_delivery_commission_type, settings.business_delivery_commission_type, billing.business_delivery_commission_type),
    legacyCommissionValue: firstValue(shop.businessDeliveryCommissionValue, shop.business_delivery_commission_value, settings.business_delivery_commission_value, billing.business_delivery_commission_value),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 5,
  });
}
```

对 reservation 也做同样来源拆分，但顺序必须与 spec 完全一致：

1. `shop.reservation_commission_type` / `shop.reservation_commission_value`
2. `shop.subscriptionDeliveryCommissionType` / `shop.subscriptionDeliveryCommissionValue`
3. `shop.subscription_delivery_commission_type` / `shop.subscription_delivery_commission_value`
4. `settings.reservation_commission_type` / `settings.reservation_commission_value`
5. `settings.subscription_delivery_commission_type` / `settings.subscription_delivery_commission_value`
6. `billing.reservation_commission_type` / `billing.reservation_commission_value`
7. `billing.subscription_delivery_commission_type` / `billing.subscription_delivery_commission_value`
8. 默认值

并补一条冲突测试：当 `shop=4`、`settings=3`、`billing=2` 时，admin 必须显示 shop 的 reservation 值；当 shop 缺失时，再回退到 settings。任何一步都必须保住 `0` 值。

- [ ] **Step 4: 再跑测试，确认变绿**

Run: `node --test src/lib/admin-order-channel-billing-view.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/admin-order-channel-billing-view.ts src/lib/admin-order-channel-billing-view.test.ts
git commit -m "fix(admin): prefer effective shop fee rules"
```

---

## Task 2: 让 admin 页面按来源把 `billing / shop / settings` 传给 helper

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro:84-103`
- Modify: `src/pages/admin/[slug]/billing-ui.test.ts`

- [ ] **Step 1: 先写会失败的页面源码断言**

在 `src/pages/admin/[slug]/billing-ui.test.ts` 增加断言：

```ts
test('admin page passes billing shop and settings into billing helper', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(
    page,
    /buildAdminOrderChannelBillingView\(\s*\{\s*billing:\s*billingData,\s*shop,\s*settings\s*\}/s,
  );
  assert.doesNotMatch(page, /delivery_commission_value:\s*billingData\.delivery_commission_value/);
  assert.doesNotMatch(page, /reservation_commission_value:\s*billingData\.reservation_commission_value/);
  assert.match(page, /const commissionValue = adminBillingView\.deliveryPlan\.commissionValue;/);
  assert.match(page, /adminBillingView\.walletCopy/);
  assert.match(page, /adminBillingView\.walletHint/);
});
```

并保留 / 扩展已有文案断言，继续锁定：

```ts
assert.match(tabRenew, /预订\s*\/\s*外卖余额/);
assert.match(tabRenew, /仅用于预订/);
assert.doesNotMatch(tabRenew, /每月1号/);
```


- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/pages/admin/[slug]/billing-ui.test.ts`

Expected:
- FAIL，源码仍是旧的拍平传参形式

- [ ] **Step 3: 写最小页面改动**

把 `src/pages/admin/[slug]/index.astro` 中的 helper 调用改成按来源传值：

```ts
const adminBillingView = buildAdminOrderChannelBillingView({
  billing: billingData,
  shop,
  settings,
});
```

同时删除这一段旧的拍平字段：

```ts
reservation_commission_type: billingData.reservation_commission_type,
reservation_commission_value: billingData.reservation_commission_value,
delivery_commission_type: billingData.delivery_commission_type,
delivery_commission_value: billingData.delivery_commission_value,
subscription_delivery_commission_type: billingData.subscription_delivery_commission_type,
subscription_delivery_commission_value: billingData.subscription_delivery_commission_value,
business_delivery_commission_type: billingData.business_delivery_commission_type,
business_delivery_commission_value: billingData.business_delivery_commission_value,
```

不要改后面的：

```ts
const commissionValue = adminBillingView.deliveryPlan.commissionValue;
```

这样月累计 / 总累计仍然按最终生效的外卖提成计算。

- [ ] **Step 4: 再跑测试，确认变绿**

Run: `node --test src/pages/admin/[slug]/billing-ui.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/pages/admin/[slug]/index.astro src/pages/admin/[slug]/billing-ui.test.ts
git commit -m "fix(admin): wire billing helper with source inputs"
```

---

## Task 3: 去掉 master 店铺编辑页里“预订 / 预约”像重复功能的文案

**Files:**
- Modify: `src/components/master/MasterShopEditPanel.astro:74-96`
- Modify: `src/pages/master/master-billing-ui.test.ts`

- [ ] **Step 1: 先写会失败的 master UI 文案测试**

在 `src/pages/master/master-billing-ui.test.ts` 的 `master shop edit panel exposes split overrides and reset action` 用例旁边补充断言：

```ts
assert.match(panel, /店铺业务开关/);
assert.match(panel, /外卖接单/);
assert.match(panel, /预约接单/);
assert.match(panel, /控制店铺是否开放外卖接单、堂食和预约接单/);
assert.match(panel, /name="enableDelivery"/);
assert.match(panel, /name="enableReservation"/);
assert.doesNotMatch(panel, /<span>预约<\/span>/);
```

保留已有断言，继续确保费率区里仍然有“预订”和“外卖”。

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/pages/master/master-billing-ui.test.ts`

Expected:
- FAIL，源码里还没有“店铺业务开关 / 外卖接单 / 预约接单”这些文案

- [ ] **Step 3: 写最小 UI 文案改动**

把下方三个业务开关包成一组，直接在 `MasterShopEditPanel.astro` 用现有 `fee-section` 样式：

```astro
<section class="fee-section">
  <div class="fee-section-head">
    <div class="fee-section-title">店铺业务开关</div>
    <div class="fee-section-note">控制店铺是否开放外卖接单、堂食和预约接单</div>
  </div>

  <label>
    <span>外卖接单</span>
    <select name="enableDelivery">
      <option value="1">开启</option>
      <option value="0">关闭</option>
    </select>
  </label>

  <label>
    <span>堂食</span>
    <select name="enableDineIn">
      <option value="1">开启</option>
      <option value="0">关闭</option>
    </select>
  </label>

  <label>
    <span>预约接单</span>
    <select name="enableReservation">
      <option value="1">开启</option>
      <option value="0">关闭</option>
    </select>
  </label>
</section>
```

不要改：
- 上方“预订 / 外卖”费率区
- `name="enableDelivery" / "enableDineIn" / "enableReservation"` 这些字段名
- 提交按钮和“恢复全局默认”逻辑

- [ ] **Step 4: 跑 master UI 测试，确认变绿**

Run: `node --test src/pages/master/master-billing-ui.test.ts`

Expected: PASS

- [ ] **Step 5: 跑本任务的聚焦验证**

Run:
- `node --test src/lib/admin-order-channel-billing-view.test.ts src/pages/admin/[slug]/billing-ui.test.ts src/pages/master/master-billing-ui.test.ts`
- `pnpm build`

Expected:
- 三个测试文件全部 PASS
- `pnpm build` 成功结束，无新增 TypeScript / Astro 编译错误

- [ ] **Step 6: 做页面级验收**

Manual checklist:
1. 在 master 打开店铺编辑面板，确认上半区仍是“预订 / 外卖”费率区。
2. 确认下半区出现“店铺业务开关”，并显示“外卖接单 / 堂食 / 预约接单”。
3. 若本地环境已有 101 店铺数据：把 101 的外卖提成改成 6%，保存后打开 `/admin/101`，确认显示“外卖：6%”。
4. 若无法直接复现 101：至少用本地可控数据验证一组外卖冲突场景——shop=6、settings=5、billing=5 时 admin 仍显示 6%。
5. 再补一组预订冲突场景——shop=4、settings=3、billing=2 时 admin 显示 shop 的预订值；shop 缺失后回退到 settings。
6. 最后验证无店铺覆盖时，admin 按 `settings → billing → 默认值` 顺序回退显示。

- [ ] **Step 7: 提交**

```bash
git add src/components/master/MasterShopEditPanel.astro src/pages/master/master-billing-ui.test.ts
git commit -m "fix(master): clarify shop channel toggle copy"
```

---

## Notes for the implementer

- 不要顺手改 `TabRenew.astro`、堂食提醒卡、账单累计文案。
- 不要把这次任务扩大成后端接口改造；当前 admin 页面已经有 `shop` 和 `settings`，前端足够完成当前生效值解析。
- `commission_mode` 的判定必须严格按 spec：
  - `shop.commission_mode` 只有 `global` / `override` 算合法
  - 空字符串、`null`、`undefined`、非法值都继续回退到 `settings.commission_mode`
  - 两边都不合法才按 `global`
- 任何 `0` 值都是有效值，不能被 `||` 或空字符串 fallback 吃掉。
- 不要创建空提交；如果某一步没有新改动，就继续下一步，不额外 commit。
