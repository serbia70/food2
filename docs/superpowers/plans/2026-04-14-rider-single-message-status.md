# Rider Single-Message Status Implementation Plan

> 状态说明（大体已实现）：本计划的大方向仍有效，但其中“从发送第二条阶段消息改成 edit 原消息”现在已经是既成事实，不应再把文中的 FAIL 预期或迁移步骤当作当前代码状态。
> 继续修改时请优先看 `docs/superpowers/specs/2026-04-15-dispatch-telegram-rider-admin-cleanup-design.md`、`src/lib/rider-dispatch.ts`、`src/lib/telegram-dispatch.ts`、`src/pages/api/telegram/rider-claim.ts`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Telegram 每个订单始终只保留一条可编辑消息，并让 rider dashboard 与 Telegram 共享同一套“待接单 / 待取餐 / 配送中 / 已送达”状态语义、`接单 / 暂不接单 / 取餐 / 送达` 动作文案，以及贝尔格莱德时间显示。

**Architecture:** 在 `dispatch_meta` 中补动作时间与 Telegram message ref，继续复用现有 `resolveRiderOrderAction(...)` 作为服务端动作真相来源，再扩展共享 helper 输出双端统一的状态文案、动作文案和时间。Telegram 从“发送第二条阶段消息”改成“send 首条 + edit 原消息”，rider dashboard 改成消费同一套 helper，并把时间统一到 `Europe/Belgrade`。

**Tech Stack:** Astro API routes, TypeScript, Node test runner, existing Telegram send route, existing rider dispatch helpers.

---

## File Map

- Modify: `src/lib/rider-dispatch.ts`
  - 扩展 `dispatch_meta`，增加 `acceptedAt` / `pickedUpAt` / `completedAt` / `telegramMessageRef`
  - 输出 rider 双端统一状态文案、动作文案、时间字段
- Modify: `src/lib/rider-dispatch-spec.ts`
  - 锁定新 `dispatch_meta` 字段、双端状态动作映射、dashboard 源码契约
- Modify: `src/lib/telegram-dispatch.ts`
  - 新增单消息文本构建与 Telegram edit payload helper，按钮文案改成 `取餐` / `送达`
- Modify: `src/lib/telegram-dispatch-spec.ts`
  - 锁定 Telegram 单消息文本、按钮文案、只保留下一步动作
- Modify: `src/pages/api/telegram/send.ts`
  - 支持 `sendMessage` 与 `editMessageText` / `editMessageReplyMarkup` 所需 payload，回传 message id
- Modify: `src/pages/api/telegram/rider-claim.ts`
  - 接单/取餐/送达后不再发送第二条阶段消息，改为编辑原消息并写入动作时间
- Modify: `src/lib/telegram-rider-claim-route-spec.ts`
  - 锁定 Telegram callback 写时间、编辑原消息、完成态移除按钮
- Modify: `src/pages/api/rider/action.ts`
  - rider dashboard 动作也写入同样的动作时间，并触发 Telegram 原消息同步更新
- Modify: `src/lib/rider-action-route-spec.ts`
  - 锁定 rider action 与 Telegram 同步写时间、同步编辑原消息
- Modify: `src/pages/api/admin/rider-assign.ts`
  - 首次发给指定骑手后记录 Telegram message ref，作为后续 edit 依据
- Modify: `src/pages/api/admin/rider-dispatch.ts`
  - 群发 / 轮询派单首发消息时记录 message ref 与只读失效处理所需信息
- Modify: `src/lib/admin-rider-dispatch-route-spec.ts`
  - 锁定派单首发返回 message ref 并写入 remarks
- Modify: `src/pages/rider/dashboard.astro`
  - 改按钮文案、状态显示、动作时间显示，并移除字符串切时间

---

### Task 1: 扩展共享 dispatch_meta 与双端状态 helper

**Files:**
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/lib/rider-dispatch-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('dispatch_meta preserves action times and telegram message ref', () => {
  const remarks = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: {
      action: 'accepted',
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-14T10:03:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-14T10:00:00.000Z',
    currentExpiresAt: '2026-04-14T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '2026-04-14T10:19:00.000Z',
    completedAt: '2026-04-14T10:41:00.000Z',
    telegramMessageRef: { chatId: 'chat-1', messageId: 7788 },
  }));

  const meta = readDispatchMetaFromRemarks(remarks);
  assert.equal(meta.acceptedAt, '2026-04-14T10:03:00.000Z');
  assert.equal(meta.pickedUpAt, '2026-04-14T10:19:00.000Z');
  assert.equal(meta.completedAt, '2026-04-14T10:41:00.000Z');
  assert.deepEqual(meta.telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
});

test('resolveRiderUnifiedStatus returns shared status/action semantics for telegram and dashboard', () => {
  assert.deepEqual(resolveRiderUnifiedStatus({
    status: 'delivering',
    courierPhone: '381641234567',
    remarksJson: JSON.stringify(buildDispatchMetaRemarks('', {
      lastRiderDecision: null,
      declinedRiderIds: [],
      currentRiderId: '202',
      currentAssignedAt: '2026-04-14T10:00:00.000Z',
      currentExpiresAt: '2026-04-14T10:10:00.000Z',
      invalidatedRiderIds: [],
      lastInvalidationReason: null,
      acceptedAt: '2026-04-14T10:03:00.000Z',
      pickedUpAt: '',
      completedAt: '',
      telegramMessageRef: null,
    })),
  }, {
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-14T10:20:00.000Z',
  }), {
    statusLabel: '待取餐',
    primaryAction: '取餐',
    secondaryAction: '',
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '',
    completedAt: '',
  });

  assert.deepEqual(resolveRiderUnifiedStatus({
    status: 'picked_up',
    courierPhone: '381641234567',
    remarksJson: JSON.stringify(buildDispatchMetaRemarks('', {
      lastRiderDecision: null,
      declinedRiderIds: [],
      currentRiderId: '202',
      currentAssignedAt: '2026-04-14T10:00:00.000Z',
      currentExpiresAt: '2026-04-14T10:10:00.000Z',
      invalidatedRiderIds: [],
      lastInvalidationReason: null,
      acceptedAt: '2026-04-14T10:03:00.000Z',
      pickedUpAt: '2026-04-14T10:19:00.000Z',
      completedAt: '',
      telegramMessageRef: null,
    })),
  }, {
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-14T10:20:00.000Z',
  }), {
    statusLabel: '配送中',
    primaryAction: '送达',
    secondaryAction: '',
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '2026-04-14T10:19:00.000Z',
    completedAt: '',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts`
历史红灯预期：提示 `acceptedAt` / `telegramMessageRef` 未解析或 `resolveRiderUnifiedStatus` 未定义。

- [ ] **Step 3: Write minimal implementation**

```ts
export interface TelegramMessageRef {
  chatId: string;
  messageId: number;
}

export interface DispatchMeta {
  lastRiderDecision: DispatchDecisionMeta | null;
  declinedRiderIds: string[];
  currentRiderId: string;
  currentAssignedAt: string;
  currentExpiresAt: string;
  invalidatedRiderIds: string[];
  lastInvalidationReason: 'declined' | 'timeout' | 'reassigned' | null;
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
  telegramMessageRef: TelegramMessageRef | null;
}

export function resolveRiderUnifiedStatus(
  order: {
    status?: string | null;
    remarksJson?: string | null;
    remarks_json?: string | null;
    courierPhone?: string | null;
    courier_phone?: string | null;
  },
  context: {
    riderId?: string | null;
    riderPhone?: string | null;
    nowIso?: string;
  },
): {
  statusLabel: string;
  primaryAction: string;
  secondaryAction: string;
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
} {
  const meta = readDispatchMetaFromRemarks(readOrderRemarksJson(order));
  const state = resolveRiderDashboardActionState({
    order,
    riderId: context.riderId,
    riderPhone: context.riderPhone,
    nowIso: context.nowIso,
  });

  if (String(order?.status || '') === 'awaiting_courier') {
    return {
      statusLabel: '待接单',
      primaryAction: state.canAccept ? '接单' : '',
      secondaryAction: state.canDecline ? '暂不接单' : '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  if (String(order?.status || '') === 'delivering') {
    return {
      statusLabel: '待取餐',
      primaryAction: state.canPickUp ? '取餐' : '',
      secondaryAction: '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  if (String(order?.status || '') === 'picked_up') {
    return {
      statusLabel: '配送中',
      primaryAction: state.canComplete ? '送达' : '',
      secondaryAction: '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  return {
    statusLabel: '已送达',
    primaryAction: '',
    secondaryAction: '',
    acceptedAt: meta.acceptedAt,
    pickedUpAt: meta.pickedUpAt,
    completedAt: meta.completedAt,
  };
}
```

同时把 `EMPTY_DISPATCH_META`、`readDispatchMetaFromRemarks(...)`、`buildDispatchMetaRemarks(...)` 补齐新字段解析与序列化。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS，现有 dispatch helper 断言保持通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts
git commit -m "feat: add unified rider status metadata"
```

### Task 2: 统一 Telegram 单消息文本与按钮语义

**Files:**
- Modify: `src/lib/telegram-dispatch.ts`
- Test: `src/lib/telegram-dispatch-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  buildRiderSingleMessageTelegram,
  buildTelegramEditMessagePayload,
} from './telegram-dispatch.ts';

test('buildRiderSingleMessageTelegram renders short action labels and status timestamps', () => {
  const message = buildRiderSingleMessageTelegram({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    statusLabel: '待取餐',
    acceptedAtLabel: '12:03',
    pickedUpAtLabel: '',
    completedAtLabel: '',
    shopMapUrl: 'https://maps.example.com/shop',
    deliveryMapUrl: 'https://maps.example.com/customer',
    primaryAction: { text: '取餐', callbackData: 'cb-pickup' },
    secondaryAction: null,
  });

  assert.match(message.text, /#A476 · 店铺A/);
  assert.match(message.text, /状态：待取餐/);
  assert.match(message.text, /接单时间：12:03/);
  assert.doesNotMatch(message.text, /已取餐/);
  assert.deepEqual(message.replyMarkup.inline_keyboard, [[
    { text: '取餐', callback_data: 'cb-pickup' },
  ]]);
});

test('buildTelegramEditMessagePayload keeps one editable telegram message', () => {
  const payload = buildTelegramEditMessagePayload({
    chatId: 'chat-1',
    messageId: 7788,
    text: '#A476 · 店铺A\n状态：已送达',
    replyMarkup: { inline_keyboard: [] },
  });

  assert.deepEqual(payload, {
    chat_id: 'chat-1',
    message_id: 7788,
    text: '#A476 · 店铺A\n状态：已送达',
    reply_markup: { inline_keyboard: [] },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
历史红灯预期：提示单消息 builder / edit payload helper 不存在，或仍输出 `已取餐` / `已送达` 按钮。

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildRiderSingleMessageTelegram(input: {
  orderNo: string;
  shopName: string;
  address: string;
  phone: string;
  statusLabel: string;
  acceptedAtLabel: string;
  pickedUpAtLabel: string;
  completedAtLabel: string;
  shopMapUrl?: string;
  deliveryMapUrl?: string;
  primaryAction: { text: string; callbackData: string } | null;
  secondaryAction: { text: string; callbackData: string } | null;
}): TelegramDispatchMessage {
  const lines = [
    `#${input.orderNo} · ${input.shopName}`,
    `状态：${input.statusLabel}`,
  ];
  if (input.acceptedAtLabel) lines.push(`接单时间：${input.acceptedAtLabel}`);
  if (input.pickedUpAtLabel) lines.push(`取餐时间：${input.pickedUpAtLabel}`);
  if (input.completedAtLabel) lines.push(`送达时间：${input.completedAtLabel}`);
  lines.push('', `地址：${input.address}`, `电话：${input.phone}`);
  if (String(input.shopMapUrl || '').trim()) lines.push(`店铺地图：${String(input.shopMapUrl).trim()}`);
  if (String(input.deliveryMapUrl || '').trim()) lines.push(`客户导航：${String(input.deliveryMapUrl).trim()}`);

  const buttons = [input.primaryAction, input.secondaryAction]
    .filter((item): item is { text: string; callbackData: string } => !!item && !!item.callbackData)
    .map((item) => ({ text: item.text, callback_data: item.callbackData }));

  return {
    text: lines.join('\n'),
    replyMarkup: {
      inline_keyboard: buttons.length > 0 ? [buttons] : [],
    },
  };
}

export function buildTelegramEditMessagePayload(input: {
  chatId: string;
  messageId: number;
  text: string;
  replyMarkup: TelegramReplyMarkup;
}) {
  return {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    reply_markup: input.replyMarkup,
  };
}
```

并把现有 `buildRiderPickedUpTelegramMessage(...)` / `buildRiderDeliveryCompleteTelegramMessage(...)` 调整为内部复用这套 builder，按钮文案分别改成 `取餐` / `送达`。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: PASS，Telegram 文本与按钮统一成单消息语义。

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram-dispatch.ts src/lib/telegram-dispatch-spec.ts
git commit -m "feat: unify telegram rider single-message copy"
```

### Task 3: 让 Telegram send 路由支持编辑消息并回传 message id

**Files:**
- Modify: `src/pages/api/telegram/send.ts`
- Test: `src/lib/telegram-dispatch-spec.ts`

- [ ] **Step 1: Write the failing test**

在 `src/lib/telegram-dispatch-spec.ts` 追加：

```ts
import { POST as telegramSendPost } from '../pages/api/telegram/send.ts';

test('telegram send route supports edit message payload and returns upstream message id', async () => {
  const originalFetch = globalThis.fetch;
  process.env.PUBLIC_API_URL = 'https://api.example.com';

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.example.com/api/home') {
        return new Response(JSON.stringify({ telegram_bot_token: 'bot-token-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      assert.match(url, /https:\/\/api\.telegram\.org\/botbot-token-1\/editMessageText/);
      const payload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(payload.chat_id, 'chat-1');
      assert.equal(payload.message_id, 7788);
      assert.equal(payload.text, '状态：配送中');
      return new Response(JSON.stringify({ ok: true, result: { message_id: 7788 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const response = await telegramSendPost({
      request: new Request('https://example.com/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: 'chat-1',
          message_id: 7788,
          text: '状态：配送中',
          reply_markup: { inline_keyboard: [] },
        }),
      }),
    } as never);

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.result?.message_id, 7788);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
历史红灯预期：当前 `/api/telegram/send` 只会发 `sendMessage`，不支持 `message_id` 编辑路径。

- [ ] **Step 3: Write minimal implementation**

```ts
type TelegramSendBody = {
  shopSlug?: unknown;
  shop_slug?: unknown;
  chatId?: unknown;
  chat_id?: unknown;
  messageId?: unknown;
  message_id?: unknown;
  text?: unknown;
  reply_markup?: unknown;
  parse_mode?: unknown;
  disable_web_page_preview?: unknown;
};

async function postTelegramMessage(token: string, telegramPayload: Record<string, unknown>, mode: 'send' | 'edit'): Promise<Response> {
  const methodName = mode === 'edit' ? 'editMessageText' : 'sendMessage';
  return await fetch(`https://api.telegram.org/bot${token}/${methodName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(telegramPayload),
    signal: controller.signal,
  });
}

const messageId = Number(body.messageId || body.message_id || 0);
const sendMode = Number.isFinite(messageId) && messageId > 0 ? 'edit' : 'send';
const telegramPayload: Record<string, unknown> = {
  chat_id: chatId,
  text,
};
if (sendMode === 'edit') telegramPayload.message_id = messageId;
if (body.reply_markup && typeof body.reply_markup === 'object') {
  telegramPayload.reply_markup = body.reply_markup;
}
```

让 `sendTelegramMessage(...)` 接受 `mode` 参数，并保持成功响应把 upstream `result.message_id` 透传回来。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-dispatch-spec.ts`
Expected: PASS，send route 同时支持首发与编辑。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/telegram/send.ts src/lib/telegram-dispatch-spec.ts
git commit -m "feat: support telegram message editing"
```

### Task 4: 首次派单时记录 Telegram message ref

**Files:**
- Modify: `src/pages/api/admin/rider-assign.ts`
- Modify: `src/pages/api/admin/rider-dispatch.ts`
- Test: `src/lib/admin-rider-dispatch-route-spec.ts`

- [ ] **Step 1: Write the failing test**

在 `src/lib/admin-rider-dispatch-route-spec.ts` 追加：

```ts
test('publish dispatch stores telegram message ref into dispatch_meta remarks', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/902/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7788 } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '902',
      action: 'publish',
      shopSlug: 'shop-a',
      shopName: 'Shop A',
      tableInfo: 'Address',
      totalAmount: 100,
      userPhone: '381600000000',
      pickupEtaMinutes: 12,
      status: 'awaiting_courier',
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const remarksCall = calls.find((call) => call.url.endsWith('/api/admin/orders/remarks'));
  assert.equal(response.status, 200);
  assert.ok(remarksCall);
  const remarksPayload = JSON.parse(remarksCall.body) as { remarks?: string[] };
  const meta = readDispatchMetaFromRemarks(JSON.stringify(remarksPayload.remarks || []));
  assert.deepEqual(meta.telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/admin-rider-dispatch-route-spec.ts`
历史红灯预期：当前 remarks 不会保存 Telegram `message_id`。

- [ ] **Step 3: Write minimal implementation**

在 `src/pages/api/admin/rider-dispatch.ts` 与 `src/pages/api/admin/rider-assign.ts` 的 send 成功分支里读取：

```ts
const telegramMessageId = Number(parsedResponse?.result && typeof parsedResponse.result === 'object'
  ? (parsedResponse.result as { message_id?: unknown }).message_id
  : 0);
```

然后把 message ref 写回 remarks：

```ts
const nextMeta = {
  ...existingMeta,
  telegramMessageRef: telegramMessageId > 0
    ? { chatId: riderChatId, messageId: telegramMessageId }
    : existingMeta.telegramMessageRef,
};
```

并通过现有 `buildDispatchMetaRemarks(...)` 写入 `/api/admin/orders/remarks`。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/admin-rider-dispatch-route-spec.ts`
Expected: PASS，首次派单后能留下 Telegram 原消息引用。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/rider-assign.ts src/pages/api/admin/rider-dispatch.ts src/lib/admin-rider-dispatch-route-spec.ts
git commit -m "feat: persist telegram message refs for rider dispatch"
```

### Task 5: Telegram callback 改为编辑原消息并写动作时间

**Files:**
- Modify: `src/pages/api/telegram/rider-claim.ts`
- Modify: `src/lib/telegram-dispatch.ts`
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Write the failing test**

在 `src/lib/telegram-rider-claim-route-spec.ts` 追加：

```ts
test('picked_up writes pickedUpAt and edits original telegram message instead of sending new one', async (t) => {
  useTestEnv(t);
  const remarksJson = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: {
      action: 'accepted',
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
      at: '2026-04-14T10:03:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: String(TEST_RIDER_ID),
    currentAssignedAt: '2026-04-14T10:00:00.000Z',
    currentExpiresAt: '2026-04-14T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '',
    completedAt: '',
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  }));

  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson,
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  assert.match(updateCall.body, /"status":"picked_up"/);
  assert.match(updateCall.body, /"pickedUpAt":"/);
  assert.ok(telegramCall);
  assert.match(telegramCall.body, /"message_id":7788/);
  assert.match(telegramCall.body, /送达/);
  assert.doesNotMatch(telegramCall.body, /已送达/);
});

test('complete edits original telegram message to readonly delivered state without buttons', async (t) => {
  useTestEnv(t);
  const remarksJson = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: {
      action: 'accepted',
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
      at: '2026-04-14T10:03:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: String(TEST_RIDER_ID),
    currentAssignedAt: '2026-04-14T10:00:00.000Z',
    currentExpiresAt: '2026-04-14T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '2026-04-14T10:19:00.000Z',
    completedAt: '',
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  }));

  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson,
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'complete');
  assert.ok(telegramCall);
  assert.match(telegramCall.body, /"message_id":7788/);
  assert.match(telegramCall.body, /状态：已送达/);
  assert.match(telegramCall.body, /"reply_markup":\{"inline_keyboard":\[\]\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
历史红灯预期：当前是发送第二条阶段消息，且不会写 `pickedUpAt` / `completedAt`。

- [ ] **Step 3: Write minimal implementation**

在 `src/pages/api/telegram/rider-claim.ts`：

```ts
const nextActionTimes = {
  acceptedAt: callback.action === 'accept' ? nowIso : meta.acceptedAt,
  pickedUpAt: callback.action === 'picked_up' ? nowIso : meta.pickedUpAt,
  completedAt: callback.action === 'complete' ? nowIso : meta.completedAt,
};
```

并在 `picked_up` / `complete` 分支把 `nextRemarksJson` 回写到 `update_status`：

```ts
const nextMeta = {
  ...meta,
  acceptedAt: nextActionTimes.acceptedAt,
  pickedUpAt: nextActionTimes.pickedUpAt,
  completedAt: nextActionTimes.completedAt,
};
const updateStatusPayload: Record<string, unknown> = {
  id: callback.orderId,
  expectedCurrentStatus: actionDecision.expectedCurrentStatus,
  status: actionDecision.targetStatus,
  courierName: resolvedName,
  courierPhone: resolvedPhone,
  remarksJson: JSON.stringify(buildDispatchMetaRemarks(orderSnapshot.remarksJson, nextMeta)),
};
```

把原 `sendDeliveryProgressMessage(...)` 改成编辑原消息：

```ts
await fetch(`${readInternalApiBaseUrl()}/api/telegram/send`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...buildForwardHeaders(request),
  },
  body: JSON.stringify({
    ...(notifyShopSlug ? { shopSlug: notifyShopSlug } : {}),
    chat_id: meta.telegramMessageRef?.chatId || chatId,
    message_id: meta.telegramMessageRef?.messageId,
    text: message.text,
    reply_markup: message.replyMarkup,
  }),
});
```

并保证：
- `picked_up` 编辑后按钮是 `送达`
- `complete` 编辑后 `inline_keyboard` 为空
- 不再调用“补发阶段消息”旧 builder 路径

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，callback 会写动作时间并编辑原消息。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/telegram/rider-claim.ts src/lib/telegram-dispatch.ts src/lib/rider-dispatch.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "feat: edit rider telegram message through delivery stages"
```

### Task 6: Rider action 路由同步编辑 Telegram 原消息

**Files:**
- Modify: `src/pages/api/rider/action.ts`
- Modify: `src/lib/rider-action-route-spec.ts`
- Modify: `src/lib/telegram-dispatch.ts`
- Modify: `src/lib/rider-dispatch.ts`

- [ ] **Step 1: Write the failing test**

在 `src/lib/rider-action-route-spec.ts` 追加：

```ts
test('picked_up via rider action writes pickedUpAt and edits original telegram message', async (t) => {
  useTestEnv(t);
  const remarksJson = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: {
      action: 'accepted',
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
      at: '2026-04-14T10:03:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: String(TEST_RIDER_ID),
    currentAssignedAt: '2026-04-14T10:00:00.000Z',
    currentExpiresAt: '2026-04-14T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '',
    completedAt: '',
    telegramMessageRef: { chatId: 'chat-1', messageId: 7788 },
  }));
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders') return jsonResponse([createOrderRow({ status: 'delivering', remarksJson })]);
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true, result: { message_id: 7788 } });
    if (url.pathname === '/api/admin/orders/remarks') return jsonResponse({ success: true });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'picked_up',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  assert.match(updateCall.body, /"pickedUpAt":"/);
  assert.ok(telegramCall);
  assert.match(telegramCall.body, /"message_id":7788/);
  assert.match(telegramCall.body, /送达/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-action-route-spec.ts`
历史红灯预期：当前 rider action 只更新业务状态，不会同步 Telegram 原消息。

- [ ] **Step 3: Write minimal implementation**

在 `src/pages/api/rider/action.ts` 接入与 Telegram callback 同样的同步逻辑：

```ts
const nextMeta = buildNextDispatchMetaForAction({
  remarksJson: orderSnapshot.remarksJson,
  action,
  riderId,
  riderName,
  riderPhone,
  nowIso,
});

if (nextMeta.shouldPersistRemarksFirst) {
  await writeOrderDispatchRemarks(request, apiBaseUrl, orderId, nextMeta.remarksJson);
}
```

在 update_status 成功后：

```ts
await syncTelegramRiderMessage({
  request,
  apiBaseUrl,
  orderId,
  riderName,
  riderPhone,
  remarksJson: nextMeta.remarksJson,
});
```

其中 `syncTelegramRiderMessage(...)` 只负责：
- 读 order detail
- 读 `telegramMessageRef`
- 用共享 single-message builder 生成文本
- 调 `/api/telegram/send` 走 edit 模式

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-action-route-spec.ts`
Expected: PASS，rider dashboard 动作也会同步 Telegram 原消息。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/rider/action.ts src/lib/rider-action-route-spec.ts src/lib/telegram-dispatch.ts src/lib/rider-dispatch.ts
git commit -m "feat: sync rider actions back to telegram message"
```

### Task 7: rider dashboard 改成统一按钮文案与贝尔格莱德时间

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Test: `src/lib/rider-dispatch-spec.ts`
- Modify: `src/lib/rider-dispatch.ts`

- [ ] **Step 1: Write the failing test**

在 `src/lib/rider-dispatch-spec.ts` 追加：

```ts
test('dashboard script renders short rider action labels and formatted action times', async () => {
  const source = await fs.readFile(new URL('../pages/rider/dashboard.astro', import.meta.url), 'utf8');

  assert.match(source, /Europe\/Belgrade/);
  assert.match(source, /接单时间：/);
  assert.match(source, /取餐时间：/);
  assert.match(source, /送达时间：/);
  assert.match(source, /createButton\('取餐'/);
  assert.match(source, /createButton\('送达'/);
  assert.doesNotMatch(source, /createButton\('已取餐'/);
  assert.doesNotMatch(source, /createButton\('已送达'/);
  assert.doesNotMatch(source, /replace\('T', ' '\)\.slice\(5, 16\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts`
历史红灯预期：dashboard 仍然手切时间，且按钮文案还是 `已取餐` / `已送达`。

- [ ] **Step 3: Write minimal implementation**

在 `src/pages/rider/dashboard.astro` 增加贝尔格莱德格式化函数：

```ts
const riderTimeFormatter = new Intl.DateTimeFormat('sr-RS', {
  timeZone: 'Europe/Belgrade',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatRiderBelgradeTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : riderTimeFormatter.format(date);
}
```

渲染头部改成：

```ts
const unifiedStatus = resolveRiderUnifiedStatus(order, {
  riderId: rider?.id,
  riderPhone: rider?.phone,
  nowIso: new Date().toISOString(),
});
status.textContent = unifiedStatus.statusLabel;

const acceptedAtLabel = formatRiderBelgradeTime(unifiedStatus.acceptedAt);
const pickedUpAtLabel = formatRiderBelgradeTime(unifiedStatus.pickedUpAt);
const completedAtLabel = formatRiderBelgradeTime(unifiedStatus.completedAt);
if (acceptedAtLabel) card.appendChild(createMetaLine(`接单时间：${acceptedAtLabel}`));
if (pickedUpAtLabel) card.appendChild(createMetaLine(`取餐时间：${pickedUpAtLabel}`));
if (completedAtLabel) card.appendChild(createMetaLine(`送达时间：${completedAtLabel}`));
```

按钮区改成：

```ts
if (currentTab === 'pool' && actionState.canAccept) {
  actionWrap.appendChild(createButton('接单', 'btn-action btn-primary', () => window.takeOrder(order.id)));
}
if (currentTab === 'active' && actionState.canPickUp) {
  actionWrap.appendChild(createButton('取餐', 'btn-action btn-complete', () => window.pickUpOrder(order.id)));
}
if (currentTab === 'active' && actionState.canComplete) {
  actionWrap.appendChild(createButton('送达', 'btn-action btn-complete', () => window.completeOrder(order.id)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS，dashboard 与 Telegram 语义统一且时间改为贝尔格莱德格式。

- [ ] **Step 5: Commit**

```bash
git add src/pages/rider/dashboard.astro src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts
git commit -m "feat: align rider dashboard status copy and time display"
```

### Task 8: 跑聚焦回归验证整条单消息链路

**Files:**
- Test: `src/lib/rider-dispatch-spec.ts`
- Test: `src/lib/telegram-dispatch-spec.ts`
- Test: `src/lib/telegram-rider-claim-route-spec.ts`
- Test: `src/lib/rider-action-route-spec.ts`
- Test: `src/lib/admin-rider-dispatch-route-spec.ts`

- [ ] **Step 1: Run shared helper and dashboard contract tests**

Run: `node --test src/lib/rider-dispatch-spec.ts src/lib/telegram-dispatch-spec.ts`
Expected: PASS

- [ ] **Step 2: Run Telegram callback regression**

Run: `node --test src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS

- [ ] **Step 3: Run rider action regression**

Run: `node --test src/lib/rider-action-route-spec.ts`
Expected: PASS

- [ ] **Step 4: Run dispatch publish regression**

Run: `node --test src/lib/admin-rider-dispatch-route-spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch-spec.ts src/lib/telegram-dispatch-spec.ts src/lib/telegram-rider-claim-route-spec.ts src/lib/rider-action-route-spec.ts src/lib/admin-rider-dispatch-route-spec.ts
git commit -m "test: verify rider single-message status flow"
```

## Self-Review

- Spec coverage:
  - 单消息 Telegram 编辑：Task 2 + Task 3 + Task 5
  - rider dashboard 统一语义与贝尔格莱德时间：Task 1 + Task 7
  - `dispatch_meta` 动作时间与 message ref：Task 1 + Task 4 + Task 5 + Task 6
  - 多单防错与按钮文案简化：Task 2 + Task 7
  - Telegram / rider dashboard 双端同步：Task 5 + Task 6 + Task 8
- Placeholder scan:
  - 无 TBD/TODO；每个任务都给了具体文件、测试、命令、代码骨架。
- Type consistency:
  - `acceptedAt` / `pickedUpAt` / `completedAt` / `telegramMessageRef` 在 Task 1 定义后，后续任务统一复用同名字段
  - 双端统一语义 helper 统一命名为 `resolveRiderUnifiedStatus(...)`
  - Telegram 单消息 builder 统一命名为 `buildRiderSingleMessageTelegram(...)`
