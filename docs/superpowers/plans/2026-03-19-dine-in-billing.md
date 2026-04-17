# 堂食订阅到期与余额分离 Implementation Plan

> 状态说明（历史计划）：这份计划记录的是堂食订阅与余额分离时的实施步骤，文中的 `历史红灯预期：` 属于当时的测试红灯预期，不应再被直接视作当前实现状态。
> 若继续处理堂食订阅、提醒或续期语义，请先以当前 helper、页面和最新业务口径为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将堂食订阅从钱包余额中拆分出来，统一 admin/master 的到期展示、提醒和续期操作，并保留现有余额只用于预订/外卖。

**Architecture:** 把堂食日期边界和状态判定收敛到一个纯 helper `src/lib/dine-in-billing.ts`，让 master 列表和 admin 页面都用同一套规则算黄色 / 红色 / 自动关闭，避免两边口径漂移。master 侧新增一个专门的堂食订阅面板来处理延长、手动停用和自定义到期日；现有余额充值保持不变，`shop-renew` 继续作为 JSON passthrough 负责订阅动作。

**Tech Stack:** Astro、TypeScript、node:test、pnpm、页面内联脚本（master 页）

---

## File Structure & Responsibilities

**Create (shared helper + tests):**
- `src/lib/dine-in-billing.ts`
  - 统一处理：自然日边界、下个月 1 号起算、12 个月续期、5 天黄色提醒、宽限期红色提醒、自动关闭、手动停用优先级。
- `src/lib/dine-in-billing.test.ts`
  - 锁定日期边界、兼容回退和状态优先级。

**Modify (shared types):**
- `src/types/index.ts`
  - 给 `Shop` 补上堂食订阅相关可选字段，方便 helper 和现有代码共用类型。

**Modify (master view model + list):**
- `src/lib/master-shop-view.ts`
  - 消费 helper，输出 `dineIn*` 字段、状态标签、提醒级别和行高亮所需字段。
- `src/lib/master-shop-view.test.ts`
  - 扩展用例，覆盖新字段、fallback、状态优先级和 row tone。
- `src/components/master/MasterShopManagementTable.astro`
  - 新增堂食订阅列、状态徽标、风险高亮、打开订阅面板按钮。

**Create (master subscription panel):**
- `src/components/master/MasterShopDineInPanel.astro`
  - 专门管理堂食订阅：展示当前到期/宽限/状态，支持默认延长一年、自定义到期日、手动停用/恢复。

**Modify (master page wiring):**
- `src/pages/master/index.astro`
  - 导入并渲染新面板，增加打开/提交 handler，使用现有 `shopViewsData` 回填表单。

**Modify (admin visible reminder + copy):**
- `src/pages/admin/[slug]/index.astro`
  - 在顶部摘要区加入堂食订阅提示卡，显示到期、宽限、状态和颜色提醒。
- `src/components/admin/TabRenew.astro`
  - 把“钱包余额”文案改成更明确的“预订 / 外卖余额”，并明确堂食年费不包含在余额里。

**Not touching unless smoke tests expose a bug:**
- `src/pages/api/master/shop-renew.ts`
  - 现有 passthrough 已经能转发任意 JSON body；先保持不动，避免把简单代理改复杂。
- `src/pages/[slug]/index.astro`、`src/lib/admin-service.ts`
  - 公共 storefront 的堂食开关仍由 upstream 的 `enable_dine_in` 决定，这次不扩散到公共页。

---

## Task 1: Build the shared dine-in billing helper

**Files:**
- Create: `src/lib/dine-in-billing.ts`
- Create: `src/lib/dine-in-billing.test.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Write failing tests first**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDineInBillingState, getNextDineInBillingStart } from './dine-in-billing.ts';

test('next billing start always lands on the next month 1st', () => {
  assert.equal(getNextDineInBillingStart('2027-02-15'), '2027-03-01');
  assert.equal(getNextDineInBillingStart('2027-01-01'), '2027-02-01');
  assert.equal(getNextDineInBillingStart('2027-12-31'), '2028-01-01');
});

test('warning starts when remaining days are <= 5', () => {
  const state = buildDineInBillingState({
    enable_dine_in: 1,
    dine_in_expires_at: '2027-03-01',
    dine_in_grace_until: '2027-03-06',
  }, '2027-02-24');

  assert.equal(state.alertLevel, 'warning');
  assert.equal(state.statusLabel, '即将到期');
});

test('red state lasts through grace day and auto-closes the next day', () => {
  const overdue = buildDineInBillingState({
    enable_dine_in: 1,
    dine_in_expires_at: '2027-03-01',
    dine_in_grace_until: '2027-03-06',
  }, '2027-03-06');
  const autoClosed = buildDineInBillingState({
    enable_dine_in: 1,
    dine_in_expires_at: '2027-03-01',
    dine_in_grace_until: '2027-03-06',
  }, '2027-03-07');

  assert.equal(overdue.alertLevel, 'overdue');
  assert.equal(autoClosed.alertLevel, 'auto_closed');
  assert.equal(autoClosed.statusLabel, '已自动关闭');
});

test('manual stop overrides date reminders', () => {
  const state = buildDineInBillingState({
    enable_dine_in: 0,
    dine_in_stop_reason: 'manual',
    dine_in_expires_at: '2027-03-01',
  }, '2027-02-24');

  assert.equal(state.alertLevel, 'stopped');
  assert.equal(state.statusLabel, '已停用');
});

test('legacy expire_date still works as fallback', () => {
  const state = buildDineInBillingState({
    enable_dine_in: 1,
    expire_date: '2027-03-01',
  }, '2027-02-24');

  assert.equal(state.statusLabel, '即将到期');
  assert.equal(state.expiresAt, '2027-03-01');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/dine-in-billing.test.ts`

历史红灯预期： because the helper does not exist yet.

- [ ] **Step 3: Implement the minimal helper**

Add a pure helper that:
- normalizes dates in the business timezone (use the same natural-day reasoning as the existing Belgrade table-time logic)
- computes next month 1st start date
- computes `expiresAt`, `graceUntil`, `alertLevel`, `statusLabel`, `rowTone`
- gives manual stop higher priority than date-driven reminders
- falls back to `expire_date` if the new dine-in fields are missing

- [ ] **Step 4: Re-run the test and confirm it passes**

Run: `node --test src/lib/dine-in-billing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/dine-in-billing.ts src/lib/dine-in-billing.test.ts
git commit -m "feat(dine-in): add shared billing state helper"
```

---

## Task 2: Thread dine-in state through the master view model and table

**Files:**
- Modify: `src/lib/master-shop-view.ts`
- Modify: `src/lib/master-shop-view.test.ts`
- Modify: `src/components/master/MasterShopManagementTable.astro`

- [ ] **Step 1: Add failing tests for the new view fields**

Extend `src/lib/master-shop-view.test.ts` with cases that assert:
- `dineInStatusLabel` / `dineInAlertLevel` / `dineInExpiresAt` / `dineInGraceUntil` are exposed
- active rows still keep legacy wallet billing data
- a warning/overdue dine-in shop gets the expected row tone
- `expire_date` fallback still works when new fields are absent

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`

历史红灯预期： because the new fields are not wired through yet.

- [ ] **Step 3: Implement the view model update**

In `src/lib/master-shop-view.ts`:
- import the new shared helper
- derive dine-in fields from the raw shop record
- keep legacy wallet fields intact (`billingLabel`, `billingSeverity`, `balanceRsd`)
- add a separate dine-in row tone so the table can highlight subscription expiry without overwriting wallet semantics
- preserve `expire_date` fallback compatibility until upstream data lands everywhere

- [ ] **Step 4: Update the master shop table to surface the new status**

In `src/components/master/MasterShopManagementTable.astro`:
- add a new column for “堂食订阅 / 到期”
- render the new dine-in status label and dates
- use the dine-in tone for row highlighting when it is warning/overdue/closed
- keep the existing wallet balance and today stats columns unchanged
- add a “堂食订阅” action button that opens the dedicated panel from Task 3
- if needed, relabel the sort dropdown from “账单风险优先” to a broader “风险优先” so yellow/red dine-in rows surface first

- [ ] **Step 5: Re-run the unit test and a quick smoke check**

Run:
- `node --test src/lib/master-shop-view.test.ts`
- `pnpm dev`

Expected:
- unit tests PASS
- master list renders the new column and row tone without breaking existing filters/actions

- [ ] **Step 6: Commit**

```bash
git add src/lib/master-shop-view.ts src/lib/master-shop-view.test.ts src/components/master/MasterShopManagementTable.astro
git commit -m "feat(master): surface dine-in subscription status"
```

---

## Task 3: Add a dedicated master dine-in subscription panel and handlers

**Files:**
- Create: `src/components/master/MasterShopDineInPanel.astro`
- Modify: `src/pages/master/index.astro`

- [ ] **Step 1: Create the new panel with failing expectations in mind**

The panel should show:
- current status label
- billing start date
- expiry date
- grace cutoff
- current enabled/disabled state
- one primary action for “默认延长一年”
- one secondary action for “自定义到期日”
- one danger action for “手动停用”
- one recovery action for “恢复启用”

Use a dedicated panel instead of stuffing these controls into `MasterShopEditPanel.astro`; that keeps general shop metadata editing separate from subscription management.

- [ ] **Step 2: Wire the master page to open and populate the panel**

In `src/pages/master/index.astro`:
- import the new panel next to the existing topup/edit panels
- add `window.openMasterShopDineIn(shopId)` to populate the panel from `shopViewsData`
- populate all date/status fields from the current view model
- add `window.submitMasterShopDineIn(form, action)` to post JSON to `/api/master/shop-renew`
- keep `src/pages/api/master/shop-renew.ts` as a passthrough; do not rework the route unless a smoke test proves the proxy itself is insufficient

Suggested payload shape from the UI:
- extend one year: `{ shopId, action: 'extend_one_year' }`
- custom date: `{ shopId, action: 'set_expiry', expiresAt: 'YYYY-MM-DD' }`
- manual stop: `{ shopId, action: 'manual_stop' }`
- restore: `{ shopId, action: 'restore' }`

- [ ] **Step 3: Add the table action button and panel open flow**

Make the new “堂食订阅” button in `MasterShopManagementTable.astro` call the new open handler and keep the existing edit/topup actions untouched.

- [ ] **Step 4: Smoke test in the browser**

Run: `pnpm dev`

Check:
- `/master?tab=management` opens
- the new “堂食订阅” panel opens from a row button
- current status/date values are filled in
- the extend/custom/stop/restore buttons submit without breaking the page

- [ ] **Step 5: Commit**

```bash
git add src/components/master/MasterShopDineInPanel.astro src/pages/master/index.astro src/components/master/MasterShopManagementTable.astro
git commit -m "feat(master): add dine-in subscription management panel"
```

---

## Task 4: Add admin-facing dine-in reminder and clarify balance wording

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro`
- Modify: `src/components/admin/TabRenew.astro`

- [ ] **Step 1: Add the admin reminder card design**

In the top summary area of `src/pages/admin/[slug]/index.astro`:
- import and use the shared dine-in helper from Task 1
- render a dedicated card for `堂食订阅`
- show status, billing start, expiry, grace cutoff, and stop reason
- use yellow for `warning`, red for `overdue`, and a neutral closed state for `stopped` / `auto_closed`
- keep the existing wallet billing card separate so the balance is not visually conflated with the annual subscription

- [ ] **Step 2: Update the wallet copy in TabRenew**

In `src/components/admin/TabRenew.astro`:
- rename the wallet card copy to make it explicit that the value is only for `预订 / 外卖`
- add short explanatory text that the annual dine-in fee is a separate time-based subscription
- do not show any dine-in fee amount in this card

- [ ] **Step 3: Manual smoke check**

Run: `pnpm dev`

Check:
- `/admin/<slug>` shows the new dine-in card
- yellow/red states are visually obvious
- the renewal tab now clearly says the wallet is for booking/delivery only

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/[slug]/index.astro src/components/admin/TabRenew.astro
git commit -m "feat(admin): show dine-in subscription reminders"
```

---

## Task 5: Final verification

**Files:**
- (No code changes)

- [ ] **Step 1: Run the focused unit tests**

Run:

```bash
node --test src/lib/dine-in-billing.test.ts src/lib/master-shop-view.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the project verification gates**

Run:

```bash
pnpm build
pnpm run test:security
```

Expected: both exit successfully.

- [ ] **Step 3: Do a final browser smoke pass**

Run `pnpm dev` and verify:
- master list shows the new dine-in column and row highlights
- master panel can open / extend / custom / stop / restore
- admin page shows the dine-in reminder card
- wallet balance wording is now explicit

- [ ] **Step 4: If any upstream payload mismatch appears, adjust only the smallest affected handler**

If a payload name or route contract mismatch shows up during smoke testing, fix the front-end handler or the shared helper only. Do not expand scope into unrelated storefront or billing code.

---

## Notes / Guardrails

- Keep the new helper pure and testable; the date math should live there, not in the Astro page inline scripts.
- Do not move wallet topup logic into the dine-in flow.
- Do not touch the public storefront unless a smoke test proves the fallback path is broken.
- Favor small commits after each task so the new billing logic can be rolled back independently if needed.
