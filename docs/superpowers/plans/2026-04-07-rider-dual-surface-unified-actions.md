# Rider Dual-Surface Unified Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 rider dashboard 与 Telegram 共用同一套“接单 / 暂不接单 / 送餐完成”动作语义，同时统一派单文案并把 rider dashboard 调整为简洁商务风。

**Architecture:** 先把派单状态文案和动作可见性收口到共享 helper，再分别驱动 Telegram 消息构建、Telegram callback、rider dashboard 展示与操作。保持现有后端状态机 `awaiting_courier -> delivering -> completed` 不变，拒单继续写入 `dispatch_meta` 作为辅助反馈而不是新业务状态。

**Tech Stack:** Astro, TypeScript, Node test runner, existing Telegram callback flow, existing rider-dispatch helpers.

---

## File Map

- Modify: `src/lib/rider-dispatch.ts`
  - 收口统一状态文案、双端动作判断、rider 侧按钮可见性 helper
- Modify: `src/lib/rider-dispatch-spec.ts`
  - 为统一文案与动作规则补共享红灯
- Modify: `src/lib/telegram-dispatch.ts`
  - 为 Telegram 阶段 1/阶段 2 消息构建补统一按钮逻辑
- Modify: `src/lib/telegram-dispatch-spec.ts`
  - 锁定 Telegram 初始消息与接单后完成消息结构
- Modify: `src/pages/api/telegram/rider-claim.ts`
  - 接单成功后触发“配送中 / 送餐完成”消息；拒单继续沿用现有反馈持久化
- Modify: `src/lib/telegram-rider-claim-route-spec.ts`
  - 锁定接单、拒单、完成消息链路
- Modify: `src/pages/rider/dashboard.astro`
  - 使用共享动作规则展示待接单池 / 我的配送，补“暂不接单”按钮，并做简洁商务风重排
- Modify: `src/tests/pages/rider-dashboard-canonical.test.ts`
  - 锁定 rider dashboard 的按钮与文案源
- Modify: `src/components/admin/TabOrders.astro`
  - 改成统一文案 helper，保持拒单反馈辅助展示
- Modify: `src/components/admin/TabTables.astro`
  - 改成统一文案 helper，保持拒单反馈辅助展示
- Modify: `src/tests/pages/admin/tab-orders-rider-feedback.test.ts`
  - 锁定 admin 订单列表文案统一与反馈展示
- Modify: `src/tests/pages/admin/tab-tables-rider-status-copy.test.ts`
  - 锁定 admin 外卖卡片文案统一与反馈展示

---

### Task 1: 收口共享派单文案与动作规则

**Files:**
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('dispatch copy and action visibility stay unified across rider/admin surfaces', () => {
  assert.equal(getAdminDispatchStatusCopy('awaiting_courier'), '待骑手接单');
  assert.equal(getAdminDispatchStatusCopy('delivering'), '配送中');
  assert.equal(getAdminDispatchStatusCopy('completed'), '已完成');

  assert.deepEqual(getRiderActionFlags({ status: 'awaiting_courier', courierPhone: '' }, '0611'), {
    canAccept: true,
    canDecline: true,
    canComplete: false,
  });

  assert.deepEqual(getRiderActionFlags({ status: 'delivering', courierPhone: '0611' }, '0611'), {
    canAccept: false,
    canDecline: false,
    canComplete: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: FAIL，提示 `getRiderActionFlags` 未定义或断言不满足。

- [ ] **Step 3: Write minimal implementation**

```ts
export function getRiderActionFlags(
  order: { status?: string | null; courierPhone?: string | null; courier_phone?: string | null },
  riderPhone?: string | null,
) {
  const status = String(order?.status || '').trim();
  const phone = String(riderPhone || '').trim();
  const orderPhone = String(order?.courierPhone || order?.courier_phone || '').trim();

  return {
    canAccept: status === 'awaiting_courier',
    canDecline: status === 'awaiting_courier',
    canComplete: status === 'delivering' && !!phone && phone === orderPhone,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS，且已有 rider-dispatch 相关断言保持通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts
git commit -m "feat: unify rider dispatch action rules"
```

### Task 2: 统一 Telegram 消息按钮与阶段文案

**Files:**
- Modify: `src/lib/telegram-dispatch.ts`
- Test: `src/lib/telegram-dispatch-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('buildAdminAssignedOrderTelegramMessage renders accept and decline buttons only for awaiting_courier stage', () => {
  const message = buildAdminAssignedOrderTelegramMessage({
    orderNo: 'NO501',
    address: 'Beograd 1',
    totalAmount: 1200,
    phone: '0601',
    pickupEtaMinutes: 15,
    itemSummary: ['可乐 x1'],
    claimCallbackData: 'claim-1',
    declineCallbackData: 'decline-1',
  });

  assert.deepEqual(message.replyMarkup.inline_keyboard, [[
    { text: '接单', callback_data: 'claim-1' },
    { text: '暂不接单', callback_data: 'decline-1' },
  ]]);
});

test('buildRiderDeliveryCompleteTelegramMessage renders complete button for delivering stage', () => {
  const message = buildRiderDeliveryCompleteTelegramMessage({
    orderNo: 'NO501',
    address: 'Beograd 1',
    phone: '0601',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'complete-1',
  });

  assert.deepEqual(message.replyMarkup.inline_keyboard, [[
    { text: '送餐完成', callback_data: 'complete-1' },
  ]]);
  assert.match(message.text, /配送中/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: FAIL，提示新函数不存在或按钮文案不匹配。

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildAdminAssignedOrderTelegramMessage(...) {
  // 按 spec 改成“接单 / 暂不接单”文案
}

export function buildRiderDeliveryCompleteTelegramMessage(input: {
  orderNo: string;
  address: string;
  phone: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  completeCallbackData?: string;
}): TelegramDispatchMessage {
  return {
    text: [
      '配送中',
      `订单号：${input.orderNo}`,
      `地址：${input.address}`,
      `电话：${input.phone}`,
      `金额：${input.totalAmount} RSD`,
      `预计 ${input.pickupEtaMinutes} 分钟后可取`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: input.completeCallbackData
        ? [[{ text: '送餐完成', callback_data: input.completeCallbackData }]]
        : [],
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: PASS，消息按钮改为统一中文文案。

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram-dispatch.ts src/lib/telegram-dispatch-spec.ts
git commit -m "feat: unify telegram rider action messages"
```

### Task 3: 扩展 Telegram callback 为接单后发送完成消息

**Files:**
- Modify: `src/pages/api/telegram/rider-claim.ts`
- Test: `src/lib/telegram-rider-claim-route-spec.ts`
- Modify: `src/lib/telegram-dispatch.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('POST rider-claim sends delivery-complete telegram message after accept succeeds', async () => {
  let sendPayload: Record<string, unknown> | null = null;

  const restoreFetch = withMockedFetch(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/order/update_status/108') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/telegram/send') {
      sendPayload = JSON.parse(String(init?.body || '{}'));
      return jsonResponse({ success: true });
    }
    // 其他依赖维持现有 mock
  });

  // 调 accept callback
  assert.equal(sendPayload?.text?.includes('配送中'), true);
  assert.equal(JSON.stringify(sendPayload?.reply_markup || {}).includes('送餐完成'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: FAIL，提示未发送完成消息。

- [ ] **Step 3: Write minimal implementation**

```ts
if (upstream.ok) {
  await fetch(`${readInternalApiBaseUrl()}/api/telegram/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: deliveryMessage.text,
      reply_markup: deliveryMessage.replyMarkup,
    }),
  }).catch(() => null);
}
```

同时只在 `accept` 成功后触发，不改 `decline` 分支语义。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，接单后新增完成消息链路通过；既有拒单 / 接单测试不回归。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/telegram/rider-claim.ts src/lib/telegram-rider-claim-route-spec.ts src/lib/telegram-dispatch.ts
git commit -m "feat: send telegram completion action after rider accepts"
```

### Task 4: 为 Telegram 增加送餐完成回调入口

**Files:**
- Modify: `src/lib/telegram-dispatch.ts`
- Modify: `src/pages/api/telegram/rider-claim.ts`
- Test: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('POST rider-claim completes delivering order when complete callback is valid', async () => {
  let updateStatusPayload: Record<string, unknown> | null = null;

  const restoreFetch = withMockedFetch(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/order/update_status/108') {
      updateStatusPayload = JSON.parse(String(init?.body || '{}'));
      return jsonResponse({ success: true });
    }
    // 其他依赖维持现有 mock
  });

  const callbackData = buildTelegramShortClaimCallback({
    orderId: 108,
    riderId: 6,
    riderName: '骑手888',
    riderPhone: '0613888',
    restaurantId: '101',
    telegramChatId: 'chat-888',
    expiresAt: Date.now() + 60_000,
    action: 'complete',
  });

  // 调 POST
  assert.deepEqual(updateStatusPayload, {
    id: 108,
    expected_current_status: 'delivering',
    status: 'completed',
    courier_name: '骑手888',
    courier_phone: '0613888',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: FAIL，说明 callback action 未支持 `complete`。

- [ ] **Step 3: Write minimal implementation**

```ts
type TelegramClaimAction = 'accept' | 'decline' | 'complete';

if (callback.action === 'complete') {
  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(orderIdText)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: callback.orderId,
      expected_current_status: 'delivering',
      status: 'completed',
      courier_name: resolvedName,
      courier_phone: resolvedPhone,
    }),
  });
  return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，`complete` callback 能推进到 `completed`。

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram-dispatch.ts src/pages/api/telegram/rider-claim.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "feat: support telegram completion callback"
```

### Task 5: 给 rider dashboard 补“暂不接单”与统一按钮规则

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Test: `src/tests/pages/rider-dashboard-canonical.test.ts`
- Modify: `src/lib/rider-dispatch.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('rider dashboard active card shows accept and decline for awaiting_courier, complete for delivering', async () => {
  const source = await fs.readFile(new URL('../../../src/pages/rider/dashboard.astro', import.meta.url), 'utf8');

  assert.match(source, /getRiderActionFlags/);
  assert.match(source, /暂不接单/);
  assert.match(source, /送餐完成/);
  assert.match(source, /window\.declineOrder = async function\(id\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: FAIL，说明 rider 页面尚未引入 decline 按钮与共用规则。

- [ ] **Step 3: Write minimal implementation**

```ts
const actionFlags = getRiderActionFlags(o, rider?.phone);

if (actionFlags.canAccept || actionFlags.canDecline) {
  // 渲染 接单 / 暂不接单
}
if (actionFlags.canComplete) {
  // 渲染 送餐完成 / 联系客户 / 导航
}

window.declineOrder = async function(id) {
  const res = await fetch('/api/order/update_status', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      id,
      expected_current_status: 'awaiting_courier',
      status: 'awaiting_courier',
      remarksJson: buildDeclineRemarks(...),
    }),
  });
  loadOrders();
};
```

实现时优先复用现有 `dispatch_meta` 读写 helper，不在 dashboard 内自行拼散乱字符串。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: PASS，页面源码断言已反映统一按钮规则。

- [ ] **Step 5: Commit**

```bash
git add src/pages/rider/dashboard.astro src/tests/pages/rider-dashboard-canonical.test.ts src/lib/rider-dispatch.ts
git commit -m "feat: unify rider dashboard actions"
```

### Task 6: 美化 rider dashboard 为简洁商务风

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Test: `src/tests/pages/rider-dashboard-canonical.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('rider dashboard card layout uses business-style hierarchy for active orders', async () => {
  const source = await fs.readFile(new URL('../../../src/pages/rider/dashboard.astro', import.meta.url), 'utf8');

  assert.match(source, /待接单池/);
  assert.match(source, /我的配送/);
  assert.match(source, /status-chip/);
  assert.match(source, /card-main/);
  assert.match(source, /card-meta/);
  assert.match(source, /btn-secondary/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: FAIL，说明页面尚未完成新的结构/样式命名。

- [ ] **Step 3: Write minimal implementation**

```html
<div class="order-card status-${o.status}">
  <div class="card-main">
    <div class="card-header">
      <span class="shop-name">...</span>
      <span class="status-chip">...</span>
    </div>
    <div class="card-meta">...</div>
  </div>
  <div class="action-btns">...</div>
</div>
```

并把按钮视觉改成：
- 主按钮：实色高强调
- 次按钮：浅边框 / 低强调
- 不再使用当前杂乱的图标+文本混排风格作为主视觉核心

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: PASS，源码结构与样式命名满足新设计。

- [ ] **Step 5: Commit**

```bash
git add src/pages/rider/dashboard.astro src/tests/pages/rider-dashboard-canonical.test.ts
git commit -m "feat: refresh rider dashboard layout"
```

### Task 7: 统一 admin 派单文案到共享 helper

**Files:**
- Modify: `src/components/admin/TabOrders.astro`
- Modify: `src/components/admin/TabTables.astro`
- Test: `src/tests/pages/admin/tab-orders-rider-feedback.test.ts`
- Test: `src/tests/pages/admin/tab-tables-rider-status-copy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('admin dispatch surfaces use shared copy helper for awaiting_courier and delivering', async () => {
  const ordersSource = await fs.readFile(tabOrdersPath, 'utf8');
  const tablesSource = await fs.readFile(tabTablesPath, 'utf8');

  assert.match(ordersSource, /getAdminDispatchStatusCopy\(o\.status\)/);
  assert.match(tablesSource, /getAdminDispatchStatusCopy\(o\.status\)/);
  assert.doesNotMatch(tablesSource, /待骑手确认/);
  assert.doesNotMatch(tablesSource, /骑手已接单/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/admin/tab-orders-rider-feedback.test.ts src/tests/pages/admin/tab-tables-rider-status-copy.test.ts`
Expected: FAIL，说明 TabTables 仍残留旧文案硬编码。

- [ ] **Step 3: Write minimal implementation**

```astro
import { getAdminDispatchStatusCopy, readDispatchMetaFromRemarks } from '../../lib/rider-dispatch.ts';

<span class={`status-tag status-${o.status}`}>
  {riderDeclinedAwaitingCourier ? '骑手已拒单' : getAdminDispatchStatusCopy(o.status)}
</span>
```

这里保留拒单反馈辅助展示，但默认状态映射统一走 helper。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/admin/tab-orders-rider-feedback.test.ts src/tests/pages/admin/tab-tables-rider-status-copy.test.ts`
Expected: PASS，admin 两处入口都不再分裂文案。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabOrders.astro src/components/admin/TabTables.astro src/tests/pages/admin/tab-orders-rider-feedback.test.ts src/tests/pages/admin/tab-tables-rider-status-copy.test.ts
git commit -m "refactor: unify admin dispatch copy"
```

### Task 8: 跑聚焦回归验证整条链路

**Files:**
- Test: `src/lib/rider-dispatch-spec.ts`
- Test: `src/lib/telegram-dispatch-spec.ts`
- Test: `src/lib/telegram-rider-claim-route-spec.ts`
- Test: `src/tests/pages/rider-dashboard-canonical.test.ts`
- Test: `src/tests/pages/admin/tab-orders-rider-feedback.test.ts`
- Test: `src/tests/pages/admin/tab-tables-rider-status-copy.test.ts`

- [ ] **Step 1: Run shared helper tests**

Run: `node --test src/lib/rider-dispatch-spec.ts src/lib/telegram-dispatch-spec.ts`
Expected: PASS

- [ ] **Step 2: Run Telegram callback regression**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS

- [ ] **Step 3: Run rider dashboard regression**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: PASS

- [ ] **Step 4: Run admin dispatch display regression**

Run: `node --test src/tests/pages/admin/tab-orders-rider-feedback.test.ts src/tests/pages/admin/tab-tables-rider-status-copy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch-spec.ts src/lib/telegram-dispatch-spec.ts src/lib/telegram-rider-claim-route-spec.ts src/tests/pages/rider-dashboard-canonical.test.ts src/tests/pages/admin/tab-orders-rider-feedback.test.ts src/tests/pages/admin/tab-tables-rider-status-copy.test.ts
git commit -m "test: verify unified rider dispatch flow"
```
