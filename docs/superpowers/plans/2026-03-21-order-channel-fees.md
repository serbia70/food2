# 预订 / 外卖技术服务费拆分 Implementation Plan

> 状态说明（历史计划）：这份计划记录的是预订/外卖技术服务费拆分时的实施步骤，文中的 `历史红灯预期：` 属于当时的阶段性红灯预期，不应再被直接当作当前实现状态。
> 若继续处理收费计划模型、payload 或 admin 展示，请先以当前 helper、视图模型和真实页面代码为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把预订和外卖拆成两条独立收费计划，支持全局默认 + 店铺覆盖，保留 0 免费和旧字段回退，并删除 admin 里的旧月扣费文案。

**Architecture:** 先把“计划模型”收敛到一个纯 helper，再让 master settings、shop view、master payload 以及 admin display 都只消费这个 canonical 结构。页面层只负责渲染和提交；所有关于 0 免费、默认/覆盖来源、旧字段兼容和文案格式化的规则都放进可测试的 helper，避免 master/admin 各算各的。

**Tech Stack:** Astro、TypeScript、node:test、pnpm、原生 DOM 脚本、现有 proxy 路由

---

## File Structure & Responsibilities

**Create:**
- `src/lib/order-channel-fees-view.ts`
  - 统一解析 `reservation_*` / `delivery_*` 新字段与 `subscription_*` / `business_*` 旧字段。
  - 输出 canonical plan view：`enabled`、`commissionType`、`commissionValue`、`source`、`displayText`、`isFree`。
  - 统一把 `0` 解释成“免费”。
- `src/lib/order-channel-fees-view.test.ts`
  - 锁定新旧字段优先级、0 免费、per_order / percentage 格式化。
- `src/lib/master-pricing-settings-payload.ts`
  - 把 settings 表单序列化成请求体，保留当前 camelCase 兼容键，同时写入新的 snake_case 计划字段。
- `src/lib/master-pricing-settings-payload.test.ts`
  - 锁定 payload 字段、0 值保留、兼容键双写。
- `src/lib/master-shop-edit-payload.ts`
  - 把 shop 编辑表单序列化成请求体，并提供“恢复全局默认”时只重置费率的纯函数。
- `src/lib/master-shop-edit-payload.test.ts`
  - 锁定店铺覆盖、恢复默认只动费率、不改启用状态。
- `src/lib/admin-order-channel-billing-view.ts`
  - 把 admin 的余额提醒、预订 / 外卖展示文案和状态拼成一个可测试 view model。
- `src/lib/admin-order-channel-billing-view.test.ts`
  - 锁定 admin 里不再出现旧月扣费文案、0 免费和余额提醒口径。

**Modify:**
- `src/types/index.ts:3-37`
  - 给 `Shop` 补上预订 / 外卖计划相关可选字段，保留旧字段兼容。
- `src/lib/master-settings-view.ts:1-145`
  - 输出 `reservationPlan` / `deliveryPlan` 两条全局默认计划，并保留旧字段别名。
- `src/lib/master-settings-view.test.ts:1-145`
  - 改成验证新计划结构、旧字段回退和 0 免费。
- `src/lib/master-commission-view.ts:1-14`
  - 继续保留旧入口作为兼容别名，但格式化规则改走共享 helper。
- `src/lib/master-commission-view.test.ts:1-16`
  - 锁定 `percentage`、`per_order` 和 `0 => 免费`。
- `src/components/master/MasterPricingSettingsCard.astro:1-133`
  - 改成预订 / 外卖两块全局默认设置。
- `src/pages/master/index.astro:375-418,1094-1317,1543-1564,1805-1815`
  - 把 settings / shop edit 的提交和回填改成调用纯 helper。
  - 详情面板只读 canonical view，不再手拼旧提成文案。
- `src/components/master/MasterShopEditPanel.astro:4-90`
  - 拆成预订 / 外卖两套覆盖项，并加“恢复全局默认”按钮。
- `src/lib/master-shop-view.ts:1-194`
  - 输出店铺层的预订 / 外卖有效值、来源与免费文案。
- `src/lib/master-shop-view.test.ts:1-304`
  - 锁定店铺覆盖、旧字段回退、0 仍有效、恢复默认只改费率。
- `src/components/master/MasterShopManagementTable.astro:42-167`
  - 表格展示两条计划、状态来源和免费文案。
- `src/pages/admin/[slug]/index.astro:84-417`
  - 改成读取 admin billing view model，删除旧的“每月扣费 / 下次扣费日”文案。
- `src/components/admin/TabRenew.astro:1-126`
  - 把钱包说明改成“仅用于预订 / 外卖技术服务费”，并分开显示两条计划。

**Not touching unless smoke tests prove it is needed:**
- `src/pages/api/master/settings.ts`
- `src/pages/api/master/shops/[id].ts`
- `src/pages/api/admin/billing.ts`
- `src/pages/api/admin/billing/records.ts`
- `src/lib/admin-service.ts`
- `src/scripts/admin/billing-ui.ts`

---

## Task 1: 建立统一的预订 / 外卖计划 helper

**Files:**
- Create: `src/lib/order-channel-fees-view.ts`
- Create: `src/lib/order-channel-fees-view.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/lib/master-settings-view.ts`
- Modify: `src/lib/master-settings-view.test.ts`
- Modify: `src/lib/master-commission-view.ts`
- Modify: `src/lib/master-commission-view.test.ts`

- [ ] **Step 1: 先写会失败的测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderChannelFeePlan, formatOrderChannelFeeRule } from './order-channel-fees-view.ts';

test('new fields override legacy fields and 0 stays free', () => {
  const plan = buildOrderChannelFeePlan({
    channel: 'reservation',
    enabled: 1,
    commissionType: 'percentage',
    commissionValue: 0,
    legacyEnabled: 0,
    legacyCommissionType: 'per_order',
    legacyCommissionValue: 18,
  });

  assert.equal(plan.enabled, true);
  assert.equal(plan.commissionValue, 0);
  assert.equal(plan.displayText, '免费');
  assert.equal(plan.source, 'new');
});

test('percentage and per_order still format correctly', () => {
  assert.equal(formatOrderChannelFeeRule('percentage', 3), '3%');
  assert.equal(formatOrderChannelFeeRule('per_order', 35), '每单 35 RSD');
});
```

同时把 `src/lib/master-settings-view.test.ts` 改成验证：
- `reservation_*` / `delivery_*` 新字段能读到
- 旧字段还能作为回退
- `0` 不是“未设置”

把 `src/lib/master-commission-view.test.ts` 改成验证：
- `0` 显示为 `免费`
- `per_order` 还能正常格式化

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/lib/order-channel-fees-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-commission-view.test.ts`

历史红灯预期：，因为 helper / 新字段还没接好，`0` 也还没按“免费”处理。

- [ ] **Step 3: 实现最小代码让测试变绿**

在 `src/lib/order-channel-fees-view.ts` 里实现纯 helper：
- 读取 `reservation_*` / `delivery_*`
- 没有新字段时回退到旧字段
- `enabled`、`commissionType`、`commissionValue` 都允许 `0`
- `commissionValue === 0` 时显示 `免费`
- 返回 `source`，让 master/admin 能显示“全局默认 / 店铺覆盖 / 旧字段回退”

在 `src/lib/master-settings-view.ts` 里：
- 输出 `reservationPlan` / `deliveryPlan`
- 保留旧字段别名，避免其他页面一次性炸掉

在 `src/lib/master-commission-view.ts` 里：
- 让旧 `formatCommissionRule()` 继续存在，但内部走新 helper

- [ ] **Step 4: 再跑测试，确认变绿**

Run: `node --test src/lib/order-channel-fees-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-commission-view.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/types/index.ts src/lib/order-channel-fees-view.ts src/lib/order-channel-fees-view.test.ts src/lib/master-settings-view.ts src/lib/master-settings-view.test.ts src/lib/master-commission-view.ts src/lib/master-commission-view.test.ts
git commit -m "feat(master): normalize order-channel fee defaults"
```

---

## Task 2: 把 master 全局设置卡改成两条计划

**Files:**
- Create: `src/lib/master-pricing-settings-payload.ts`
- Create: `src/lib/master-pricing-settings-payload.test.ts`
- Modify: `src/components/master/MasterPricingSettingsCard.astro`
- Modify: `src/pages/master/index.astro:375-418,1805-1815`

- [ ] **Step 1: 先写会失败的 payload 测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterPricingSettingsPayload } from './master-pricing-settings-payload.ts';

test('settings payload keeps new plan fields and legacy aliases together', () => {
  const payload = buildMasterPricingSettingsPayload({
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '1',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
  });

  assert.equal(payload.reservation_commission_value, 0);
  assert.equal(payload.delivery_commission_value, 5);
  assert.equal(payload.subscriptionDeliveryCommissionType, 'percentage');
  assert.equal(payload.businessDeliveryCommissionType, 'per_order');
  assert.equal(payload.reservationEnabled, true);
});
```

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/lib/master-pricing-settings-payload.test.ts`

历史红灯预期：，因为 serializer 还不存在。

- [ ] **Step 3: 实现最小代码让测试变绿**

在 `src/lib/master-pricing-settings-payload.ts` 里实现一个纯 serializer：
- 读取两个计划的 form 值
- 保留当前页面已有的 camelCase 兼容键
- 同时写入新的 snake_case 计划字段
- `0` 保留为 `0`

在 `src/components/master/MasterPricingSettingsCard.astro` 里：
- 改成预订 / 外卖两个设置块
- `number` 输入允许 `0`，不要再写 `min="1"`
- `0` 时显示“免费”，不要再显示“未设置”

在 `src/pages/master/index.astro` 里：
- `handlePricingSettings()` 不再手拼 payload，直接调用 serializer
- 提交时继续走现有 `/api/master/settings` 代理，不改路由

- [ ] **Step 4: 再跑测试并做一次 master smoke check**

Run:
- `node --test src/lib/master-pricing-settings-payload.test.ts`
- `pnpm dev`

Expected:
- 单测 PASS
- `/master?tab=settings` 显示两条计划，且 0 可以保存

- [ ] **Step 5: 提交**

```bash
git add src/lib/master-pricing-settings-payload.ts src/lib/master-pricing-settings-payload.test.ts src/components/master/MasterPricingSettingsCard.astro src/pages/master/index.astro
git commit -m "feat(master): split global fee settings card"
```

---

## Task 3: 把店铺编辑面板改成两套覆盖项

**Files:**
- Create: `src/lib/master-shop-edit-payload.ts`
- Create: `src/lib/master-shop-edit-payload.test.ts`
- Modify: `src/components/master/MasterShopEditPanel.astro`
- Modify: `src/pages/master/index.astro:1094-1317`

- [ ] **Step 1: 先写会失败的店铺编辑测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterShopEditPayload, resetMasterShopFeeOverrides } from './master-shop-edit-payload.ts';

test('reset only rewrites fee values and keeps enabled flags', () => {
  const state = resetMasterShopFeeOverrides(
    {
      reservationEnabled: true,
      reservationCommissionType: 'per_order',
      reservationCommissionValue: 18,
      deliveryEnabled: false,
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: 5,
    },
    {
      reservationCommissionType: 'percentage',
      reservationCommissionValue: 0,
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: 3,
    },
  );

  assert.equal(state.reservationEnabled, true);
  assert.equal(state.deliveryEnabled, false);
  assert.equal(state.reservationCommissionValue, 0);
  assert.equal(state.deliveryCommissionValue, 3);
});
```

同时补一个序列化测试，确认 shop edit payload 也会保留新的计划字段和旧兼容字段。

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/lib/master-shop-edit-payload.test.ts`

历史红灯预期：，因为店铺编辑 serializer / reset helper 还没接好。

- [ ] **Step 3: 实现最小代码让测试变绿**

在 `src/lib/master-shop-edit-payload.ts` 里实现：
- 一个纯 serializer，把 shop 表单值转成请求体
- 一个纯 reset helper，只重置费率字段，不改 enabled 状态
- 新旧字段同时保留，避免当前 master 页面的提交入口断掉

在 `src/components/master/MasterShopEditPanel.astro` 里：
- 拆成预订 / 外卖两块
- 每块都提供启用 / 停用、费率类型、费率数值
- “恢复全局默认”只回填费率输入，不碰启用开关

在 `src/pages/master/index.astro` 里：
- `openMasterShopEdit()` 回填新计划字段
- `submitMasterShopEdit()` 改成调用 serializer
- 不再把堂食编辑逻辑塞进这次的计划面板里

- [ ] **Step 4: 再跑测试并做一次 master smoke check**

Run:
- `node --test src/lib/master-shop-edit-payload.test.ts`
- `pnpm dev`

Expected:
- 单测 PASS
- `/master?tab=management` 的编辑面板能看到两套覆盖项
- “恢复全局默认”只影响费率输入

- [ ] **Step 5: 提交**

```bash
git add src/lib/master-shop-edit-payload.ts src/lib/master-shop-edit-payload.test.ts src/components/master/MasterShopEditPanel.astro src/pages/master/index.astro
git commit -m "feat(master): add split fee overrides to shop editor"
```

---

## Task 4: 更新 master 店铺视图、列表和详情

**Files:**
- Modify: `src/lib/master-shop-view.ts`
- Modify: `src/lib/master-shop-view.test.ts`
- Modify: `src/components/master/MasterShopManagementTable.astro`
- Modify: `src/pages/master/index.astro:1543-1564`

- [ ] **Step 1: 先写会失败的店铺视图测试**

在 `src/lib/master-shop-view.test.ts` 里补这些行为：
- 店铺的 `reservation_*` / `delivery_*` 覆盖全局默认
- 0 仍然是有效值
- `source` 能标出全局默认 / 店铺覆盖 / 旧字段回退
- 恢复默认后只改费率，不会把 `enabled` 抹掉

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/lib/master-shop-view.test.ts`

历史红灯预期：，因为 view model 还只认旧的单一提成字段。

- [ ] **Step 3: 实现最小的 view model 更新**

在 `src/lib/master-shop-view.ts` 里：
- 调用 Task 1 的共享 helper 解析预订 / 外卖两条计划
- 保留现有的堂食字段、余额字段和 row tone 逻辑
- 给 table / detail 面板输出 canonical `reservationPlan` / `deliveryPlan`

- [ ] **Step 4: 更新列表和详情展示**

在 `src/components/master/MasterShopManagementTable.astro` 里：
- 两条计划都要有明确状态
- 显示“全局默认 / 店铺覆盖”来源
- `0` 显示“免费”

在 `src/pages/master/index.astro:1543-1564` 的详情面板里：
- 去掉单一 `commissionRule = formatCommissionRule(...)`
- 改成展示两条计划各自的文案和来源
- 让详情口径和表格一致

- [ ] **Step 5: 再跑测试并做一次 master smoke check**

Run:
- `node --test src/lib/master-shop-view.test.ts`
- `pnpm dev`

Expected:
- 单测 PASS
- `/master?tab=management` 的表格和详情都能看到两条计划

- [ ] **Step 6: 提交**

```bash
git add src/lib/master-shop-view.ts src/lib/master-shop-view.test.ts src/components/master/MasterShopManagementTable.astro src/pages/master/index.astro
git commit -m "feat(master): surface split fee plans in shop views"
```

---

## Task 5: 改 admin 页面和 renewal card 的文案与展示

**Files:**
- Create: `src/lib/admin-order-channel-billing-view.ts`
- Create: `src/lib/admin-order-channel-billing-view.test.ts`
- Modify: `src/pages/admin/[slug]/index.astro:84-417`
- Modify: `src/components/admin/TabRenew.astro:1-126`

- [ ] **Step 1: 先写会失败的 admin 显示测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminOrderChannelBillingView } from './admin-order-channel-billing-view.ts';

test('admin view shows current values and no monthly charge copy', () => {
  const view = buildAdminOrderChannelBillingView({
    billingBalanceRsd: 1800,
    reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 0 },
    deliveryPlan: { enabled: true, commissionType: 'percentage', commissionValue: 5 },
  });

  assert.equal(view.walletCopy.includes('每月1号'), false);
  assert.equal(view.reservationPlan.displayText, '免费');
  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.balanceReminderKind, 'normal');
});
```

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/lib/admin-order-channel-billing-view.test.ts`

历史红灯预期：，因为 admin view helper 还不存在。

- [ ] **Step 3: 实现最小代码让测试变绿**

在 `src/lib/admin-order-channel-billing-view.ts` 里实现：
- 基于 `buildOrderChannelFeePlan()` 和 `buildMasterSettingsView()` 生成 admin 用 display model
- 余额提醒仍然保留，但它只代表余额，不再暗示月扣费
- `0` 和免费态要明确显示出来
- 不输出 `每月1号` / `下次扣费日` 这种旧文案

在 `src/pages/admin/[slug]/index.astro` 里：
- 用新 helper 替换旧的 `billingPlanType` / `billingNextChargeDate` 文案拼接
- 继续保留余额不足提醒
- 删除老的“下次扣费日”区域

在 `src/components/admin/TabRenew.astro` 里：
- 顶层文案改成“预订 / 外卖余额”
- 分开显示预订和外卖计划
- 0 显示“免费”
- 不再出现“每月 1 号自动扣费”

- [ ] **Step 4: 再跑测试并做一次 admin smoke check**

Run:
- `node --test src/lib/admin-order-channel-billing-view.test.ts`
- `pnpm dev`

Expected:
- 单测 PASS
- `/admin/01` 不再出现旧月扣费文案
- 钱包卡只表达预订 / 外卖技术服务费余额

- [ ] **Step 5: 提交**

```bash
git add src/lib/admin-order-channel-billing-view.ts src/lib/admin-order-channel-billing-view.test.ts src/pages/admin/[slug]/index.astro src/components/admin/TabRenew.astro
git commit -m "feat(admin): remove legacy monthly billing copy"
```

---

## Task 6: 最终验证

**Files:**
- (无代码变更)

- [ ] **Step 1: 跑所有相关单测**

Run:

```bash
node --test src/lib/order-channel-fees-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-commission-view.test.ts src/lib/master-pricing-settings-payload.test.ts src/lib/master-shop-edit-payload.test.ts src/lib/master-shop-view.test.ts src/lib/admin-order-channel-billing-view.test.ts
```

Expected: PASS。

- [ ] **Step 2: 跑项目级检查**

Run:

```bash
pnpm build
pnpm run test:security
```

Expected: 两个命令都成功退出。

- [ ] **Step 3: 做最后一次手动冒烟**

Run `pnpm dev`，再看这几个页面：
- `/master?tab=settings`
- `/master?tab=management`
- `/admin/01`

确认：
- 预订 / 外卖是两条独立计划
- 0 显示为“免费”
- “恢复全局默认”只重置费率，不改启用状态
- admin 页面没有旧的月扣费文案

- [ ] **Step 4: 如果冒烟时发现 payload 名称不匹配，只修最小的 helper**

优先修 `src/lib/master-pricing-settings-payload.ts` 或 `src/lib/master-shop-edit-payload.ts`，不要回头改 proxy 路由。
如果最后还需要补一个小修复，就单独做一个新 commit，不要把前面任务的提交揉在一起。

---

## Notes / Guardrails

- helper 保持纯净，日期 / 默认值 / free 文案都放 helper 里，不要散落在 Astro 页面里。
- 不要改堂食年费流程，这次只动预订 / 外卖技术服务费。
- 不要碰 `src/pages/api/master/settings.ts` 和 `src/pages/api/master/shops/[id].ts`，它们只是透传。
- 如果某个页面还在说旧月费口径，先抽出最小 helper 再修，不要顺手重构整个页面。
