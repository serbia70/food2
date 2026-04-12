# Rider Pickup ETA And Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a delivery dispatch flow where admin chooses a pickup ETA before notifying riders, riders see and claim `awaiting_courier` orders, unclaimed orders surface reminder/contact state, and Telegram becomes the primary external notification channel.

**Architecture:** Keep the existing Astro + browser-script structure, but move new decision logic into small pure helpers so the UI changes stay thin. Treat `awaiting_courier` as the only rider-claimable pre-delivery state, enrich order records with structured pickup/reminder fields, and route Telegram through a small adapter so deep-link notifications land first and direct Telegram claim can be added without rewriting dispatch logic.

**Tech Stack:** Astro, TypeScript, existing `/api/**` proxy routes, browser-side admin/rider scripts, Node test runner (`node --test`)

---

## File Structure

- Modify: `src/types/index.ts`
  - Extend `Order` and `Rider` types with pickup ETA, reminder, and Telegram binding fields used across admin/rider flows.
- Create: `src/lib/rider-dispatch.ts`
  - Pure helpers for status guards, ETA labels, reminder state, rider filtering, Telegram recipient selection, and deep-link payload formatting.
- Create: `src/lib/rider-dispatch-spec.ts`
  - Unit tests for the new dispatch helpers.
- Create: `src/lib/telegram-dispatch.ts`
  - Telegram message builders, deep-link/callback payload helpers, and channel selection logic.
- Create: `src/lib/telegram-dispatch-spec.ts`
  - Unit tests for Telegram message formatting and callback/deep-link generation.
- Modify: `src/pages/admin/[slug]/index.astro`
  - Normalize new order fields from backend data so downstream UI receives typed values.
- Modify: `src/components/admin/TabOrders.astro`
  - Show new state badges, ETA text, reminder counts, and contact-rider entry point.
- Modify: `src/scripts/admin/order-actions.ts`
  - Replace old direct “送餐→delivering” behavior with ETA modal submit and dispatch publish flow.
- Modify: `src/scripts/admin/orders.ts`
  - Pass structured dispatch payload to the admin status route and refresh state cleanly after publish/remind/contact actions.
- Create: `src/pages/api/admin/rider-dispatch.ts`
  - Proxy publish/remind/contact actions to the backend-facing API endpoint for rider dispatch.
- Modify: `src/pages/api/rider/orders.ts`
  - Support rider dashboard fetches that include only rider-visible dispatch orders.
- Modify: `src/pages/api/rider/status.ts`
  - Support querying currently available riders for admin contact UI if the backend endpoint already exists; otherwise proxy a new list action.
- Modify: `src/pages/rider/dashboard.astro`
  - Render `awaiting_courier` cards with ETA-first UI, sound/highlight handling, deep-link entry, and optimistic claim refresh.
- Create: `src/pages/api/telegram/rider-claim.ts`
  - Verify Telegram callback payloads and forward claim requests into the same claim flow used by the rider dashboard.

## Task 1: 建立调度领域模型与纯函数

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/rider-dispatch.ts`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: 先写失败测试，固定状态与 ETA 规则**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPickupEtaLabel,
  isAwaitingCourierOrder,
  isRiderClaimableOrder,
  pickAvailableRiders,
} from './rider-dispatch';

test('formatPickupEtaLabel returns compact admin/rider copy', () => {
  assert.equal(formatPickupEtaLabel(15), '约 15 分钟后可取');
  assert.equal(formatPickupEtaLabel(0), '');
});

test('isRiderClaimableOrder only accepts awaiting_courier without courier_phone', () => {
  assert.equal(isRiderClaimableOrder({ status: 'awaiting_courier', courier_phone: '' }), true);
  assert.equal(isRiderClaimableOrder({ status: 'pending', courier_phone: '' }), false);
  assert.equal(isRiderClaimableOrder({ status: 'awaiting_courier', courier_phone: '06123' }), false);
});

test('pickAvailableRiders only keeps available riders with phone', () => {
  const riders = [
    { id: 1, name: 'A', phone: '0601', status: 'available' },
    { id: 2, name: 'B', phone: '', status: 'available' },
    { id: 3, name: 'C', phone: '0603', status: 'busy' },
  ];
  assert.deepEqual(pickAvailableRiders(riders), [
    { id: 1, name: 'A', phone: '0601', status: 'available' },
  ]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: FAIL with module export errors because `src/lib/rider-dispatch.ts` does not exist yet.

- [ ] **Step 3: 扩展共享类型，先把新字段放到类型层**

```ts
export interface Order {
  id: number;
  order_no: string;
  restaurant_id: number;
  order_type: 'dine_in' | 'delivery';
  status:
    | 'pending'
    | 'confirmed'
    | 'awaiting_courier'
    | 'delivering'
    | 'completed'
    | 'cancelled'
    | 'review_needed'
    | 'archived';
  total_amount: number;
  items_json: string;
  user_phone?: string;
  courier_name?: string;
  courier_phone?: string;
  pickup_eta_minutes?: number;
  pickup_ready_at?: string;
  rider_broadcasted_at?: string;
  rider_remind_count?: number;
  rider_last_reminded_at?: string;
  rider_contact_attempted_at?: string;
}

export interface Rider {
  id: number;
  name: string;
  phone: string;
  status: 'offline' | 'available' | 'busy';
  telegram_chat_id?: string;
  telegram_username?: string;
  telegram_group_enabled?: number;
  created_at: string;
}
```

- [ ] **Step 4: 写最小实现，让测试先通过**

```ts
import type { Rider } from '../types';

export function formatPickupEtaLabel(minutes: number | null | undefined): string {
  const value = Number(minutes || 0);
  return value > 0 ? `约 ${value} 分钟后可取` : '';
}

export function isAwaitingCourierOrder(order: { status?: string | null }): boolean {
  return String(order?.status || '') === 'awaiting_courier';
}

export function isRiderClaimableOrder(order: { status?: string | null; courier_phone?: string | null }): boolean {
  return isAwaitingCourierOrder(order) && !String(order?.courier_phone || '').trim();
}

export function pickAvailableRiders<T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'>>(riders: T[]): T[] {
  return riders.filter((rider) => rider.status === 'available' && String(rider.phone || '').trim() !== '');
}
```

- [ ] **Step 5: 再补 reminder/contact 规则测试，锁定后面 UI 依赖**

```ts
import { getReminderBadgeCopy, shouldEscalateUnclaimedOrder } from './rider-dispatch';

test('getReminderBadgeCopy formats reminder count', () => {
  assert.equal(getReminderBadgeCopy(0), '已提醒 0 次');
  assert.equal(getReminderBadgeCopy(2), '已提醒 2 次');
});

test('shouldEscalateUnclaimedOrder gates second reminder by timestamps', () => {
  assert.equal(
    shouldEscalateUnclaimedOrder({
      status: 'awaiting_courier',
      rider_broadcasted_at: '2026-03-29T10:00:00.000Z',
      rider_last_reminded_at: '',
    }, '2026-03-29T10:06:00.000Z', 5),
    true,
  );
  assert.equal(
    shouldEscalateUnclaimedOrder({
      status: 'awaiting_courier',
      rider_broadcasted_at: '2026-03-29T10:00:00.000Z',
      rider_last_reminded_at: '2026-03-29T10:04:00.000Z',
    }, '2026-03-29T10:06:00.000Z', 5),
    false,
  );
});
```

- [ ] **Step 6: 补实现并跑测试到通过**

```ts
function parseTimestamp(value: string | null | undefined): number {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

export function getReminderBadgeCopy(count: number | null | undefined): string {
  return `已提醒 ${Math.max(0, Number(count || 0))} 次`;
}

export function shouldEscalateUnclaimedOrder(
  order: {
    status?: string | null;
    rider_broadcasted_at?: string | null;
    rider_last_reminded_at?: string | null;
  },
  nowIso: string,
  remindAfterMinutes: number,
): boolean {
  if (!isAwaitingCourierOrder(order)) return false;
  const now = parseTimestamp(nowIso);
  const base = parseTimestamp(order.rider_last_reminded_at) || parseTimestamp(order.rider_broadcasted_at);
  return now > 0 && base > 0 && now - base >= remindAfterMinutes * 60_000;
}
```

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS

- [ ] **Step 7: 提交这一小步**

```bash
git add src/types/index.ts src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts
git commit -m "feat: add rider dispatch state helpers"
```

## Task 2: 让 admin 页读取并展示新调度字段

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro`
- Modify: `src/components/admin/TabOrders.astro`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: 先加视图层测试，锁定 badge 与 ETA 文案**

```ts
import { getAdminDispatchStatusCopy, formatPickupEtaLabel } from './rider-dispatch';

test('getAdminDispatchStatusCopy maps awaiting_courier correctly', () => {
  assert.equal(getAdminDispatchStatusCopy('awaiting_courier'), '待骑手接单');
  assert.equal(getAdminDispatchStatusCopy('delivering'), '配送中');
});

test('formatPickupEtaLabel still returns empty string for invalid input', () => {
  assert.equal(formatPickupEtaLabel(undefined), '');
});
```

- [ ] **Step 2: 跑测试确认新增断言失败**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: FAIL with `getAdminDispatchStatusCopy is not a function`.

- [ ] **Step 3: 在 helper 里补状态映射实现**

```ts
export function getAdminDispatchStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'awaiting_courier':
      return '待骑手接单';
    case 'delivering':
      return '配送中';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    case 'confirmed':
      return '已接单';
    default:
      return '待处理';
  }
}
```

- [ ] **Step 4: 在 admin page 归一化订单时读入结构化字段**

```ts
const orders = rawOrders.map((o: any) => ({
  ...o,
  id: Number(o?.id || 0),
  order_no: String(o?.order_no || o?.id || ''),
  order_type: String(o?.order_type || 'dine_in'),
  status: String(o?.status || 'pending'),
  total_amount: Number(o?.total_amount || 0),
  items_json: normalizeJSONString(o?.items_json, '{}'),
  remarks_json: normalizeRemarkJSONString(o?.remarks_json),
  table_info: String(o?.table_info || ''),
  user_phone: String(o?.user_phone || ''),
  scheduled_for: String(o?.scheduled_for || ''),
  pickup_eta_minutes: Number(o?.pickup_eta_minutes || 0),
  pickup_ready_at: String(o?.pickup_ready_at || ''),
  rider_broadcasted_at: String(o?.rider_broadcasted_at || ''),
  rider_remind_count: Number(o?.rider_remind_count || 0),
  rider_last_reminded_at: String(o?.rider_last_reminded_at || ''),
  rider_contact_attempted_at: String(o?.rider_contact_attempted_at || ''),
  courier_name: String(o?.courier_name || ''),
  courier_phone: String(o?.courier_phone || ''),
  created_at: String(o?.created_at || ''),
  is_deleted: Number(o?.is_deleted || 0),
}));
```

- [ ] **Step 5: 在 `TabOrders.astro` 插入 ETA / 提醒 / 联系入口展示**

```astro
---
import { formatPickupEtaLabel, getAdminDispatchStatusCopy, isAwaitingCourierOrder, getReminderBadgeCopy } from '../../lib/rider-dispatch';
---

{isAwaitingCourierOrder(o) && (
  <div class="order-address-row" style="margin-top:6px; color:#7c3aed; font-weight:700;">
    {formatPickupEtaLabel(o.pickup_eta_minutes)}
  </div>
)}

<span class={`status-tag status-${o.status || 'pending'}`}>
  {getAdminDispatchStatusCopy(o.status)}
</span>

{isAwaitingCourierOrder(o) && (
  <div class="order-address-row" style="margin-top:4px; color:#6b7280;">
    {getReminderBadgeCopy(o.rider_remind_count)}
  </div>
)}

{isAwaitingCourierOrder(o) && (
  <button
    class="btn-action"
    data-admin-action="contact-riders"
    data-order-id={o.id}
    title="联系骑手"
    style="height:24px; min-width:60px; font-size:12px;"
  >联系骑手</button>
)}
```

- [ ] **Step 6: 跑测试并手动 build 页面片段**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS

Run: `pnpm build`
Expected: PASS and Astro compiles updated admin page without import/type errors.

- [ ] **Step 7: 提交这一小步**

```bash
git add src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts src/pages/admin/[slug]/index.astro src/components/admin/TabOrders.astro
git commit -m "feat: show admin rider dispatch status"
```

## Task 3: 把“送餐”改成 ETA 发布流程

**Files:**
- Modify: `src/scripts/admin/order-actions.ts`
- Modify: `src/scripts/admin/orders.ts`
- Create: `src/pages/api/admin/rider-dispatch.ts`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: 先写 payload 纯函数测试，避免在 DOM 里堆逻辑**

```ts
import { buildDispatchPublishPayload } from './rider-dispatch';

test('buildDispatchPublishPayload stores awaiting_courier state and eta metadata', () => {
  const payload = buildDispatchPublishPayload(15, '2026-03-29T10:00:00.000Z');
  assert.deepEqual(payload, {
    status: 'awaiting_courier',
    pickup_eta_minutes: 15,
    pickup_ready_at: '2026-03-29T10:15:00.000Z',
    rider_broadcasted_at: '2026-03-29T10:00:00.000Z',
    rider_remind_count: 0,
    rider_last_reminded_at: '',
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: FAIL with missing export `buildDispatchPublishPayload`.

- [ ] **Step 3: 在 helper 中补 publish payload 实现**

```ts
export function buildDispatchPublishPayload(minutes: number, nowIso: string) {
  const safeMinutes = Number(minutes || 0);
  const readyAt = new Date(Date.parse(nowIso) + safeMinutes * 60_000).toISOString();
  return {
    status: 'awaiting_courier',
    pickup_eta_minutes: safeMinutes,
    pickup_ready_at: readyAt,
    rider_broadcasted_at: nowIso,
    rider_remind_count: 0,
    rider_last_reminded_at: '',
  };
}
```

- [ ] **Step 4: 在 admin actions 中把 confirmDelivery 改成 ETA 模式**

```ts
const DELIVERY_ETA_OPTIONS = [10, 15, 20, 30, 45];

export function openDeliveryModal(orderId: string) {
  const modal = document.getElementById('delivery-modal');
  const listEl = document.getElementById('driver-select-list');
  if (!modal || !listEl) return;
  modal.dataset.orderId = orderId;
  listEl.replaceChildren(
    ...DELIVERY_ETA_OPTIONS.map((minutes, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'driver-option';
      option.dataset.etaMinutes = String(minutes);
      option.textContent = `${minutes} 分钟`;
      option.addEventListener('click', () => {
        modal.dataset.etaMinutes = String(minutes);
        listEl.querySelectorAll('[data-eta-minutes]').forEach((node) => node.classList.remove('selected'));
        option.classList.add('selected');
      });
      if (index === 1) option.click();
      return option;
    }),
  );
  modal.style.display = 'flex';
}

export async function confirmDelivery() {
  const modal = document.getElementById('delivery-modal');
  if (!modal?.dataset.orderId) return;
  const etaMinutes = Number(modal.dataset.etaMinutes || 0);
  if (!etaMinutes) {
    showAdminToast('请选择预计取餐时间');
    return;
  }
  await publishRiderDispatch(modal.dataset.orderId, etaMinutes);
  closeDeliveryModal();
}
```

- [ ] **Step 5: 新增 admin dispatch API 代理并接到前端**

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const res = await fetch(`${API_BASE_URL}/api/admin/rider-dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
};
```

```ts
import { buildDispatchPublishPayload } from '../../lib/rider-dispatch';

export async function publishRiderDispatch(orderId: string, etaMinutes: number) {
  const payload = {
    orderId,
    action: 'publish',
    ...buildDispatchPublishPayload(etaMinutes, new Date().toISOString()),
  };
  const res = await fetch('/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'dispatch publish failed');
  if (window.showToast) window.showToast('已通知骑手');
  if (window.refreshOrderList) window.refreshOrderList();
}
```

- [ ] **Step 6: 跑测试与构建，确认发布流程无语法错误**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS

Run: `pnpm build`
Expected: PASS with new `/api/admin/rider-dispatch` route included.

- [ ] **Step 7: 提交这一小步**

```bash
git add src/lib/rider-dispatch.ts src/scripts/admin/order-actions.ts src/scripts/admin/orders.ts src/pages/api/admin/rider-dispatch.ts
git commit -m "feat: publish rider dispatch with pickup eta"
```

## Task 4: 升级骑手看板到 ETA-first 抢单视图

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/pages/api/rider/orders.ts`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: 先加 rider 过滤测试，锁定只显示待抢单**

```ts
import { filterRiderActiveOrders } from './rider-dispatch';

test('filterRiderActiveOrders keeps awaiting_courier and delivering cards in active tab', () => {
  const orders = [
    { id: 1, status: 'awaiting_courier', courier_phone: '' },
    { id: 2, status: 'delivering', courier_phone: '0601' },
    { id: 3, status: 'pending', courier_phone: '' },
    { id: 4, status: 'completed', courier_phone: '0601' },
  ];
  assert.deepEqual(
    filterRiderActiveOrders(orders).map((order) => order.id),
    [1, 2],
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: FAIL with missing export `filterRiderActiveOrders`.

- [ ] **Step 3: 在 helper 中补 rider 过滤实现**

```ts
export function filterRiderActiveOrders<T extends { status?: string | null; courier_phone?: string | null }>(orders: T[]): T[] {
  return orders.filter((order) => isRiderClaimableOrder(order) || String(order.status || '') === 'delivering');
}
```

- [ ] **Step 4: 修改 rider dashboard 渲染逻辑，突出 ETA 与新单提醒**

```ts
function renderOrders() {
  const container = document.getElementById('order-list');
  const visibleOrders = currentTab === 'active'
    ? allOrders.filter((o) => o.status === 'awaiting_courier' || o.status === 'delivering')
    : allOrders.filter((o) => o.status === 'completed');

  const cards = visibleOrders.map((o) => {
    const etaLabel = o.pickup_eta_minutes ? `约 ${o.pickup_eta_minutes} 分钟后可取` : '';
    const isClaimable = o.status === 'awaiting_courier' && !o.courier_phone;

    const card = document.createElement('div');
    card.className = `order-card status-${o.status}`;

    if (etaLabel) {
      const eta = document.createElement('div');
      eta.className = 'pickup-eta';
      eta.textContent = etaLabel;
      eta.style.fontSize = '18px';
      eta.style.fontWeight = '800';
      eta.style.color = '#7c3aed';
      card.appendChild(eta);
    }

    if (isClaimable) {
      const button = document.createElement('button');
      button.className = 'btn-action btn-complete';
      button.type = 'button';
      button.textContent = '🛵 接单配送';
      button.addEventListener('click', () => window.takeOrder(o.id));
      card.appendChild(button);
    }

    return card;
  });
  container.replaceChildren(...cards);
}
```

- [ ] **Step 5: 调整 claim API 使用新状态并处理并发失败**

```ts
window.takeOrder = async function(id) {
  if (!confirm('确认接这单并开始配送？')) return;
  try {
    const res = await fetch('/api/order/update_status', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        id,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: rider.name,
        courier_phone: rider.phone,
      }),
    });
    const data = await res.json();
    if (data.success) {
      loadOrders();
      return;
    }
    alert(data.error || '该订单已被其他骑手接单');
    loadOrders();
  } catch {
    alert('网络错误');
  }
};
```

- [ ] **Step 6: 跑测试与 build**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS

Run: `pnpm build`
Expected: PASS and rider dashboard compiles with new ETA/claim UI.

- [ ] **Step 7: 提交这一小步**

```bash
git add src/lib/rider-dispatch.ts src/pages/rider/dashboard.astro src/pages/api/rider/orders.ts
git commit -m "feat: show awaiting courier orders to riders"
```

## Task 5: 无人接单提醒与在线骑手联系入口

**Files:**
- Modify: `src/scripts/admin/orders.ts`
- Modify: `src/scripts/admin/order-actions.ts`
- Modify: `src/pages/api/rider/status.ts`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: 先写 available rider 列表与 reminder action 测试**

```ts
import { buildContactableRiderRows, buildReminderPayload } from './rider-dispatch';

test('buildContactableRiderRows keeps only available riders with contact info', () => {
  assert.deepEqual(
    buildContactableRiderRows([
      { id: 1, name: 'A', phone: '0601', status: 'available' },
      { id: 2, name: 'B', phone: '0602', status: 'busy' },
    ]),
    [{ id: 1, name: 'A', phone: '0601', status: 'available' }],
  );
});

test('buildReminderPayload increments reminder count and stamp', () => {
  assert.deepEqual(
    buildReminderPayload({ rider_remind_count: 1 }, '2026-03-29T10:10:00.000Z'),
    { rider_remind_count: 2, rider_last_reminded_at: '2026-03-29T10:10:00.000Z' },
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: FAIL with missing exports.

- [ ] **Step 3: 在 helper 中补实现**

```ts
export function buildContactableRiderRows<T extends { id: number; name: string; phone: string; status: string }>(riders: T[]): T[] {
  return riders.filter((rider) => rider.status === 'available' && String(rider.phone || '').trim() !== '');
}

export function buildReminderPayload(
  order: { rider_remind_count?: number | null },
  nowIso: string,
) {
  return {
    rider_remind_count: Math.max(0, Number(order.rider_remind_count || 0)) + 1,
    rider_last_reminded_at: nowIso,
  };
}
```

- [ ] **Step 4: 在 admin script 中接入“再次提醒”与“联系骑手”动作**

```ts
export async function remindRiders(orderId: string, order: { rider_remind_count?: number }) {
  const payload = {
    orderId,
    action: 'remind',
    ...buildReminderPayload(order, new Date().toISOString()),
  };
  const res = await fetch('/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'remind failed');
}

export async function openContactRiders(orderId: string) {
  const res = await fetch('/api/rider/status?action=list_available');
  const data = await res.json();
  const riders = buildContactableRiderRows(Array.isArray(data.riders) ? data.riders : []);
  showContactRidersModal(orderId, riders);
}
```

- [ ] **Step 5: 扩展 rider status API，代理 available rider 列表**

```ts
export const GET: APIRoute = async ({ url }) => {
  const action = String(url.searchParams.get('action') || '').trim();
  const query = action ? `?action=${encodeURIComponent(action)}` : '';
  const res = await fetch(`${API_BASE_URL}/api/rider/status${query}`, {
    method: 'GET',
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
};
```

- [ ] **Step 6: 跑测试与 build**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS

Run: `pnpm build`
Expected: PASS and status API compiles with GET + POST handlers.

- [ ] **Step 7: 提交这一小步**

```bash
git add src/lib/rider-dispatch.ts src/scripts/admin/orders.ts src/scripts/admin/order-actions.ts src/pages/api/rider/status.ts
git commit -m "feat: add rider reminder and contact actions"
```

## Task 6: 接入 Telegram 深链接通知

**Files:**
- Create: `src/lib/telegram-dispatch.ts`
- Create: `src/lib/telegram-dispatch-spec.ts`
- Modify: `src/pages/api/admin/rider-dispatch.ts`
- Test: `src/lib/telegram-dispatch-spec.ts`

- [ ] **Step 1: 先写 Telegram 消息构造测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTelegramDispatchMessage, buildTelegramDeepLink } from './telegram-dispatch';

test('buildTelegramDeepLink points rider back to dashboard order', () => {
  assert.equal(
    buildTelegramDeepLink('101', 88),
    '/rider/dashboard?orderId=88&restaurantId=101',
  );
});

test('buildTelegramDispatchMessage includes eta and action labels', () => {
  const message = buildTelegramDispatchMessage({
    shopName: '101 店',
    address: 'Main St 1',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    phone: '0601',
    dashboardLink: '/rider/dashboard?orderId=88&restaurantId=101',
  });
  assert.match(message.text, /101 店有新单/);
  assert.match(message.text, /约 15 分钟后可取/);
  assert.equal(message.replyMarkup.inline_keyboard[0][0].text, '查看并接单');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: FAIL because `src/lib/telegram-dispatch.ts` does not exist.

- [ ] **Step 3: 写最小 Telegram 深链接实现**

```ts
interface TelegramDispatchInput {
  shopName: string;
  address: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  phone: string;
  dashboardLink: string;
}

export function buildTelegramDeepLink(restaurantId: string, orderId: number | string): string {
  return `/rider/dashboard?orderId=${encodeURIComponent(String(orderId))}&restaurantId=${encodeURIComponent(restaurantId)}`;
}

export function buildTelegramDispatchMessage(input: TelegramDispatchInput) {
  return {
    text: [
      `${input.shopName}有新单`,
      `约 ${input.pickupEtaMinutes} 分钟后可取`,
      `地址：${input.address}`,
      `金额：${input.totalAmount} RSD`,
      `联系电话：${input.phone}`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [[
        { text: '查看并接单', url: input.dashboardLink },
        { text: '联系门店', url: `tel:${input.phone}` },
      ]],
    },
  };
}
```

- [ ] **Step 4: 在 admin dispatch API 中调用 Telegram adapter，不阻断主流程**

```ts
import { buildTelegramDeepLink, buildTelegramDispatchMessage } from '../../../lib/telegram-dispatch';

async function notifyTelegramRecipients(order: any, riders: Array<{ telegram_chat_id?: string }>) {
  const dashboardLink = buildTelegramDeepLink(String(order.shop_slug || order.restaurant_slug || ''), order.id);
  const message = buildTelegramDispatchMessage({
    shopName: String(order.shop_name || order.restaurant_name || '店铺'),
    address: String(order.table_info || ''),
    totalAmount: Number(order.total_amount || 0),
    pickupEtaMinutes: Number(order.pickup_eta_minutes || 0),
    phone: String(order.user_phone || ''),
    dashboardLink,
  });

  const results = await Promise.allSettled(
    riders
      .filter((rider) => String(rider.telegram_chat_id || '').trim() !== '')
      .map((rider) =>
        fetch(`${API_BASE_URL}/api/telegram/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: rider.telegram_chat_id, ...message }),
        }),
      ),
  );

  return results.some((result) => result.status === 'rejected')
    ? { success: false, error: 'telegram send failed' }
    : { success: true };
}
```

- [ ] **Step 5: 跑 Telegram 单测与 build**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: PASS

Run: `pnpm build`
Expected: PASS and no type/import errors from Telegram adapter wiring.

- [ ] **Step 6: 提交这一小步**

```bash
git add src/lib/telegram-dispatch.ts src/lib/telegram-dispatch-spec.ts src/pages/api/admin/rider-dispatch.ts
git commit -m "feat: send rider dispatch telegram deep links"
```

## Task 7: 增加 Telegram 内直接接单回调

**Files:**
- Modify: `src/lib/telegram-dispatch.ts`
- Create: `src/pages/api/telegram/rider-claim.ts`
- Modify: `src/pages/rider/dashboard.astro`
- Test: `src/lib/telegram-dispatch-spec.ts`

- [ ] **Step 1: 先写 callback payload 测试，固定第二阶段按钮格式**

```ts
import { buildTelegramClaimCallback, parseTelegramClaimCallback } from './telegram-dispatch';

test('telegram claim callback round-trips order and rider identity', () => {
  const encoded = buildTelegramClaimCallback({ orderId: 88, riderId: 3, restaurantId: '101' });
  assert.deepEqual(parseTelegramClaimCallback(encoded), { orderId: 88, riderId: 3, restaurantId: '101' });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: FAIL with missing callback helpers.

- [ ] **Step 3: 在 Telegram helper 中增加 callback 编解码与按钮**

```ts
interface TelegramClaimCallback {
  orderId: number;
  riderId: number;
  restaurantId: string;
}

export function buildTelegramClaimCallback(input: TelegramClaimCallback): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

export function parseTelegramClaimCallback(payload: string): TelegramClaimCallback {
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TelegramClaimCallback;
}
```

```ts
const callbackData = buildTelegramClaimCallback({ orderId: 88, riderId: 3, restaurantId: '101' });
const directClaimButton = { text: '立即接单', callback_data: callbackData };
```

- [ ] **Step 4: 新增 Telegram claim API，走和 rider dashboard 一样的占单校验**

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { parseTelegramClaimCallback } from '../../../lib/telegram-dispatch';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { callback_data } = body;
  const callback = parseTelegramClaimCallback(String(callback_data || ''));

  const res = await fetch(`${API_BASE_URL}/api/order/update_status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: callback.orderId,
      expected_current_status: 'awaiting_courier',
      status: 'delivering',
      rider_id: callback.riderId,
      source: 'telegram',
    }),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 5: 把 Telegram 直接接单结果反馈回 rider dashboard 深链接页**

```ts
function showDeepLinkToast(message) {
  const banner = document.createElement('div');
  banner.className = 'telegram-claim-banner';
  banner.textContent = message;
  document.body.prepend(banner);
}

const deepLinkOrderId = new URL(location.href).searchParams.get('orderId');
if (deepLinkOrderId) {
  showDeepLinkToast(`正在定位订单 #${deepLinkOrderId}`);
}
```

- [ ] **Step 6: 跑测试与 build**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: PASS

Run: `pnpm build`
Expected: PASS and new Telegram claim API compiles.

- [ ] **Step 7: 提交这一小步**

```bash
git add src/lib/telegram-dispatch.ts src/lib/telegram-dispatch-spec.ts src/pages/api/telegram/rider-claim.ts src/pages/rider/dashboard.astro
git commit -m "feat: support telegram rider claim callbacks"
```

## Task 8: 端到端回归验证

**Files:**
- Modify: `docs/superpowers/specs/2026-03-29-rider-pickup-eta-and-notifications-design.md`（仅当实现中发现必须回写的设计差异时）
- Test: `src/lib/rider-dispatch-spec.ts`
- Test: `src/lib/telegram-dispatch-spec.ts`

- [ ] **Step 1: 跑 dispatch 与 Telegram 单测**

Run: `node --test src/lib/rider-dispatch-spec.ts src/lib/telegram-dispatch-spec.ts`
Expected: PASS

- [ ] **Step 2: 跑项目构建**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: 跑安全测试，确认新增 API/DOM 改动没有破坏现有安全断言**

Run: `pnpm run test:security`
Expected: PASS

- [ ] **Step 4: 手动回归 admin → rider → Telegram 主链路**

```text
1. 打开 /admin/101，任选外卖订单点击“送餐”
2. 选择 15 分钟并确认，订单卡应显示“待骑手接单 / 约 15 分钟后可取 / 已提醒 0 次”
3. 打开 /rider/dashboard，确认该订单出现在 active 列表顶部并显示 ETA
4. 点击“接单配送”，订单应变为 delivering，并从其他骑手端消失
5. 重新发布另一单，不接单，等待提醒窗口后确认 admin 卡显示提醒次数增加
6. 检查 Telegram 个人消息是否收到“查看并接单 / 联系门店”按钮
7. 点击 Telegram 深链接，确认能回到 rider dashboard 定位订单
8. 若第二阶段已启用，点击 Telegram “立即接单”，确认只有首个请求成功
```

Expected: 所有状态流转符合 spec；Telegram 失败不阻断 admin 发布成功；抢单冲突时能得到明确提示。

- [ ] **Step 5: 最终提交**

```bash
git add src/types/index.ts src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts src/lib/telegram-dispatch.ts src/lib/telegram-dispatch-spec.ts src/pages/admin/[slug]/index.astro src/components/admin/TabOrders.astro src/scripts/admin/order-actions.ts src/scripts/admin/orders.ts src/pages/api/admin/rider-dispatch.ts src/pages/api/rider/orders.ts src/pages/api/rider/status.ts src/pages/rider/dashboard.astro src/pages/api/telegram/rider-claim.ts
git commit -m "feat: add rider pickup eta dispatch flow"
```

## Self-Review

- **Spec coverage:**
  - `awaiting_courier` 状态、ETA 字段、admin 展示：Task 1-3
  - rider ETA-first 抢单：Task 4
  - 二次提醒、联系在线空闲骑手：Task 5
  - Telegram 个人主通知、群补充思路、深链接接单：Task 6
  - Telegram 直接接单第二阶段：Task 7
  - 全链路验证：Task 8
- **Placeholder scan:** 没有 `TBD` / `TODO` / “similar to” / 空泛“加异常处理”语句；每个代码步骤都给了具体代码或命令。
- **Type consistency:** 全文统一使用 `awaiting_courier`、`pickup_eta_minutes`、`rider_remind_count`、`telegram_chat_id`、`expected_current_status`，没有中途改名。
