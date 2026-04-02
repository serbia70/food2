# Admin Dispatch Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 admin 成为商家默认派单入口，支持广播通知、手动指派、自动派单，并让 rider 端能正确区分待接单池与我的配送。

**Architecture:** 保留 `src/pages/api/admin/rider-dispatch.ts` 作为纯广播/提醒边界，新建 `src/pages/api/admin/rider-assign.ts` 和 `src/lib/rider-assignment.ts` 收口手动/自动指派逻辑。admin 与 master 都复用同一套 assign API，rider dashboard 则从“只看已归属订单”改为“待接单池 + 我的配送”双视图，但保持页面结构最小改动。

**Tech Stack:** Astro API routes、TypeScript、Astro pages、浏览器脚本、Node built-in test runner、pnpm

---

## File map

- `src/lib/rider-assignment.ts`
  - 新增共享指派逻辑
  - 负责读取在线骑手、按店轮询选择下一位、组装订单更新 payload、触发定向通知
- `src/lib/rider-assignment.test.ts`
  - 新增共享层单测，覆盖轮询、离线顺延、无在线骑手
- `src/pages/api/admin/rider-assign.ts`
  - 新增 admin 指派 API
  - 支持 `manual_assign` 与 `auto_assign`
- `src/tests/pages/api/admin-rider-assign.test.ts`
  - 新增 API 测试，锁住手动/自动指派语义与错误返回
- `src/pages/api/admin/rider-dispatch.ts`
  - 继续保留广播/提醒
  - 明确只负责 `awaiting_courier` 与 Telegram 广播，不承担最终归属
- `src/tests/pages/api/admin-rider-dispatch.test.ts`
  - 扩充广播语义测试，锁住“广播成功但部分通知失败不回滚”
- `src/components/admin/TabTables.astro`
  - 为外卖卡片保留 `指派骑手 / 自动派单` 按钮与已归属显示
  - 移除独立 `通知骑手` 按钮
- `src/scripts/admin/order-actions.ts`
  - 新增 admin 侧手动/自动派单动作
  - 保留已有广播入口
- `src/scripts/admin/orders.ts`
  - 新增 `assignRider()` / `autoAssignRider()` 请求函数
- `src/scripts/master/dispatch-actions.ts`
  - 改为复用新 assign API，不再在 master 侧直接更新订单状态
- `src/pages/api/rider/status.ts`
  - 如有必要，为 rider 待接单池补齐可见性相关 rider 列表数据契约
- `src/pages/rider/dashboard.astro`
  - 将 active 视图拆成“待接单池 + 我的配送”的渲染规则
- `src/tests/pages/rider-dashboard-canonical.test.ts`
  - 扩充 rider 页面源测试，锁住双列表逻辑与字段契约
- `src/tests/pages/master/master-dispatch-ui.test.ts`
  - 校验 master 继续复用 assign API

## Scope guardrails

- 不重做 Telegram Bot 消息模板
- 不把商家自定义骑手并入 master 统计/管理
- 不重构 `src/pages/master/index.astro`
- 不引入距离/负载均衡等复杂算法
- 不在本轮实现完整“骑手自主抢单”闭环，只确保广播态可见与后续承接能力

### Task 1: 先收口共享指派能力与轮询规则

**Files:**
- Create: `src/lib/rider-assignment.ts`
- Create: `src/lib/rider-assignment.test.ts`
- Reference: `src/lib/rider-dispatch.ts`
- Reference: `src/pages/api/admin/rider-dispatch.ts`

- [ ] **Step 1: Write the failing test**

在 `src/lib/rider-assignment.test.ts` 新建下面这组测试，先锁住轮询与 payload 生成语义：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pickNextAvailableRider,
  buildAssignedOrderStatusPayload,
  readOnlineRiders,
} from '../../lib/rider-assignment.ts';

test('readOnlineRiders keeps only available riders with phone and stable order', () => {
  const rows = readOnlineRiders([
    { id: 9, name: 'C', phone: '063', status: 'busy' },
    { id: 2, name: 'B', phone: '062', status: 'available' },
    { id: 1, name: 'A', phone: '061', status: 'available' },
    { id: 4, name: 'NoPhone', phone: '', status: 'available' },
  ]);

  assert.deepEqual(rows, [
    { id: 1, name: 'A', phone: '061', status: 'available' },
    { id: 2, name: 'B', phone: '062', status: 'available' },
  ]);
});

test('pickNextAvailableRider returns first rider when there is no cursor', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 1, name: 'A', phone: '061', status: 'available' },
      { id: 2, name: 'B', phone: '062', status: 'available' },
    ],
    lastAssignedRiderId: '',
  });

  assert.equal(rider?.id, 1);
});

test('pickNextAvailableRider advances after previous rider id', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 1, name: 'A', phone: '061', status: 'available' },
      { id: 2, name: 'B', phone: '062', status: 'available' },
      { id: 3, name: 'C', phone: '063', status: 'available' },
    ],
    lastAssignedRiderId: '2',
  });

  assert.equal(rider?.id, 3);
});

test('pickNextAvailableRider wraps to first rider when cursor points at last rider', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 1, name: 'A', phone: '061', status: 'available' },
      { id: 2, name: 'B', phone: '062', status: 'available' },
    ],
    lastAssignedRiderId: '2',
  });

  assert.equal(rider?.id, 1);
});

test('pickNextAvailableRider falls back to first rider when cursor rider is offline', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 2, name: 'B', phone: '062', status: 'available' },
      { id: 5, name: 'E', phone: '065', status: 'available' },
    ],
    lastAssignedRiderId: '99',
  });

  assert.equal(rider?.id, 2);
});

test('buildAssignedOrderStatusPayload writes canonical delivering payload', () => {
  assert.deepEqual(
    buildAssignedOrderStatusPayload({
      rider: { id: 2, name: 'B', phone: '062', status: 'available' },
    }),
    {
      status: 'delivering',
      courierName: 'B',
      courierPhone: '062',
      courier_name: 'B',
      courier_phone: '062',
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-assignment.test.ts`

Expected: FAIL，因为文件还不存在，导入会报 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: Write minimal implementation**

创建 `src/lib/rider-assignment.ts`，写入下面最小实现：

```ts
import type { Rider } from '../types/index.ts';

export type AssignableRider = Pick<Rider, 'id' | 'name' | 'phone' | 'status'>;

export function readOnlineRiders(input: unknown): AssignableRider[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((row): row is AssignableRider => !!row && typeof row === 'object')
    .map((row) => ({
      id: (row as AssignableRider).id,
      name: String((row as AssignableRider).name || '').trim(),
      phone: String((row as AssignableRider).phone || '').trim(),
      status: String((row as AssignableRider).status || '').trim(),
    }))
    .filter((row) => row.status === 'available' && row.phone)
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
}

export function pickNextAvailableRider({
  riders,
  lastAssignedRiderId,
}: {
  riders: AssignableRider[];
  lastAssignedRiderId: string;
}): AssignableRider | null {
  if (!Array.isArray(riders) || riders.length === 0) return null;

  const currentIndex = riders.findIndex((row) => String(row.id || '').trim() === String(lastAssignedRiderId || '').trim());
  if (currentIndex === -1) return riders[0] || null;
  return riders[(currentIndex + 1) % riders.length] || null;
}

export function buildAssignedOrderStatusPayload({ rider }: { rider: AssignableRider }) {
  const riderName = String(rider?.name || '').trim();
  const riderPhone = String(rider?.phone || '').trim();

  return {
    status: 'delivering',
    courierName: riderName,
    courierPhone: riderPhone,
    courier_name: riderName,
    courier_phone: riderPhone,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-assignment.test.ts`

Expected: PASS，轮询与 payload 生成行为全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-assignment.ts src/lib/rider-assignment.test.ts && git commit -m "$(cat <<'EOF'
feat: add shared rider assignment helpers
EOF
)"
```

### Task 2: 新增 admin 指派 API，锁住手动与自动派单语义（含预计取餐时间）

**Files:**
- Create: `src/pages/api/admin/rider-assign.ts`
- Create: `src/tests/pages/api/admin-rider-assign.test.ts`
- Reference: `src/pages/api/admin/rider-dispatch.ts`
- Reference: `src/lib/rider-assignment.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/tests/pages/api/admin-rider-assign.test.ts`，写入下面测试：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'http://localhost:3030';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/admin/rider-assign.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createCookies() {
  return {
    get(name: string) {
      if (name === 'admin_token') return { value: 'test-token' };
      return undefined;
    },
  };
}

test('manual_assign updates order to delivering for selected available rider', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/admin/orders/470/status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.status, 'delivering');
      assert.equal(body.courierName, '骑手A');
      assert.equal(body.courierPhone, '061');
      assert.equal(body.pickupEtaMinutes, 15);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/telegram/send') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'manual_assign', orderId: '470', riderId: '7', shopSlug: 'demo-shop', pickupEtaMinutes: 15 }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.ok(calls.includes('http://localhost:3030/api/admin/orders/470/status'));
});

test('auto_assign picks next available rider when cursor is present', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
          { id: 8, name: '骑手B', phone: '062', status: 'available', telegramChatId: 'tg-8' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/admin/orders/471/status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.courierName, '骑手B');
      assert.equal(body.courierPhone, '062');
      assert.equal(body.pickupEtaMinutes, 20);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/telegram/send') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'auto_assign', orderId: '471', shopSlug: 'demo-shop', lastAssignedRiderId: '7', pickupEtaMinutes: 20 }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('returns no_available_riders when no available rider exists', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({ riders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'auto_assign', orderId: '472', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'no_available_riders',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/api/admin-rider-assign.test.ts`

Expected: FAIL，因为 `src/pages/api/admin/rider-assign.ts` 还不存在。

- [ ] **Step 3: Write minimal implementation**

创建 `src/pages/api/admin/rider-assign.ts`，写入下面实现：

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import {
  buildAssignedOrderStatusPayload,
  pickNextAvailableRider,
  readOnlineRiders,
  type AssignableRider,
} from '../../../lib/rider-assignment.ts';

export const prerender = false;

async function fetchAvailableRiders(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies']) {
  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/riders`,
    method: 'GET',
  });
  const text = await res.text();
  if (!res.ok) return [] as AssignableRider[];

  try {
    const parsed = JSON.parse(text) as { riders?: unknown };
    return readOnlineRiders(parsed.riders);
  } catch {
    return [] as AssignableRider[];
  }
}

async function notifyAssignedRider({ rider, shopSlug }: { rider: AssignableRider; shopSlug: string }) {
  const chatId = String((rider as { telegramChatId?: unknown; telegram_chat_id?: unknown }).telegramChatId || (rider as { telegram_chat_id?: unknown }).telegram_chat_id || '').trim();
  if (!chatId) return;

  await fetch(`${API_BASE_URL}/api/telegram/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shopSlug,
      chat_id: chatId,
      text: `订单已指派给你：${String(rider.name || '').trim()}`,
    }),
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || '').trim();
  const orderId = String(body.orderId || '').trim();
  const shopSlug = String(body.shopSlug || '').trim();
  const lastAssignedRiderId = String(body.lastAssignedRiderId || '').trim();
  const pickupEtaMinutes = Number(body.pickupEtaMinutes || 0);
  const manualRiderId = String(body.riderId || '').trim();

  if (!orderId) {
    return new Response(JSON.stringify({ success: false, error: 'order_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const riders = await fetchAvailableRiders(request, cookies);
  let target: AssignableRider | null = null;

  if (action === 'manual_assign') {
    target = riders.find((row) => String(row.id || '').trim() === manualRiderId) || null;
  }

  if (action === 'auto_assign') {
    target = pickNextAvailableRider({ riders, lastAssignedRiderId });
  }

  if (!target) {
    return new Response(JSON.stringify({ success: false, error: 'no_available_riders' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updateRes = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders/${encodeURIComponent(orderId)}/status`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildAssignedOrderStatusPayload({ rider: target }),
      pickupEtaMinutes,
    }),
  });

  const updateText = await updateRes.text();
  let updateJson: Record<string, unknown> = {};
  try {
    updateJson = JSON.parse(updateText) as Record<string, unknown>;
  } catch {
    updateJson = {};
  }

  if (!updateRes.ok || updateJson.success === false) {
    return new Response(JSON.stringify({
      success: false,
      error: 'order_update_failed',
      upstream_status: updateRes.status,
      upstream_body: updateText || JSON.stringify(updateJson),
    }), {
      status: updateRes.status || 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await notifyAssignedRider({ rider: target, shopSlug });

  return new Response(JSON.stringify({
    success: true,
    rider: {
      id: target.id,
      name: target.name,
      phone: target.phone,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/api/admin-rider-assign.test.ts`

Expected: PASS；manual/auto/no_available 三组都通过。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/rider-assign.ts src/tests/pages/api/admin-rider-assign.test.ts && git commit -m "$(cat <<'EOF'
feat: add admin rider assignment api
EOF
)"
```

### Task 3: 把 admin 页面动作改成手动指派、自动派单，并在动作前统一选择预计时间

**Files:**
- Modify: `src/components/admin/TabTables.astro`
- Modify: `src/scripts/admin/orders.ts`
- Modify: `src/scripts/admin/order-actions.ts`
- Modify: `src/tests/pages/master/dine-in-panel-routing.test.ts`
- Modify: `src/scripts/admin/orders.test.ts`

- [ ] **Step 1: Write the failing tests**

先在 `src/tests/pages/master/dine-in-panel-routing.test.ts` 追加下面这个源码测试：

```ts
test('delivery cards source exposes assign and auto-assign actions without notify button', async () => {
  const tabTablesPath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');
  const tabTables = await readFile(tabTablesPath, 'utf8');

  assert.doesNotMatch(tabTables, /data-admin-action="open-delivery"/);
  assert.match(tabTables, /data-admin-action="assign-rider"/);
  assert.match(tabTables, /data-admin-action="auto-assign-rider"/);
  assert.match(tabTables, /已指派骑手/);
});
```

再在 `src/scripts/admin/orders.test.ts` 追加下面测试：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { assignRider, autoAssignRider } from './orders';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('assignRider posts manual_assign payload with eta', async () => {
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await assignRider('470', '7', { shopSlug: 'demo-shop', pickupEtaMinutes: 15 });

  assert.deepEqual(capturedBody, {
    action: 'manual_assign',
    orderId: '470',
    riderId: '7',
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 15,
  });
});

test('autoAssignRider posts auto_assign payload with cursor and eta', async () => {
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await autoAssignRider('471', { shopSlug: 'demo-shop', lastAssignedRiderId: '7', pickupEtaMinutes: 20 });

  assert.deepEqual(capturedBody, {
    action: 'auto_assign',
    orderId: '471',
    shopSlug: 'demo-shop',
    lastAssignedRiderId: '7',
    pickupEtaMinutes: 20,
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/scripts/admin/orders.test.ts src/tests/pages/master/dine-in-panel-routing.test.ts`

Expected: FAIL；因为当前 `orders.ts` 没有 `assignRider/autoAssignRider`，`TabTables.astro` 也没有这两个按钮。

- [ ] **Step 3: Write minimal implementation**

在 `src/scripts/admin/orders.ts` 追加两个函数：

```ts
export async function assignRider(orderId: string, riderId: string, input: { shopSlug?: string; pickupEtaMinutes?: number } = {}) {
  const res = await fetch('/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId,
      riderId,
      shopSlug: input.shopSlug || '',
      pickupEtaMinutes: Number(input.pickupEtaMinutes || 0),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'assign rider failed');
  }

  if (window.showToast) window.showToast('已指派骑手');
  if (window.refreshOrderList) window.refreshOrderList();
}

export async function autoAssignRider(orderId: string, input: { shopSlug?: string; lastAssignedRiderId?: string; pickupEtaMinutes?: number } = {}) {
  const res = await fetch('/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'auto_assign',
      orderId,
      shopSlug: input.shopSlug || '',
      lastAssignedRiderId: input.lastAssignedRiderId || '',
      pickupEtaMinutes: Number(input.pickupEtaMinutes || 0),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'auto assign rider failed');
  }

  if (window.showToast) window.showToast('已自动派单');
  if (window.refreshOrderList) window.refreshOrderList();
}
```

在 `src/scripts/admin/order-actions.ts` 顶部 import 改成：

```ts
import { fetchAvailableRiders, publishRiderDispatch, remindRiders, assignRider, autoAssignRider } from './orders';
```

然后在文件末尾 `registerAdminGlobal(...)` 下面追加：

```ts
function readAssignContext(orderId: string) {
  const hidden = document.querySelector(`.hidden-data[data-order-id="${orderId}"]`) as HTMLElement | null
    || document.querySelector(`.hidden-data[data-oid="${orderId}"]`) as HTMLElement | null;
  const runtime = (window as typeof window & {
    __adminRuntime?: { shopSlug?: string };
    __adminDispatchCursor?: Record<string, string>;
  }).__adminRuntime;
  const cursorStore = ((window as typeof window & { __adminDispatchCursor?: Record<string, string> }).__adminDispatchCursor ||= {});
  const shopSlug = String(runtime?.shopSlug || '').trim();
  const lastAssignedRiderId = String(cursorStore[shopSlug] || '').trim();
  return {
    shopSlug,
    lastAssignedRiderId,
    hidden,
    cursorStore,
  };
}

async function pickDispatchEtaMinutes() {
  const selection = prompt('请选择预计取餐时间：\n1. 10 分钟\n2. 15 分钟\n3. 20 分钟\n4. 30 分钟\n5. 45 分钟\n\n请输入序号');
  if (!selection) return 0;
  const options = [10, 15, 20, 30, 45];
  return Number(options[Number(selection) - 1] || 0);
}

registerAdminGlobal('assign-rider', async (el: HTMLElement) => {
  const orderId = String(el?.dataset?.orderId || '').trim();
  if (!orderId) return;

  try {
    const pickupEtaMinutes = await pickDispatchEtaMinutes();
    if (!pickupEtaMinutes) {
      showAdminToast('请选择预计取餐时间');
      return;
    }

    const riders = await fetchAvailableRiders();
    if (riders.length === 0) {
      showAdminToast('当前无可接单骑手');
      return;
    }

    const lines = riders.map((rider, idx) => `${idx + 1}. ${rider.name} (${rider.phone})`);
    const selected = prompt(`选择要指派的骑手：\n${lines.join('\n')}\n\n请输入序号`);
    if (!selected) return;

    const target = riders[Number(selected) - 1];
    if (!target) {
      showAdminToast('序号无效');
      return;
    }

    const { shopSlug, cursorStore } = readAssignContext(orderId);
    await assignRider(orderId, String(target.id || ''), { shopSlug, pickupEtaMinutes });
    if (shopSlug) cursorStore[shopSlug] = String(target.id || '').trim();
  } catch (error) {
    showAdminToast(getErrorMessage(error, '指派骑手失败'));
  }
}, false);

registerAdminGlobal('auto-assign-rider', async (el: HTMLElement) => {
  const orderId = String(el?.dataset?.orderId || '').trim();
  if (!orderId) return;

  try {
    const pickupEtaMinutes = await pickDispatchEtaMinutes();
    if (!pickupEtaMinutes) {
      showAdminToast('请选择预计取餐时间');
      return;
    }

    const { shopSlug, lastAssignedRiderId } = readAssignContext(orderId);
    await autoAssignRider(orderId, { shopSlug, lastAssignedRiderId, pickupEtaMinutes });
  } catch (error) {
    showAdminToast(getErrorMessage(error, '自动派单失败'));
  }
}, false);
```

最后把 `src/components/admin/TabTables.astro` 外卖卡片按钮区补成下面结构，替换原先 `(o.status === 'pending' || o.status === 'confirmed')` 这一段：

```astro
{(o.status === 'pending' || o.status === 'confirmed' || o.status === 'awaiting_courier') && (
  <>
    <button class="btn-xs" data-admin-action="assign-rider" data-order-id={o.id} style="background:#7c3aed; color:white;">👤 指派骑手</button>
    <button class="btn-xs" data-admin-action="auto-assign-rider" data-order-id={o.id} style="background:#0f766e; color:white;">🔁 自动派单</button>
    <button class="btn-xs" data-admin-action="mark-paid" data-order-id={o.id} style="background:#4caf50; color:white;">💰 结账</button>
    <button class="btn-xs" data-admin-action="open-reject" data-order-id={o.id} style="background:#f44336; color:white;">❌ 拒绝</button>
  </>
)}
{o.status === 'delivering' && (
  <span style="font-size:12px; color:#7c2d12; font-weight:700;">已指派骑手：{o.courierName || o.courierPhone || '未命名骑手'}</span>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/scripts/admin/orders.test.ts src/tests/pages/master/dine-in-panel-routing.test.ts`

Expected: PASS；admin 请求函数与外卖卡片按钮源码断言都通过。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabTables.astro src/scripts/admin/orders.ts src/scripts/admin/order-actions.ts src/scripts/admin/orders.test.ts src/tests/pages/master/dine-in-panel-routing.test.ts && git commit -m "$(cat <<'EOF'
feat: add admin dispatch assignment actions
EOF
)"
```

### Task 4: 让 rider dashboard 同时支持待接单池和我的配送

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/tests/pages/rider-dashboard-canonical.test.ts`

- [ ] **Step 1: Write the failing source test**

在 `src/tests/pages/rider-dashboard-canonical.test.ts` 追加下面断言：

```ts
test('rider dashboard source separates awaiting pool from assigned deliveries', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /const availablePool = allOrders\.filter\(/);
  assert.match(source, /o\.status === 'awaiting_courier'/);
  assert.match(source, /const assignedOrders = allOrders\.filter\(/);
  assert.match(source, /o\.status === 'delivering'/);
  assert.match(source, /String\(o\.courierPhone \|\| ''\)\.trim\(\) === String\(rider\?\.phone \|\| ''\)\.trim\(\)/);
  assert.match(source, /const myOrders = currentTab === 'active' \? \[\.\.\.availablePool, \.\.\.assignedOrders\] : allOrders;/);
  assert.doesNotMatch(source, /const myOrders = allOrders;/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`

Expected: FAIL；当前源码仍是 `const myOrders = allOrders;`。

- [ ] **Step 3: Write minimal implementation**

在 `src/pages/rider/dashboard.astro` 的 `renderOrders()` 里，把这段：

```ts
const myOrders = allOrders;
```

替换成：

```ts
const availablePool = allOrders.filter((o) => (
  o &&
  o.status === 'awaiting_courier' &&
  !String(o.courierPhone || '').trim()
));
const assignedOrders = allOrders.filter((o) => (
  o &&
  o.status === 'delivering' &&
  String(o.courierPhone || '').trim() === String(rider?.phone || '').trim()
));
const myOrders = currentTab === 'active' ? [...availablePool, ...assignedOrders] : allOrders;
```

其余渲染逻辑保持不动，继续使用已有 `canTake` 与 delivering 按钮分支。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`

Expected: PASS；源测试确认 rider 页面不再把 active 视图直接等同于全部订单。

- [ ] **Step 5: Commit**

```bash
git add src/pages/rider/dashboard.astro src/tests/pages/rider-dashboard-canonical.test.ts && git commit -m "$(cat <<'EOF'
feat: split rider active view into pool and assigned orders
EOF
)"
```

### Task 5: 把 master 指派入口改成复用新 assign API

**Files:**
- Modify: `src/scripts/master/dispatch-actions.ts`
- Modify: `src/tests/pages/master/master-dispatch-ui.test.ts`

- [ ] **Step 1: Write the failing source test**

在 `src/tests/pages/master/master-dispatch-ui.test.ts` 追加下面断言：

```ts
test('master dispatch source reuses admin rider assign api', async () => {
  const pagePath = resolve(process.cwd(), 'src/scripts/master/dispatch-actions.ts');
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /fetch\('\/api\/admin\/rider-assign'/);
  assert.match(source, /action: 'manual_assign'/);
  assert.doesNotMatch(source, /fetch\(`\/api\/admin\/orders\/\$\{encodeURIComponent\(normalizedOrderId\)\}\/status`/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/master/master-dispatch-ui.test.ts`

Expected: FAIL；当前 master 还直接调用 `/api/admin/orders/:id/status`。

- [ ] **Step 3: Write minimal implementation**

把 `src/scripts/master/dispatch-actions.ts` 里 `masterDispatchAssignRider()` 的更新部分替换为：

```ts
      const assignRes = await fetch('/api/admin/rider-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_assign',
          orderId: normalizedOrderId,
          riderId: String(target?.id || '').trim(),
        }),
      });
      const assignData = await assignRes.json().catch(() => ({}));
      if (!assignRes.ok || assignData?.success === false) {
        throw new Error(String(assignData?.error || '指派骑手失败'));
      }
```

并删除原来的 `/api/admin/orders/${id}/status` 直接写单代码块。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/master/master-dispatch-ui.test.ts`

Expected: PASS；master 指派路径只通过新 assign API。

- [ ] **Step 5: Commit**

```bash
git add src/scripts/master/dispatch-actions.ts src/tests/pages/master/master-dispatch-ui.test.ts && git commit -m "$(cat <<'EOF'
refactor: route master dispatch assignment through shared api
EOF
)"
```

### Task 6: 收口广播语义并跑聚焦回归

**Files:**
- Modify: `src/pages/api/admin/rider-dispatch.ts`
- Modify: `src/tests/pages/api/admin-rider-dispatch.test.ts`
- Verify: `src/tests/pages/api/admin-rider-assign.test.ts`
- Verify: `src/tests/pages/rider-dashboard-canonical.test.ts`
- Verify: `src/tests/pages/master/master-dispatch-ui.test.ts`
- Verify: `src/tests/pages/master/dine-in-panel-routing.test.ts`

- [ ] **Step 1: Write the failing broadcast test**

在 `src/tests/pages/api/admin-rider-dispatch.test.ts` 追加下面测试，锁住“广播成功但无最终归属”语义：

```ts
test('publish updates order into awaiting_courier without courier assignment fields', async () => {
  let statusUpdateBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/orders/480/status') {
      statusUpdateBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({ riders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({
        orderId: '480',
        action: 'publish',
        status: 'awaiting_courier',
        pickupEtaMinutes: 15,
        shopSlug: 'demo-shop',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'test-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(statusUpdateBody?.status, 'awaiting_courier');
  assert.equal('courierName' in (statusUpdateBody || {}), false);
  assert.equal('courierPhone' in (statusUpdateBody || {}), false);
});
```

- [ ] **Step 2: Run focused tests to verify current failures**

Run: `node --test src/tests/pages/api/admin-rider-dispatch.test.ts src/tests/pages/api/admin-rider-assign.test.ts src/tests/pages/rider-dashboard-canonical.test.ts src/tests/pages/master/master-dispatch-ui.test.ts src/tests/pages/master/dine-in-panel-routing.test.ts`

Expected: 至少首个新加广播测试 FAIL；如果前面任务还未实施完，这里也会一起暴露 assign / rider / master 相关缺口。

- [ ] **Step 3: Write minimal implementation**

检查 `src/pages/api/admin/rider-dispatch.ts` 的 `publish` 分支，确保 `updatePayload` 只包含：

```ts
const updatePayload = {
  status: parsedBody.status,
  pickupEtaMinutes: parsedBody.pickupEtaMinutes,
  pickupReadyAt: parsedBody.pickupReadyAt,
  riderBroadcastedAt: parsedBody.riderBroadcastedAt,
  riderRemindCount: parsedBody.riderRemindCount,
  riderLastRemindedAt: parsedBody.riderLastRemindedAt,
};
```

不要补入任何 `courierName/courierPhone` 或 snake_case 骑手归属字段。若文件当前已符合此结构，则本步无需改动代码，直接进入回归验证。

- [ ] **Step 4: Run the full focused regression set**

Run: `node --test src/tests/pages/api/admin-rider-dispatch.test.ts src/tests/pages/api/admin-rider-assign.test.ts src/tests/pages/rider-dashboard-canonical.test.ts src/tests/pages/master/master-dispatch-ui.test.ts src/tests/pages/master/dine-in-panel-routing.test.ts src/scripts/admin/orders.test.ts src/lib/rider-assignment.test.ts`

Expected: PASS；广播、assign API、rider 页面、master 复用与 admin UI/脚本层全部通过。

- [ ] **Step 5: Run build verification**

Run: `pnpm build`

Expected: PASS；Astro 页面、API 路由与客户端脚本构建通过。

- [ ] **Step 6: Commit final verification state**

如果本任务为了修正回归有代码变更，再创建收尾提交；若只有测试验证且工作树干净，则跳过提交。需要提交时使用：

```bash
git add src/pages/api/admin/rider-dispatch.ts src/tests/pages/api/admin-rider-dispatch.test.ts && git commit -m "$(cat <<'EOF'
fix: finalize admin-first dispatch flow
EOF
)"
```

## Self-review checklist

- Spec coverage:
  - admin 成为主派单入口 → Task 2、Task 3
  - 广播/手动指派/自动派单拆开 → Task 2、Task 3、Task 6
  - 自动派单共享轮询 → Task 1、Task 2、Task 5
  - rider 待接单池 + 我的配送 → Task 4
  - master 改为兜底复用 assign API → Task 5
  - 广播保持 `awaiting_courier` 且不写归属 → Task 6
- Placeholder scan:
  - 无 `TBD` / `TODO` / “类似 Task N” 占位
  - 每个代码步骤都给出了具体代码
  - 每个验证步骤都给了单行命令与预期结果
- Type consistency:
  - 共享层统一使用 `AssignableRider`
  - API 动作统一使用 `manual_assign` / `auto_assign`
  - 指派落库统一使用 `buildAssignedOrderStatusPayload()`
  - 广播状态统一保持 `awaiting_courier`
