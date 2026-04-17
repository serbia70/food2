# 自动续派与改派失效 Implementation Plan

> 状态说明（历史计划）：这份计划记录的是自动续派与改派失效语义收口时的实施步骤；文中的 `历史红灯预期：` 只代表当时阶段，不应直接当作当前实现状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让骑手拒单、超时、admin 改派都收口到“当前轮唯一有效骑手”的统一模型，旧骑手显示已改派/接单超时且无法再接单。

**Architecture:** 保持订单主状态机 `awaiting_courier -> delivering -> completed` 不变，只在 `dispatch_meta` 中扩展当前轮派单与失效骑手元数据。Telegram callback、admin 派单与 rider dashboard 全部复用同一套 helper 判断“谁当前有效、谁已失效、何时到期、何时切下一轮”。自动续派先复用现有 admin 派单 API 和提醒链路，不引入并行抢单或新订单状态。

**Tech Stack:** Astro API routes, TypeScript, Node test runner, existing Telegram dispatch/callback flow, rider-dispatch helpers, admin rider-dispatch route.

---

## File Map

- Modify: `src/lib/rider-dispatch.ts`
  - 扩展 `DispatchMeta` 与当前轮/失效判断 helper
- Modify: `src/lib/rider-dispatch-spec.ts`
  - 锁定当前轮有效性、超时、改派、失效文案判断
- Modify: `src/lib/rider-assignment.ts`
  - 支持按失效骑手集合选择下一个骑手
- Modify: `src/pages/api/telegram/rider-claim.ts`
  - 在接单/拒单前校验当前轮是否有效；拒单时触发自动续派
- Modify: `src/lib/telegram-rider-claim-route-spec.ts`
  - 锁定失效 callback、拒单立即续派、新骑手可接单
- Modify: `src/pages/api/admin/rider-dispatch.ts`
  - 收口首次派单、手动改派、超时续派到统一当前轮逻辑
- Modify: `src/lib/admin-rider-dispatch-route-spec.ts`
  - 锁定首次派单、改派、超时续派、无候选骑手场景
- Modify: `src/pages/rider/dashboard.astro`
  - 用共享 helper 显示接单/暂不接单/送餐完成/已改派/接单超时
- Modify: `src/tests/pages/rider-dashboard-canonical.test.ts`
  - 锁定 dashboard 已改派/接单超时/禁用态源码契约
- Modify: `src/config.ts`
  - 增加 `DISPATCH_AUTO_REASSIGN_MINUTES` 常量读取，默认 5
- Modify: `src/config.test.ts`
  - 锁定配置默认值与覆盖读取

---

### Task 1: 扩展 dispatch_meta 与当前轮 helper

**Files:**
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('dispatch meta tracks current rider validity and invalidation copy', () => {
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":["4"],"currentRiderId":"7","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2026-04-07T10:05:00.000Z","invalidatedRiderIds":["4","6"],"lastInvalidationReason":"timeout"}',
  ]);

  const meta = readDispatchMetaFromRemarks(remarksJson);
  assert.deepEqual(meta, {
    lastRiderDecision: null,
    declinedRiderIds: ['4'],
    currentRiderId: '7',
    currentAssignedAt: '2026-04-07T10:00:00.000Z',
    currentExpiresAt: '2026-04-07T10:05:00.000Z',
    invalidatedRiderIds: ['4', '6'],
    lastInvalidationReason: 'timeout',
  });

  assert.deepEqual(getRiderDispatchState({ status: 'awaiting_courier', courierPhone: '' }, meta, '7', '2026-04-07T10:03:00.000Z'), {
    canAccept: true,
    canDecline: true,
    canComplete: false,
    invalidReason: '',
  });

  assert.deepEqual(getRiderDispatchState({ status: 'awaiting_courier', courierPhone: '' }, meta, '6', '2026-04-07T10:03:00.000Z'), {
    canAccept: false,
    canDecline: false,
    canComplete: false,
    invalidReason: '已改派',
  });

  assert.deepEqual(getRiderDispatchState({ status: 'awaiting_courier', courierPhone: '' }, meta, '7', '2026-04-07T10:06:00.000Z'), {
    canAccept: false,
    canDecline: false,
    canComplete: false,
    invalidReason: '接单超时',
  });
});

test('filterAvailableRidersForOrder excludes invalidated riders from current order', () => {
  const riders = [
    { id: 7, name: '骑手A', phone: '061', status: 'available' as const },
    { id: 8, name: '骑手B', phone: '062', status: 'available' as const },
    { id: 9, name: '骑手C', phone: '063', status: 'available' as const },
  ];
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"invalidatedRiderIds":["8"],"declinedRiderIds":["9"]}',
  ]);

  assert.deepEqual(
    filterAvailableRidersForOrder(riders, remarksJson),
    [{ id: 7, name: '骑手A', phone: '061', status: 'available' }],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts`
历史红灯预期：，提示 `getRiderDispatchState` 未定义或 `DispatchMeta` 断言不满足。

- [ ] **Step 3: Write minimal implementation**

```ts
export interface DispatchMeta {
  lastRiderDecision: DispatchDecisionMeta | null;
  declinedRiderIds: string[];
  currentRiderId: string;
  currentAssignedAt: string;
  currentExpiresAt: string;
  invalidatedRiderIds: string[];
  lastInvalidationReason: 'declined' | 'timeout' | 'reassigned' | null;
}

export function getRiderDispatchState(
  order: { status?: string | null; courierPhone?: string | null; courier_phone?: string | null },
  meta: DispatchMeta,
  riderId: string | null | undefined,
  nowIso?: string,
) {
  const status = String(order?.status || '').trim();
  const currentRiderId = String(meta.currentRiderId || '').trim();
  const currentExpiresAt = String(meta.currentExpiresAt || '').trim();
  const currentId = String(riderId || '').trim();
  const invalidated = new Set(meta.invalidatedRiderIds.map((item) => String(item || '').trim()).filter(Boolean));
  const expired = !!currentExpiresAt && Date.parse(currentExpiresAt) > 0 && Date.parse(String(nowIso || new Date().toISOString())) > Date.parse(currentExpiresAt);

  if (status === 'delivering') {
    const orderPhone = String(order?.courierPhone || order?.courier_phone || '').trim();
    return {
      canAccept: false,
      canDecline: false,
      canComplete: !!orderPhone && orderPhone === currentId,
      invalidReason: '',
    };
  }

  if (status !== 'awaiting_courier') {
    return { canAccept: false, canDecline: false, canComplete: false, invalidReason: '' };
  }

  if (expired && currentId === currentRiderId) {
    return { canAccept: false, canDecline: false, canComplete: false, invalidReason: '接单超时' };
  }

  if (invalidated.has(currentId)) {
    return { canAccept: false, canDecline: false, canComplete: false, invalidReason: '已改派' };
  }

  if (currentId && currentId === currentRiderId) {
    return { canAccept: true, canDecline: true, canComplete: false, invalidReason: '' };
  }

  return { canAccept: false, canDecline: false, canComplete: false, invalidReason: '' };
}

export function filterAvailableRidersForOrder<T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'>>(
  riders: T[],
  remarksJson: string | null | undefined,
): T[] {
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const excluded = new Set([
    ...meta.declinedRiderIds,
    ...meta.invalidatedRiderIds,
  ].map((item) => String(item || '').trim()).filter(Boolean));
  return buildContactableRiderRows(riders).filter((rider) => !excluded.has(String(rider.id || '').trim()));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS，现有 rider dispatch 相关断言保持通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts
git commit -m "feat: track current rider dispatch round"
```

### Task 2: 增加自动续派配置与下一个骑手选择规则

**Files:**
- Modify: `src/config.ts`
- Test: `src/config.test.ts`
- Modify: `src/lib/rider-assignment.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('config source exposes DISPATCH_AUTO_REASSIGN_MINUTES with default 5 and env override', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /PUBLIC_DISPATCH_AUTO_REASSIGN_MINUTES/);
  assert.match(source, /DISPATCH_AUTO_REASSIGN_MINUTES\s*=\s*Math\.max\(1, Number\(/);
  assert.match(source, /\|\| 5/);
});

test('pickNextAvailableRider skips invalidated riders and current rider', () => {
  const riders = [
    { id: 7, name: '骑手A', phone: '061', status: 'available' as const },
    { id: 8, name: '骑手B', phone: '062', status: 'available' as const },
    { id: 9, name: '骑手C', phone: '063', status: 'available' as const },
  ];

  assert.deepEqual(
    pickNextAvailableRider({
      riders,
      lastAssignedRiderId: '7',
      excludedRiderIds: ['8'],
    }),
    { id: 9, name: '骑手C', phone: '063', status: 'available' },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/config.test.ts src/lib/rider-assignment.test.ts`
历史红灯预期：，提示新配置字段不存在，或 `excludedRiderIds` 参数未生效。

- [ ] **Step 3: Write minimal implementation**

```ts
export const DISPATCH_AUTO_REASSIGN_MINUTES = Math.max(
  1,
  Number((import.meta as any).env?.PUBLIC_DISPATCH_AUTO_REASSIGN_MINUTES || process.env.PUBLIC_DISPATCH_AUTO_REASSIGN_MINUTES || 5),
);

export function pickNextAvailableRider({
  riders,
  lastAssignedRiderId,
  excludedRiderIds = [],
}: {
  riders: AssignableRider[];
  lastAssignedRiderId: string;
  excludedRiderIds?: string[];
}): AssignableRider | null {
  const excluded = new Set(excludedRiderIds.map((item) => String(item || '').trim()).filter(Boolean));
  const filtered = riders.filter((row) => !excluded.has(String(row.id || '').trim()));
  if (filtered.length === 0) return null;

  const currentIndex = filtered.findIndex((row) => String(row.id || '').trim() === String(lastAssignedRiderId || '').trim());
  if (currentIndex === -1) return filtered[0] || null;
  return filtered[(currentIndex + 1) % filtered.length] || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/config.test.ts src/lib/rider-assignment.test.ts`
Expected: PASS，默认值为 5，覆盖值可读，排除逻辑生效。

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts src/lib/rider-assignment.ts src/lib/rider-assignment.test.ts
git commit -m "feat: add auto redispatch config"
```

### Task 3: 在 Telegram callback 中拒绝失效骑手并处理拒单立即续派

**Files:**
- Modify: `src/pages/api/telegram/rider-claim.ts`
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('POST rider-claim rejects callback when rider is no longer current assignee', async () => {
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"8","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2099-04-07T10:05:00.000Z","invalidatedRiderIds":["7"],"lastInvalidationReason":"reassigned"}',
  ]);
  const restoreFetch = withMockedFetch(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({ success: true, riders: [{ id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' }] });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(201, remarksJson)]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 201,
      riderId: 7,
      riderName: '骑手A',
      riderPhone: '0617',
      restaurantId: '101',
      telegramChatId: 'chat-7',
      expiresAt: Date.now() + 60_000,
    });
    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-7' })) } as any);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'dispatch_invalidated',
      reason: '已改派',
    });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim decline immediately republishes order to next rider', async () => {
  const calls: string[] = [];
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"7","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2099-04-07T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
  ]);
  const restoreFetch = withMockedFetch(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({ success: true, riders: [
        { id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' },
        { id: 8, name: '骑手B', phone: '0618', status: 'available', telegramChatId: 'chat-8' },
      ] });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(202, remarksJson)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/order/update_status/202') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/admin/rider-dispatch') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.orderId, 202);
      assert.equal(body.action, 'publish');
      assert.equal(body.forceRiderId, '8');
      return jsonResponse({ success: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 202,
      riderId: 7,
      riderName: '骑手A',
      riderPhone: '0617',
      restaurantId: '101',
      telegramChatId: 'chat-7',
      expiresAt: Date.now() + 60_000,
      action: 'decline',
    });
    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-7' })) } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, action: 'decline', reassigned: true });
    assert.ok(calls.includes('http://localhost/api/admin/rider-dispatch'));
  } finally {
    restoreFetch();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
历史红灯预期：，提示当前 callback 仍然允许旧骑手接单，或拒单后未触发续派。

- [ ] **Step 3: Write minimal implementation**

```ts
function readDispatchInvalidation(meta: DispatchMeta, riderId: string, nowIso: string) {
  const currentRiderId = String(meta.currentRiderId || '').trim();
  const currentExpiresAt = String(meta.currentExpiresAt || '').trim();
  const invalidated = new Set(meta.invalidatedRiderIds.map((item) => String(item || '').trim()).filter(Boolean));
  const currentId = String(riderId || '').trim();
  if (invalidated.has(currentId)) return '已改派';
  if (currentRiderId && currentId !== currentRiderId) return '已改派';
  if (currentExpiresAt && Date.parse(currentExpiresAt) > 0 && Date.parse(nowIso) > Date.parse(currentExpiresAt)) return '接单超时';
  return '';
}

const nowIso = new Date().toISOString();
const invalidReason = readDispatchInvalidation(existingMeta, String(callback.riderId || '').trim(), nowIso);
if (invalidReason || String(currentOrder.status || '').trim() !== 'awaiting_courier') {
  return new Response(JSON.stringify({ success: false, error: 'dispatch_invalidated', reason: invalidReason || '已改派' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });
}

if (callback.action === 'decline') {
  const nextMeta = {
    ...existingMeta,
    lastRiderDecision: {
      action: 'declined',
      riderId: String(callback.riderId || '').trim(),
      riderName: resolvedName,
      riderPhone: resolvedPhone,
      at: nowIso,
    },
    declinedRiderIds: Array.from(new Set([...existingMeta.declinedRiderIds, String(callback.riderId || '').trim()].filter(Boolean))),
    invalidatedRiderIds: Array.from(new Set([...(existingMeta.invalidatedRiderIds || []), String(callback.riderId || '').trim()].filter(Boolean))),
    lastInvalidationReason: 'declined',
    currentRiderId: '',
    currentAssignedAt: '',
    currentExpiresAt: '',
  };
  await writeOrderDispatchMeta(request, orderIdText, nextMeta);
  const nextRider = pickNextAvailableRider({
    riders: readOnlineRiders((await readRiderStatusList(request))?.riders),
    lastAssignedRiderId: String(callback.riderId || '').trim(),
    excludedRiderIds: nextMeta.invalidatedRiderIds,
  });
  if (nextRider) {
    await fetch(`${readInternalApiBaseUrl()}/api/admin/rider-dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildForwardHeaders(request) },
      body: JSON.stringify({ orderId: callback.orderId, action: 'publish', forceRiderId: String(nextRider.id || '').trim() }),
    }).catch(() => null);
  }
  return new Response(JSON.stringify({ success: true, action: 'decline', reassigned: !!nextRider }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，旧骑手 callback 被拒，拒单后会立即续派下一个。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/telegram/rider-claim.ts src/lib/rider-dispatch.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "feat: invalidate stale telegram rider claims"
```

### Task 4: 收口 admin 派单/改派/超时续派主流程

**Files:**
- Modify: `src/pages/api/admin/rider-dispatch.ts`
- Modify: `src/lib/rider-assignment.ts`
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/lib/admin-rider-dispatch-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('POST rider-dispatch publish writes current dispatch round for forced rider reassignment', async () => {
  let remarksBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/admin/orders') {
      return new Response(JSON.stringify([{ id: 520, remarksJson: JSON.stringify([
        'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"7","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2099-04-07T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
      ]) }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/admin/orders/remarks') {
      remarksBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/admin/orders/520/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({ riders: [
        { id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' },
        { id: 8, name: '骑手B', phone: '0618', status: 'available', telegramChatId: 'chat-8' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/telegram/send') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ orderId: '520', action: 'publish', forceRiderId: '8', shopSlug: 'demo-shop', shopId: 21, shopName: 'Demo Shop', tableInfo: 'addr', totalAmount: 905, userPhone: '0613083888', pickupEtaMinutes: 15 }),
    }),
    cookies: { get(name: string) { if (name === 'admin_token') return { value: 'test-token' }; return undefined; } },
  } as any);

  assert.equal(response.status, 200);
  const remarks = (remarksBody?.remarks as string[]);
  const nextMeta = JSON.parse(String(remarks[0] || '').replace(/^dispatch_meta:/, '')) as Record<string, unknown>;
  assert.equal(nextMeta.currentRiderId, '8');
  assert.equal(Array.isArray(nextMeta.invalidatedRiderIds), true);
  assert.equal((nextMeta.invalidatedRiderIds as string[]).includes('7'), true);
  assert.equal(nextMeta.lastInvalidationReason, 'reassigned');
});

test('POST rider-dispatch republish_on_timeout picks next rider and preserves awaiting_courier when candidate exists', async () => {
  let telegramSendBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/admin/orders') {
      return new Response(JSON.stringify([{ id: 521, remarksJson: JSON.stringify([
        'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"7","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2026-04-07T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
      ]), status: 'awaiting_courier', shopSlug: 'demo-shop', shopId: 21, shopName: 'Demo Shop', tableInfo: 'addr', totalAmount: 905, userPhone: '0613083888', pickupEtaMinutes: 15 }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/admin/orders/521/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/admin/orders/remarks') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({ riders: [
        { id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' },
        { id: 8, name: '骑手B', phone: '0618', status: 'available', telegramChatId: 'chat-8' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/telegram/send') {
      telegramSendBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ orderId: '521', action: 'republish_on_timeout' }),
    }),
    cookies: { get(name: string) { if (name === 'admin_token') return { value: 'test-token' }; return undefined; } },
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(telegramSendBody?.chat_id, 'chat-8');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/admin-rider-dispatch-route-spec.ts`
历史红灯预期：，提示 publish 未写当前轮 meta，或超时续派动作不存在。

- [ ] **Step 3: Write minimal implementation**

```ts
function buildCurrentDispatchMeta({
  existingMeta,
  riderId,
  assignedAt,
  expiresAt,
  invalidatedRiderId,
  invalidationReason,
}: {
  existingMeta: DispatchMeta;
  riderId: string;
  assignedAt: string;
  expiresAt: string;
  invalidatedRiderId?: string;
  invalidationReason?: 'declined' | 'timeout' | 'reassigned' | null;
}): DispatchMeta {
  return {
    ...existingMeta,
    currentRiderId: riderId,
    currentAssignedAt: assignedAt,
    currentExpiresAt: expiresAt,
    invalidatedRiderIds: Array.from(new Set([
      ...(existingMeta.invalidatedRiderIds || []),
      String(invalidatedRiderId || '').trim(),
    ].filter(Boolean))),
    lastInvalidationReason: invalidationReason || null,
  };
}

const action = String(parsedBody.action || '').trim();
const forceRiderId = String(parsedBody.forceRiderId || '').trim();
const nowIso = new Date().toISOString();
const expiresAt = new Date(Date.parse(nowIso) + DISPATCH_AUTO_REASSIGN_MINUTES * 60_000).toISOString();

if (action === 'publish' || action === 'republish_on_timeout') {
  const existingMeta = readDispatchMetaFromRemarks(await readOrderRemarks(request, cookies, orderId));
  const allRiders = readOnlineRiders({ riders: await fetchAvailableRiders(request, cookies) });
  const selectedRider = forceRiderId
    ? allRiders.find((row) => String(row.id || '').trim() === forceRiderId) || null
    : pickNextAvailableRider({
        riders: allRiders,
        lastAssignedRiderId: String(existingMeta.currentRiderId || '').trim(),
        excludedRiderIds: existingMeta.invalidatedRiderIds,
      });

  const nextMeta = selectedRider
    ? buildCurrentDispatchMeta({
        existingMeta,
        riderId: String(selectedRider.id || '').trim(),
        assignedAt: nowIso,
        expiresAt,
        invalidatedRiderId: action === 'publish' && existingMeta.currentRiderId && existingMeta.currentRiderId !== String(selectedRider.id || '').trim()
          ? String(existingMeta.currentRiderId || '').trim()
          : action === 'republish_on_timeout'
            ? String(existingMeta.currentRiderId || '').trim()
            : '',
        invalidationReason: action === 'republish_on_timeout' ? 'timeout' : 'reassigned',
      })
    : {
        ...existingMeta,
        invalidatedRiderIds: Array.from(new Set([...(existingMeta.invalidatedRiderIds || []), String(existingMeta.currentRiderId || '').trim()].filter(Boolean))),
        currentRiderId: '',
        currentAssignedAt: '',
        currentExpiresAt: '',
        lastInvalidationReason: action === 'republish_on_timeout' ? 'timeout' : 'reassigned',
      };

  await writeOrderRemarks(request, cookies, orderId, nextMeta);
  if (!selectedRider) {
    return new Response(JSON.stringify({ success: true, action, order: mergedOrder, telegram_dispatch: { skippedReason: 'no_next_rider' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const telegram_dispatch = await notifyTelegramRecipients(request, cookies, mergedOrder, [selectedRider]);
  return new Response(JSON.stringify({ success: true, action, order: mergedOrder, telegram_dispatch }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/admin-rider-dispatch-route-spec.ts`
Expected: PASS，首次派单/改派/超时续派都写入当前轮元数据，且只给当前有效骑手发消息。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/rider-dispatch.ts src/lib/rider-assignment.ts src/lib/rider-dispatch.ts src/lib/admin-rider-dispatch-route-spec.ts
git commit -m "feat: unify admin redispatch flow"
```

### Task 5: 在 rider dashboard 展示已改派/接单超时并禁用旧按钮

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/tests/pages/rider-dashboard-canonical.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('rider dashboard source renders invalidated dispatch state with disabled actions', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /getRiderDispatchState/);
  assert.match(source, /invalidReason/);
  assert.match(source, /已改派/);
  assert.match(source, /接单超时/);
  assert.match(source, /button\.disabled = true/);
  assert.match(source, /button\.className = 'btn-action btn-disabled'/);
  assert.match(source, /button\.textContent = actionState\.invalidReason/);
  assert.match(source, /window\.declineOrder = async function\(id\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
历史红灯预期：，说明页面还未使用共享失效 helper，也没有禁用态展示。

- [ ] **Step 3: Write minimal implementation**

```ts
import { getAdminDispatchStatusCopy, getRiderDispatchState, getRiderStatusHintCopy, readDispatchMetaFromRemarks } from '../../lib/rider-dispatch.ts';

const actionState = getRiderDispatchState(
  { status: o.status, courierPhone: o.courierPhone || o.courier_phone || '' },
  readDispatchMetaFromRemarks(o.remarksJson || o.remarks_json || ''),
  rider?.id,
  new Date().toISOString(),
);

if (actionState.invalidReason) {
  const actionWrap = document.createElement('div');
  actionWrap.className = 'action-btns';
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = true;
  button.className = 'btn-action btn-disabled';
  button.textContent = actionState.invalidReason;
  actionWrap.appendChild(button);
  card.appendChild(actionWrap);
} else if (actionState.canAccept || actionState.canDecline) {
  const actionWrap = document.createElement('div');
  actionWrap.className = 'action-btns';
  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'btn-action btn-complete';
  acceptBtn.textContent = '接单';
  acceptBtn.addEventListener('click', () => window.takeOrder(o.id));
  const declineBtn = document.createElement('button');
  declineBtn.type = 'button';
  declineBtn.className = 'btn-action btn-call';
  declineBtn.textContent = '暂不接单';
  declineBtn.addEventListener('click', () => window.declineOrder(o.id));
  actionWrap.append(acceptBtn, declineBtn);
  card.appendChild(actionWrap);
}

window.declineOrder = async function(id) {
  const order = allOrders.find((item) => String(item?.id || '').trim() === String(id || '').trim());
  const callbackData = String(order?.declineCallbackData || '').trim();
  if (!callbackData || !String(rider?.telegramChatId || '').trim()) {
    alert('暂不接单失败');
    return;
  }
  const res = await fetch('/api/telegram/rider-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callbackData, chatId: rider.telegramChatId }),
  });
  if (!res.ok) alert('暂不接单失败');
  loadOrders();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: PASS，源码已显示失效态、禁用态和 decline 动作。

- [ ] **Step 5: Commit**

```bash
git add src/pages/rider/dashboard.astro src/tests/pages/rider-dashboard-canonical.test.ts src/lib/rider-dispatch.ts
git commit -m "feat: show invalidated rider dispatch state"
```

### Task 6: 跑自动续派聚焦回归

**Files:**
- Test: `src/lib/rider-dispatch-spec.ts`
- Test: `src/config.test.ts`
- Test: `src/lib/rider-assignment.test.ts`
- Test: `src/lib/telegram-rider-claim-route-spec.ts`
- Test: `src/lib/admin-rider-dispatch-route-spec.ts`
- Test: `src/tests/pages/rider-dashboard-canonical.test.ts`

- [ ] **Step 1: Run shared helper and config tests**

Run: `node --test src/lib/rider-dispatch-spec.ts src/config.test.ts src/lib/rider-assignment.test.ts`
Expected: PASS

- [ ] **Step 2: Run Telegram callback regression**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS

- [ ] **Step 3: Run admin redispatch regression**

Run: `node --test src/lib/admin-rider-dispatch-route-spec.ts`
Expected: PASS

- [ ] **Step 4: Run rider dashboard regression**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch-spec.ts src/config.test.ts src/lib/rider-assignment.test.ts src/lib/telegram-rider-claim-route-spec.ts src/lib/admin-rider-dispatch-route-spec.ts src/tests/pages/rider-dashboard-canonical.test.ts
git commit -m "test: verify auto redispatch flow"
```
