# Rider Sync Implementation Plan

> 状态说明（已过期）：这份计划对应的是中间阶段方案，文中的 `历史红灯预期：`、新增 rider web action route、Telegram 阶段补消息等表述都不应再被当作当前实现基线。
> 当前应优先以 `docs/superpowers/specs/2026-04-15-dispatch-telegram-rider-admin-cleanup-design.md`、`src/lib/rider-dispatch.ts`、`src/lib/telegram-dispatch.ts`、`src/pages/api/telegram/rider-claim.ts` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Telegram、rider dashboard、admin 围绕同一套骑手动作判定、同步语义和骑手展示字段工作，同时清理 rider dashboard 里已经失效的前端猜测逻辑。

**Architecture:** 先把四个骑手动作的服务端判定与骑手展示字段收口到 `src/lib/rider-dispatch.ts` 一侧，再让 Telegram route 与新的 rider web action route 作为两层薄适配。rider dashboard 只消费共享动作结果和共享展示字段，不再直连薄 `update_status` 路由拼接业务语义；Telegram 继续走 callback，但只负责解析、鉴权与追加阶段消息（历史方案）。

**Tech Stack:** Astro, TypeScript, Node test runner, existing Telegram callback flow, existing admin/rider BFF routes.

---

## File Map

- Modify: `src/lib/rider-dispatch.ts`
  - 扩展共享动作判定、统一状态文案、统一骑手展示字段与地图链接解析。
- Modify: `src/lib/rider-dispatch-spec.ts`
  - 为共享动作判定、snake_case 数据兼容、共享展示字段补红灯。
- Modify: `src/lib/telegram-dispatch.ts`
  - 复用共享展示字段生成 Telegram 各阶段消息，补店铺名与地图链接。
- Modify: `src/lib/telegram-rider-claim-route-spec.ts`
  - 锁定 Telegram 接单/取餐/送达时历史追加消息内容与 `reply_markup` 结构。
- Modify: `src/pages/api/telegram/rider-claim.ts`
  - 改为调用共享动作核心，保留 Telegram 专属 callback 解析与阶段历史阶段消息。
- Create: `src/pages/api/rider/action.ts`
  - rider web 专用动作路由，读取 rider 身份并调用同一套共享动作核心。
- Modify: `src/pages/api/rider/orders.ts`
  - 对 rider orders 返回值补统一展示字段，减少页面内临时拼接。
- Modify: `src/pages/rider/dashboard.astro`
  - 删除前端直调 `update_status` 与手拼 remarks 逻辑，接入 rider action route，重做摘要区 / tabs / 列表区 / 地图按钮。
- Modify: `src/pages/[slug]/index.astro`
  - 抽出当前店铺地图来源，避免 rider 端与首页地图入口继续分叉。
- Modify: `src/components/admin/TabOrders.astro`
  - 统一主状态文案，继续弱化显示骑手反馈。
- Modify: `src/pages/api/admin/rider-dispatch.ts`
  - 广播给 Telegram 的待接单消息接入共享展示字段。
- Modify: `src/pages/api/admin/rider-assign.ts`
  - 指定骑手消息接入共享展示字段。

---

### Task 1: 收口共享动作判定与骑手展示字段

**Files:**
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRiderOrderView,
  getAdminDispatchStatusCopy,
  getRiderActionFlags,
  getRiderDispatchState,
  readDispatchMetaFromRemarks,
} from './rider-dispatch.ts';

test('buildRiderOrderView returns shared shop and map fields', () => {
  const view = buildRiderOrderView({
    id: 18,
    status: 'delivering',
    shopName: 'Pizza One',
    shopAddress: 'Bulevar 1',
    shopMapUrl: '',
    tableInfo: 'Kralja Petra 10',
    totalAmount: 2300,
    pickupEtaMinutes: 18,
    courierPhone: '0611',
  });

  assert.equal(view.shopName, 'Pizza One');
  assert.equal(view.shopAddress, 'Bulevar 1');
  assert.match(view.shopMapUrl, /google\.com\/maps\/search/);
  assert.equal(view.deliveryAddress, 'Kralja Petra 10');
  assert.match(view.deliveryMapUrl, /google\.com\/maps\/search/);
  assert.equal(view.orderStatusCopy, '配送中');
});

test('getRiderActionFlags and dispatch state stay aligned for picked_up orders', () => {
  const meta = readDispatchMetaFromRemarks(JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"202","currentAssignedAt":"2026-04-11T10:00:00.000Z","currentExpiresAt":"2026-04-11T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
  ]));

  const flags = getRiderActionFlags({ status: 'picked_up', courierPhone: '0611' }, '0611');
  const state = getRiderDispatchState({ status: 'picked_up', courierPhone: '0611' }, meta, '202');

  assert.deepEqual(flags, {
    canAccept: false,
    canDecline: false,
    canPickUp: false,
    canComplete: true,
  });
  assert.equal(state.canComplete, true);
  assert.equal(getAdminDispatchStatusCopy('picked_up'), '配送中');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts`
历史红灯预期：，提示 `buildRiderOrderView` 未定义，或 `picked_up` 文案仍不是 `配送中`。

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildRiderOrderMapUrl(rawUrl: string | null | undefined, fallbackAddress: string | null | undefined): string {
  const direct = String(rawUrl || '').trim();
  if (direct) return direct;
  const address = String(fallbackAddress || '').trim();
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

export function buildRiderOrderView(order: Record<string, unknown>) {
  const shopName = String(order.shopName || order.restaurantName || '店铺').trim();
  const shopAddress = String(order.shopAddress || order.restaurantAddress || '').trim();
  const deliveryAddress = String(order.tableInfo || order.deliveryAddress || '').trim();
  return {
    shopName,
    shopAddress,
    shopMapUrl: buildRiderOrderMapUrl(order.shopMapUrl as string | undefined, shopAddress),
    deliveryAddress,
    deliveryMapUrl: buildRiderOrderMapUrl(order.deliveryMapUrl as string | undefined, deliveryAddress),
    orderStatusCopy: getAdminDispatchStatusCopy(String(order.status || '').trim() === 'picked_up' ? 'delivering' : String(order.status || '')),
    courierName: String(order.courierName || '').trim(),
    courierPhone: String(order.courierPhone || order.courier_phone || '').trim(),
    totalAmount: Number(order.totalAmount || 0) || 0,
    pickupEtaMinutes: Number(order.pickupEtaMinutes || 0) || 0,
  };
}

export function getAdminDispatchStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'awaiting_courier':
      return '待骑手接单';
    case 'delivering':
    case 'picked_up':
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

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS，且现有 snake_case 回归测试仍通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts
git commit -m "feat: unify rider dispatch state helpers"
```

### Task 2: 让 Telegram 消息改用共享展示字段并补店铺名/地图

**Files:**
- Modify: `src/lib/telegram-dispatch.ts`
- Modify: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('picked_up follow-up message includes shop name and delivery map link', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [{ id: TEST_RIDER_ID, name: TEST_RIDER_NAME, phone: TEST_RIDER_PHONE, telegramChatId: TEST_CHAT_ID, status: 'online' }] });
    }
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([{
        ...createOrderRow({ status: 'delivering', remarksJson: createRemarksJson(), courierPhone: TEST_RIDER_PHONE }),
        shopName: 'Pizza One',
        shopAddress: 'Bulevar 1',
        shopMapUrl: 'https://maps.example.com/shop',
      }]);
    }
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }
    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const telegramSendCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.ok(telegramSendCall);
  assert.match(telegramSendCall.body, /Pizza One/);
  assert.match(telegramSendCall.body, /maps\.example\.com\/shop/);
  assert.match(telegramSendCall.body, /google\.com\/maps\/search/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
历史红灯预期：，当前历史阶段消息不带店铺名和地图链接。

- [ ] **Step 3: Write minimal implementation**

```ts
import { buildRiderOrderView } from './rider-dispatch.ts';

export function buildRiderPickedUpTelegramMessage(input: RiderPickedUpTelegramInput & {
  shopName?: string;
  shopMapUrl?: string;
  deliveryMapUrl?: string;
}) {
  return {
    text: [
      `${String(input.shopName || '店铺').trim()} · 已接单`,
      `订单号：${input.orderNo}`,
      `到店导航：${String(input.shopMapUrl || '').trim() || '-'}`,
      `送达导航：${String(input.deliveryMapUrl || '').trim() || '-'}`,
      `地址：${input.address}`,
      `电话：${input.phone}`,
      `金额：${input.totalAmount} RSD`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: String(input.completeCallbackData || '').trim()
        ? [[{ text: '已取餐', callback_data: String(input.completeCallbackData).trim() }]]
        : [],
    },
  };
}
```

并在 `src/pages/api/telegram/rider-claim.ts` 的 `sendDeliveryProgressMessage()` 中先对 `order` 调 `buildRiderOrderView(order)`，再把 `shopName / shopMapUrl / deliveryMapUrl` 传给 `buildRiderPickedUpTelegramMessage()` 与 `buildRiderDeliveryCompleteTelegramMessage()`。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，Telegram 历史阶段消息中出现店铺名、到店地图和送达导航。

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram-dispatch.ts src/pages/api/telegram/rider-claim.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "feat: enrich rider telegram sync messages"
```

### Task 3: 把 Telegram route 的动作判断收口成共享核心

**Files:**
- Modify: `src/lib/rider-dispatch.ts`
- Modify: `src/pages/api/telegram/rider-claim.ts`
- Modify: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('complete uses shared action decision and returns order_status_updated when snapshot already delivering', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.error, 'order_status_updated');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
});

test('decline uses shared action decision and writes dispatch meta through one path', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000).replace('.a.', '.d.')));
  assert.notEqual(response.status, 500);
  assert.equal(calls.some((call) => call.url.endsWith('/api/admin/orders/remarks')), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
历史红灯预期：，当前 decline 仍然在 route 内自己拼 meta，动作判定没有统一出口。

- [ ] **Step 3: Write minimal implementation**

```ts
export function resolveRiderOrderAction(input: {
  action: 'accept' | 'decline' | 'picked_up' | 'complete';
  order: { status?: string | null; courierPhone?: string | null; remarksJson?: string | null };
  rider: { riderId: string; riderName: string; riderPhone: string };
  nowIso: string;
}) {
  // 返回 allowed / error / reason / expectedCurrentStatus / targetStatus / nextRemarksJson
}
```

然后在 `handleTelegramRiderClaim()` 中：
- 用 `resolveRiderOrderAction()` 统一生成 `updatePayload`；
- `decline` 时不再在 route 内单独组装 `buildDispatchMetaRemarks(...)`；
- 只保留 Telegram callback 解析、上游 fetch、历史阶段消息这三块 Telegram 专属逻辑。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，既有 accept / picked_up / complete 回归全部通过，decline 与配送推进共享同一判定出口。

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch.ts src/pages/api/telegram/rider-claim.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "refactor: share rider action decisions"
```

### Task 4: 新增 rider web action route，替代 dashboard 直调 update_status

**Files:**
- Create: `src/pages/api/rider/action.ts`
- Modify: `src/pages/api/rider/orders.ts`
- Modify: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as riderActionPost } from '../pages/api/rider/action.ts';

test('rider action route completes picked_up order through shared action decision', async () => {
  const request = new Request('https://example.com/api/rider/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'complete',
      orderId: '101',
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
    }),
  });

  const response = await riderActionPost({ request } as never);
  assert.equal(response.status, 200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
历史红灯预期：，`src/pages/api/rider/action.ts` 不存在。

- [ ] **Step 3: Write minimal implementation**

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { resolveRiderOrderAction } from '../../../lib/rider-dispatch.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json() as {
    action?: unknown;
    orderId?: unknown;
    riderId?: unknown;
    riderName?: unknown;
    riderPhone?: unknown;
  };

  const action = String(body.action || '').trim() as 'accept' | 'decline' | 'picked_up' | 'complete';
  const orderId = String(body.orderId || '').trim();
  if (!action || !orderId) {
    return new Response(JSON.stringify({ success: false, error: 'invalid_rider_action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 读取订单快照 -> resolveRiderOrderAction -> POST /api/order/update_status/:id -> 返回统一 JSON
};
```

同时在 `src/pages/api/rider/orders.ts` 对每笔订单补：

```ts
import { buildRiderOrderView } from '../../../lib/rider-dispatch.ts';

data.orders = filterRiderDashboardOrders(...).map((order) => ({
  ...order,
  riderView: buildRiderOrderView(order),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，新增 rider action route 可走通；`/api/rider/orders` 返回值开始带 `riderView`。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/rider/action.ts src/pages/api/rider/orders.ts src/lib/rider-dispatch.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "feat: add rider action api"
```

### Task 5: 重做 rider dashboard，移除前端猜测逻辑

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/pages/api/rider/orders.ts`
- Modify: `src/lib/rider-dispatch.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('dashboard script calls rider action route instead of update_status and renders summary sections', async () => {
  const source = await fs.promises.readFile(new URL('../pages/rider/dashboard.astro', import.meta.url), 'utf8');

  assert.match(source, /进行中订单数/);
  assert.match(source, /涉及店铺数/);
  assert.match(source, /我的配送/);
  assert.match(source, /\/api\/rider\/action/);
  assert.doesNotMatch(source, /\/api\/order\/update_status/);
  assert.doesNotMatch(source, /buildDispatchMetaRemarks\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts`
历史红灯预期：，页面里还在调用 `/api/order/update_status`，也还在前端手拼 `buildDispatchMetaRemarks(...)`。

- [ ] **Step 3: Write minimal implementation**

```ts
async function submitRiderAction(action, orderId) {
  const res = await fetch('/api/rider/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      orderId,
      riderId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    alert(String(data.reason || data.error || '操作失败'));
    await loadOrders();
    return;
  }
  await loadOrders();
}
```

并把原来的：
- `window.takeOrder`
- `window.declineOrder`
- `window.pickUpOrder`
- `window.completeOrder`

全部改成调用 `submitRiderAction('accept' | 'decline' | 'picked_up' | 'complete', id)`。

页面结构改成：
- 顶部摘要卡：`进行中订单数 / 今日已完成数 / 涉及店铺数 / 店铺分布`；
- tabs：`可接单 / 我的配送 / 今日完成`；
- 下方独立滚动列表；
- 卡片优先使用 `o.riderView.shopName / shopMapUrl / deliveryMapUrl / orderStatusCopy`。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS，页面源码不再包含 `/api/order/update_status` 与 `buildDispatchMetaRemarks(`，且出现摘要区关键文案。

- [ ] **Step 5: Commit**

```bash
git add src/pages/rider/dashboard.astro src/pages/api/rider/orders.ts src/lib/rider-dispatch.ts
git commit -m "feat: rebuild rider dashboard actions"
```

### Task 6: 统一地图来源并让 admin/派单消息走共享字段

**Files:**
- Modify: `src/pages/[slug]/index.astro`
- Modify: `src/pages/api/admin/rider-dispatch.ts`
- Modify: `src/pages/api/admin/rider-assign.ts`
- Modify: `src/lib/rider-dispatch.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('shared rider order view prefers explicit shop map url before falling back to address search', () => {
  const view = buildRiderOrderView({
    shopName: 'Pizza One',
    shopAddress: 'Bulevar 1',
    shopMapUrl: 'https://maps.example.com/shop-one',
    tableInfo: 'Kralja Petra 10',
  });

  assert.equal(view.shopMapUrl, 'https://maps.example.com/shop-one');
  assert.match(view.deliveryMapUrl, /google\.com\/maps\/search/);
});
```

再在 `src/lib/telegram-rider-claim-route-spec.ts` 增加断言，确认 admin 派单消息文本中也包含店铺名。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts && node --test src/lib/telegram-rider-claim-route-spec.ts`
历史红灯预期：，地图来源仍分散，admin 派单消息没有统一共享字段。

- [ ] **Step 3: Write minimal implementation**

```ts
const shopMapUrl = String(settings?.contact?.map_url || settings?.map_url || '').trim();
```

把 `src/pages/[slug]/index.astro:129-132` 的地图来源抽到共享 helper 输入；然后在：
- `src/pages/api/admin/rider-dispatch.ts`
- `src/pages/api/admin/rider-assign.ts`

给 Telegram 消息构建补：

```ts
const riderView = buildRiderOrderView({
  ...order,
  shopName: order.shopName,
  shopAddress: order.shopAddress,
  shopMapUrl: order.shopMapUrl,
  deliveryAddress: order.tableInfo,
});
```

发送消息时把 `riderView.shopName / riderView.shopMapUrl / riderView.deliveryMapUrl` 透传到 Telegram 文案构建函数。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts && node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，显式地图链接被优先使用；Telegram 待接单消息与阶段消息都能带店铺名。

- [ ] **Step 5: Commit**

```bash
git add src/pages/[slug]/index.astro src/pages/api/admin/rider-dispatch.ts src/pages/api/admin/rider-assign.ts src/lib/rider-dispatch.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "feat: unify rider map fields"
```

### Task 7: 统一 admin 订单侧主状态文案并保留弱提示反馈

**Files:**
- Modify: `src/components/admin/TabOrders.astro`
- Modify: `src/lib/rider-dispatch.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('admin order list uses 配送中 and 已完成 as primary rider states', async () => {
  const source = await fs.promises.readFile(new URL('../components/admin/TabOrders.astro', import.meta.url), 'utf8');
  assert.match(source, /getAdminDispatchStatusCopy/);
  assert.match(source, /骑手反馈：/);
  assert.doesNotMatch(source, /骑手已接单/);
  assert.doesNotMatch(source, /骑手已取餐/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts`
历史红灯预期：，当前 helper 仍返回 `骑手已接单 / 骑手已取餐`。

- [ ] **Step 3: Write minimal implementation**

```ts
export function getAdminDispatchStatusCopy(status: string | null | undefined): string {
  switch (String(status || '').trim()) {
    case 'awaiting_courier':
      return '待骑手接单';
    case 'delivering':
    case 'picked_up':
      return '配送中';
    case 'completed':
      return '已完成';
    default:
      return '待处理';
  }
}
```

并保持 `TabOrders.astro` 中：

```astro
{lastRiderDecision && (
  <div class="order-address-row" style="margin-top:4px; color:#6b7280;">
    骑手反馈：{lastRiderDecision?.riderName}{lastRiderDecision?.action === 'declined' ? '已拒单' : '已接单'} {formatBelgradeHHmm(lastRiderDecision?.at)}
  </div>
)}
```

也就是：主状态统一，骑手反馈继续做弱提示。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS，状态 helper 输出统一为 `待骑手接单 / 配送中 / 已完成`。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabOrders.astro src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts
git commit -m "refactor: align admin rider status copy"
```

### Task 8: 全链路验证与清理重复代码

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/pages/api/telegram/rider-claim.ts`
- Modify: `src/lib/rider-dispatch.ts`
- Modify: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('dashboard source no longer contains guessed rider-side dispatch meta writes', async () => {
  const source = await fs.promises.readFile(new URL('../pages/rider/dashboard.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /buildDispatchMetaRemarks\(/);
  assert.doesNotMatch(source, /expectedCurrentStatus:\s*'awaiting_courier'/);
  assert.match(source, /submitRiderAction\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts && node --test src/lib/telegram-rider-claim-route-spec.ts`
历史红灯预期：，页面源码里仍含旧直调逻辑或旧变量名。

- [ ] **Step 3: Write minimal implementation**

```ts
// 删除 dashboard 中以下重复逻辑：
// - buildDispatchMetaRemarks(...)
// - /api/order/update_status 四个动作调用
// - 基于前端本地推断的 invalidReason 分支
// 保留：展示、触发 submitRiderAction、刷新列表、deep link 提示
```

同时在 `src/pages/api/telegram/rider-claim.ts` 中删掉已经被 `resolveRiderOrderAction()` 覆盖的重复判定分支，确保：
- actionAllowed 只从共享核心拿；
- decline 只从共享核心拿 next remarks；
- route 内不再手工重复状态判断。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts && node --test src/lib/telegram-rider-claim-route-spec.ts && pnpm build`
Expected: 全部 PASS，且 `pnpm build` 成功，无新增类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/pages/rider/dashboard.astro src/pages/api/telegram/rider-claim.ts src/lib/rider-dispatch.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "refactor: remove duplicated rider sync logic"
```

## Self-Review

- **Spec coverage:**
  - 统一四动作服务端判定：Task 1、Task 3、Task 4。
  - Telegram / rider / admin 三端同步：Task 2、Task 3、Task 4、Task 7、Task 8。
  - rider dashboard 摘要区、滚动区、统一动作：Task 5。
  - 店铺名 / 店铺地图 / 客户导航共享展示模型：Task 1、Task 2、Task 6。
  - 删除重复猜测代码：Task 5、Task 8。
  - 归一化文案与保留弱提示反馈：Task 1、Task 7。

- **Placeholder scan:**
  - 已去掉 `TODO/TBD/implement later` 占位。
  - 每个代码步骤都给出具体函数、断言或命令。

- **Type consistency:**
  - 共享动作统一使用 `accept | decline | picked_up | complete`。
  - 共享展示统一用 `buildRiderOrderView()` 返回 `shopMapUrl / deliveryMapUrl / orderStatusCopy`。
  - rider web 动作路由统一命名为 `src/pages/api/rider/action.ts`。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-11-rider-sync.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
