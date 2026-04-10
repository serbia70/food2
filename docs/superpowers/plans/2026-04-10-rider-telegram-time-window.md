# Rider Telegram Time Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Telegram 仅在待接单阶段执行 5 分钟超时，`已取餐`/`已送达` 改为只受订单真实状态与当前骑手身份约束。

**Architecture:** 保留现有 `dispatch_meta.currentExpiresAt` 作为 `awaiting_courier` 阶段唯一超时真相，不再把同一 callback TTL 扩散到配送推进阶段。实现上先在 `telegram-dispatch` 中按动作拆开过期校验，再在 `rider-claim` 中补业务失败分类，最后在 `webhook` 中统一把错误映射成准确的 Telegram 提示文案。

**Tech Stack:** Astro API routes, TypeScript, Node test runner (`node --test`), existing `telegram-dispatch` helpers, existing `rider-dispatch` dispatch-meta helpers.

---

## File Map

- Modify: `src/lib/telegram-dispatch.ts`
  - 将 callback 过期策略从“所有动作统一 TTL”改为“仅 accept/decline 校验过期”。
- Create: `src/lib/telegram-dispatch-spec.ts`
  - 锁定 accept/decline 仍会过期，picked_up/complete 过期后仍可解析。
- Modify: `src/pages/api/telegram/rider-claim.ts`
  - 让配送阶段旧按钮进入业务状态判断，并返回 `order_status_updated` / `order_completed` / `dispatch_invalidated` 等明确错误。
- Create: `src/lib/telegram-rider-claim-route-spec.ts`
  - 锁定 stale `picked_up` 可成功、stale `accept` 仍失败、已完成订单返回 `order_completed`。
- Modify: `src/pages/api/telegram/webhook.ts`
  - 提取并统一 callback 错误文案映射，不再把配送阶段失败一律回成“操作已过期/操作失败”。
- Create: `src/lib/telegram-webhook-route-spec.ts`
  - 锁定 `expired_callback`、`dispatch_invalidated`、`order_status_updated`、`order_completed` 的回包文案。
- Modify: `docs/superpowers/specs/2026-04-08-delivery-telegram-webhook-contract-design.md`
  - 同步契约：5 分钟只限制接单阶段，配送推进阶段按业务状态拒绝。

---

### Task 1: 按动作拆分 Telegram callback 过期策略

**Files:**
- Modify: `src/lib/telegram-dispatch.ts`
- Create: `src/lib/telegram-dispatch-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTelegramShortClaimCallback, parseTelegramClaimCallback } from './telegram-dispatch.ts';

function withMockedNow<T>(now: number, fn: () => T): T {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return fn();
  } finally {
    Date.now = originalNow;
  }
}

test('accept callback still expires after the dispatch window', () => {
  const createdAt = Date.UTC(2026, 3, 10, 10, 0, 0);
  const callback = withMockedNow(createdAt, () => buildTelegramShortClaimCallback({
    orderId: 101,
    riderId: 7,
    riderName: '骑手甲',
    riderPhone: '13800138000',
    restaurantId: 'shop-a',
    telegramChatId: '1001',
    action: 'accept',
    expiresAt: createdAt + 5 * 60_000,
  }));

  assert.throws(() => {
    withMockedNow(createdAt + 6 * 60_000, () => parseTelegramClaimCallback(callback, { chatId: '1001' }));
  }, /expired_callback/);
});

test('picked_up and complete callbacks remain parseable after the dispatch window', () => {
  const createdAt = Date.UTC(2026, 3, 10, 10, 0, 0);
  const pickedUp = withMockedNow(createdAt, () => buildTelegramShortClaimCallback({
    orderId: 101,
    riderId: 7,
    riderName: '骑手甲',
    riderPhone: '13800138000',
    restaurantId: 'shop-a',
    telegramChatId: '1001',
    action: 'picked_up',
    expiresAt: createdAt + 60_000,
  }));
  const complete = withMockedNow(createdAt, () => buildTelegramShortClaimCallback({
    orderId: 101,
    riderId: 7,
    riderName: '骑手甲',
    riderPhone: '13800138000',
    restaurantId: 'shop-a',
    telegramChatId: '1001',
    action: 'complete',
    expiresAt: createdAt + 60_000,
  }));

  const pickedUpParsed = withMockedNow(createdAt + 11 * 60_000, () => parseTelegramClaimCallback(pickedUp, { chatId: '1001' }));
  const completeParsed = withMockedNow(createdAt + 11 * 60_000, () => parseTelegramClaimCallback(complete, { chatId: '1001' }));

  assert.equal(pickedUpParsed.action, 'picked_up');
  assert.equal(completeParsed.action, 'complete');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: FAIL，当前 `picked_up` / `complete` 仍会抛出 `expired_callback`。

- [ ] **Step 3: Write minimal implementation**

```ts
type TelegramClaimAction = 'accept' | 'decline' | 'picked_up' | 'complete';

function shouldEnforceTelegramClaimExpiry(action: TelegramClaimAction): boolean {
  return action === 'accept' || action === 'decline';
}

function validateTelegramClaimPayload(payload: TelegramClaimPayload): void {
  if (!Number.isFinite(payload.orderId) || payload.orderId <= 0) throw new Error('invalid_order_id');
  if (!Number.isFinite(payload.riderId) || payload.riderId <= 0) throw new Error('invalid_rider_id');
  if (!payload.riderName) throw new Error('invalid_rider_name');
  if (!payload.restaurantId) throw new Error('invalid_restaurant_id');
  if (!payload.riderPhone) throw new Error('invalid_rider_phone');
  if (!payload.telegramChatId) throw new Error('invalid_telegram_chat_id');
  if (payload.action !== 'accept' && payload.action !== 'decline' && payload.action !== 'picked_up' && payload.action !== 'complete') {
    throw new Error('invalid_callback_action');
  }
  if (shouldEnforceTelegramClaimExpiry(payload.action) && (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now())) {
    throw new Error('expired_callback');
  }
}
```

```ts
function parseShortTelegramClaimCallback(payload: string): TelegramClaimCallback {
  const token = readShortCallbackToken(payload);
  if (!token) throw new Error('invalid_callback_data');

  const parts = token.split('.');
  if (parts.length !== 8) throw new Error('invalid_callback_data');

  const [actionPart, orderPart, riderPart, expiresPart, chatPart, phonePart, namePart, sigPart] = parts;
  const action = actionPart === 'd'
    ? 'decline'
    : actionPart === 'p'
      ? 'picked_up'
      : actionPart === 'c'
        ? 'complete'
        : 'accept';

  const expiresAt = readBase36PositiveInt(expiresPart) * 1000;
  if (shouldEnforceTelegramClaimExpiry(action) && expiresAt <= Date.now()) {
    throw new Error('expired_callback');
  }

  return {
    orderId: readBase36PositiveInt(orderPart),
    riderId: readBase36PositiveInt(riderPart),
    riderName: namePart,
    restaurantId: '',
    riderPhone: sanitizeCompactPhone(phonePart),
    telegramChatId: chatPart,
    expiresAt,
    action,
    sig: sigPart,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram-dispatch.ts src/lib/telegram-dispatch-spec.ts
git commit -m "fix: split telegram callback expiry by action"
```

### Task 2: 让 rider-claim 在配送阶段返回业务错误而不是超时错误

**Files:**
- Modify: `src/pages/api/telegram/rider-claim.ts`
- Create: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTelegramShortClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { handleTelegramRiderClaim } from './rider-claim.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function withMockedNow<T>(now: number, fn: () => T): T {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return fn();
  } finally {
    Date.now = originalNow;
  }
}

async function withMockedNowAsync<T>(now: number, fn: () => Promise<T>): Promise<T> {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return await fn();
  } finally {
    Date.now = originalNow;
  }
}

test('handleTelegramRiderClaim accepts stale picked_up callback for the current rider', async () => {
  const createdAt = Date.UTC(2026, 3, 10, 10, 0, 0);
  const callbackData = withMockedNow(createdAt, () => buildTelegramShortClaimCallback({
    orderId: 201,
    riderId: 7,
    riderName: '骑手甲',
    riderPhone: '13800138000',
    restaurantId: 'shop-a',
    telegramChatId: '1001',
    action: 'picked_up',
    expiresAt: createdAt + 60_000,
  }));

  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, body });

    if (url.endsWith('/api/rider/status?action=list_available')) {
      return jsonResponse({ riders: [{ id: 7, name: '骑手甲', phone: '13800138000', telegramChatId: '1001', status: 'available' }] });
    }
    if (url.endsWith('/api/admin/orders')) {
      return jsonResponse([{
        id: 201,
        status: 'delivering',
        remarksJson: JSON.stringify(['dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"7","currentAssignedAt":"2026-04-10T10:00:00.000Z","currentExpiresAt":"2026-04-10T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}']),
        orderNo: 'NO201',
        tableInfo: 'Main Street 1',
        userPhone: '0600000000',
        totalAmount: 1200,
        pickupEtaMinutes: 20,
      }]);
    }
    if (url.endsWith('/api/order/update_status/201')) {
      return jsonResponse({ success: true }, 200);
    }
    if (url.endsWith('/api/telegram/send')) {
      return jsonResponse({ success: true }, 200);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await withMockedNowAsync(createdAt + 11 * 60_000, () => handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackData, chatId: '1001' }),
    })));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.action, 'picked_up');
    assert.ok(calls.some((call) => call.url.endsWith('/api/order/update_status/201') && call.body.includes('"expectedCurrentStatus":"delivering"')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('handleTelegramRiderClaim still rejects stale accept callback', async () => {
  const createdAt = Date.UTC(2026, 3, 10, 10, 0, 0);
  const callbackData = withMockedNow(createdAt, () => buildTelegramShortClaimCallback({
    orderId: 202,
    riderId: 7,
    riderName: '骑手甲',
    riderPhone: '13800138000',
    restaurantId: 'shop-a',
    telegramChatId: '1001',
    action: 'accept',
    expiresAt: createdAt + 5 * 60_000,
  }));

  const response = await withMockedNowAsync(createdAt + 6 * 60_000, () => handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callbackData, chatId: '1001' }),
  })));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, 'expired_callback');
});

test('handleTelegramRiderClaim returns order_completed for stale complete button on finished order', async () => {
  const createdAt = Date.UTC(2026, 3, 10, 10, 0, 0);
  const callbackData = withMockedNow(createdAt, () => buildTelegramShortClaimCallback({
    orderId: 203,
    riderId: 7,
    riderName: '骑手甲',
    riderPhone: '13800138000',
    restaurantId: 'shop-a',
    telegramChatId: '1001',
    action: 'complete',
    expiresAt: createdAt + 60_000,
  }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/rider/status?action=list_available')) {
      return jsonResponse({ riders: [{ id: 7, name: '骑手甲', phone: '13800138000', telegramChatId: '1001', status: 'available' }] });
    }
    if (url.endsWith('/api/admin/orders')) {
      return jsonResponse([{
        id: 203,
        status: 'completed',
        remarksJson: JSON.stringify(['dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"7","currentAssignedAt":"2026-04-10T10:00:00.000Z","currentExpiresAt":"2026-04-10T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}']),
      }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await withMockedNowAsync(createdAt + 11 * 60_000, () => handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackData, chatId: '1001' }),
    })));
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.error, 'order_completed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: FAIL，当前 stale `picked_up` 会被提前拦成 `expired_callback`，完成态按钮也不会返回 `order_completed`。

- [ ] **Step 3: Write minimal implementation**

```ts
function buildDeliveryActionFailure(action: TelegramClaimAction, orderStatus: string, invalidReason: string) {
  if (invalidReason) {
    return {
      status: 409,
      body: { success: false, error: 'dispatch_invalidated', reason: invalidReason },
    };
  }

  if (action === 'complete' && orderStatus === 'completed') {
    return {
      status: 409,
      body: { success: false, error: 'order_completed' },
    };
  }

  if (action === 'picked_up' && orderStatus === 'completed') {
    return {
      status: 409,
      body: { success: false, error: 'order_completed' },
    };
  }

  return {
    status: 409,
    body: { success: false, error: 'order_status_updated' },
  };
}
```

```ts
const isDeliveryStageAction = callback.action === 'picked_up' || callback.action === 'complete';

if (dispatchState.invalidReason) {
  const failure = isDeliveryStageAction
    ? buildDeliveryActionFailure(callback.action, orderSnapshot.status, dispatchState.invalidReason)
    : { status: 409, body: { success: false, error: 'dispatch_invalidated', reason: dispatchState.invalidReason } };

  return new Response(JSON.stringify(failure.body), {
    status: failure.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

if (enforceDispatchConstraints && !actionAllowed) {
  const failure = isDeliveryStageAction
    ? buildDeliveryActionFailure(callback.action, orderSnapshot.status, '当前订单不属于你')
    : { status: 409, body: { success: false, error: 'dispatch_invalidated', reason: '已改派' } };

  return new Response(JSON.stringify(failure.body), {
    status: failure.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

```ts
const text = await upstream.text();
if (!upstream.ok && isDeliveryStageAction) {
  const failure = buildDeliveryActionFailure(callback.action, orderSnapshot.status, '');
  return new Response(JSON.stringify(failure.body), {
    status: failure.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/telegram/rider-claim.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "fix: return delivery stage telegram errors by business state"
```

### Task 3: 统一 webhook 的 Telegram 回包文案

**Files:**
- Modify: `src/pages/api/telegram/webhook.ts`
- Create: `src/lib/telegram-webhook-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { mapTelegramClaimErrorToCallbackText } from './webhook.ts';

test('mapTelegramClaimErrorToCallbackText covers dispatch and delivery failures', () => {
  assert.equal(mapTelegramClaimErrorToCallbackText({ error: 'expired_callback' }), '操作已过期');
  assert.equal(mapTelegramClaimErrorToCallbackText({ error: 'dispatch_invalidated', reason: '接单超时' }), '接单超时');
  assert.equal(mapTelegramClaimErrorToCallbackText({ error: 'dispatch_invalidated', reason: '已改派' }), '已改派');
  assert.equal(mapTelegramClaimErrorToCallbackText({ error: 'order_status_updated' }), '订单状态已更新');
  assert.equal(mapTelegramClaimErrorToCallbackText({ error: 'order_completed' }), '订单已完成');
  assert.equal(mapTelegramClaimErrorToCallbackText({ error: 'rider_identity_mismatch' }), '当前订单不属于你');
  assert.equal(mapTelegramClaimErrorToCallbackText({ error: 'unknown_error' }), '操作失败');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-webhook-route-spec.ts`
Expected: FAIL，当前文件里还没有 `mapTelegramClaimErrorToCallbackText`，且错误文案仍只区分 `expired_callback` 和其他失败。

- [ ] **Step 3: Write minimal implementation**

```ts
export function mapTelegramClaimErrorToCallbackText(input: { error?: unknown; reason?: unknown }): string {
  const error = String(input.error || '').trim();
  const reason = String(input.reason || '').trim();

  if (error === 'expired_callback') return '操作已过期';
  if (error === 'dispatch_invalidated' && reason) return reason;
  if (error === 'order_status_updated') return '订单状态已更新';
  if (error === 'order_completed') return '订单已完成';
  if (error === 'rider_identity_mismatch') return '当前订单不属于你';
  return '操作失败';
}
```

```ts
if (!upstream.ok) {
  const text = mapTelegramClaimErrorToCallbackText({
    error: upstreamJson?.error,
    reason: upstreamJson?.reason,
  });
  return buildJsonResponse(
    callbackId
      ? { method: 'answerCallbackQuery', callback_query_id: callbackId, text }
      : { success: false, error: String(upstreamJson?.error || '').trim() || 'rider_claim_failed' },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-webhook-route-spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/telegram/webhook.ts src/lib/telegram-webhook-route-spec.ts
git commit -m "fix: map telegram callback errors to business copy"
```

### Task 4: 同步契约文档并做最终验证

**Files:**
- Modify: `docs/superpowers/specs/2026-04-08-delivery-telegram-webhook-contract-design.md`
- Modify: `docs/superpowers/specs/2026-04-10-rider-telegram-time-window-design.md`

- [ ] **Step 1: Update the contract document**

```md
### 4.3 callback 安全约束
- `accept` / `decline`：仍执行 callback 过期校验，过期返回 `expired_callback`。
- `picked_up` / `complete`：不再因 callback TTL 直接失败，改由订单真实状态与当前骑手身份决定是否允许操作。

### 4.5 改派/失效与配送推进错误语义
- 接单阶段失效：
  - `dispatch_invalidated` + `reason: "接单超时" | "已改派" | "订单已被接单"`
- 配送推进阶段：
  - `order_status_updated`
  - `order_completed`
  - `dispatch_invalidated` + `reason: "当前订单不属于你"`
```

```md
## 结论
最终采用以下统一口径：
- **5 分钟只限制接单阶段**；
- **配送推进阶段不使用 Telegram 按钮硬超时**；
- **配送阶段失败提示按业务状态返回，不再统一映射为超时**。
```

- [ ] **Step 2: Run targeted tests**

Run: `node --test src/lib/telegram-dispatch-spec.ts src/lib/telegram-rider-claim-route-spec.ts src/lib/telegram-webhook-route-spec.ts`
Expected: PASS。

- [ ] **Step 3: Run build to catch route/module regressions**

Run: `pnpm build`
Expected: build 成功，无新的 TypeScript / Astro 路由错误。

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-08-delivery-telegram-webhook-contract-design.md docs/superpowers/specs/2026-04-10-rider-telegram-time-window-design.md
git commit -m "docs: sync telegram rider time window contract"
```

---

## Self-Review

### Spec coverage
- “5 分钟只限制接单阶段” → Task 1、Task 2。
- “已取餐/已送达不再因 TTL 超时” → Task 1、Task 2。
- “配送阶段失败提示按真实业务原因区分” → Task 2、Task 3。
- “文档口径同步” → Task 4。

### Placeholder scan
- 无 `TODO`、`TBD`、`类似 Task N`、`自行补测试` 之类占位描述。
- 每个代码步骤都有实际代码块。
- 每个验证步骤都有明确命令与期望结果。

### Type consistency
- 动作名统一使用：`accept | decline | picked_up | complete`。
- 业务错误统一使用：`expired_callback`、`dispatch_invalidated`、`order_status_updated`、`order_completed`。
- 文案统一使用：`操作已过期`、`接单超时`、`已改派`、`订单状态已更新`、`订单已完成`、`当前订单不属于你`。

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-10-rider-telegram-time-window.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
