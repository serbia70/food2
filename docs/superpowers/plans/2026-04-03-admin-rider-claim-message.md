# Admin Rider Claim Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 admin 指派骑手后，骑手在 Telegram 私聊里直接看到订单摘要和“立即接单”按钮，点击后订单进入 `delivering`，admin 明确看到骑手已接单。

**Architecture:** 复用现有 `src/lib/telegram-dispatch.ts` 的签名 callback 与 `src/pages/api/telegram/rider-claim.ts` 接单链路，不新增第二套协议。`src/pages/api/admin/rider-assign.ts` 在更新订单为 `awaiting_courier` 后，构造订单摘要 + inline keyboard 发送给被指派骑手；admin 端继续以订单状态和 `courier_*` 字段作为唯一事实来源。

**Tech Stack:** Astro API routes, TypeScript, node:test, existing Telegram send backend contract

---

## File Structure

- Modify: `src/pages/api/admin/rider-assign.ts`
  - 补订单摘要读取、claim callback 构造、Telegram inline keyboard 发送
- Modify: `src/lib/telegram-dispatch.ts`
  - 补一个适用于 admin 指派消息的构造函数，输出文本 + `replyMarkup`
- Modify: `src/tests/pages/api/admin-rider-assign.test.ts`
  - 锁定指派消息内容、按钮 payload、失败透出
- Modify: `src/tests/pages/api/telegram-rider-claim.test.ts`
  - 锁定点击按钮后状态更新仍为 `delivering`
- Modify: `src/components/admin/TabTables.astro`
  - 仅当需要时收紧 `awaiting_courier` / `delivering` 的显示文案与骑手回显
- Modify: `src/tests/pages/master/master-dispatch-ui.test.ts`
  - 若复用文本断言，则补 admin 已接单文案的源代码断言

## Task 1: 给 admin 指派消息补订单摘要与接单按钮

**Files:**
- Modify: `src/tests/pages/api/admin-rider-assign.test.ts`
- Modify: `src/lib/telegram-dispatch.ts`
- Modify: `src/pages/api/admin/rider-assign.ts`

- [ ] **Step 1: Write the failing test**

在 `src/tests/pages/api/admin-rider-assign.test.ts` 追加：

```ts
test('manual_assign sends order summary and claim button to selected rider', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/476/status') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), {
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
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '476',
        riderId: '9',
        shopSlug: 'demo-shop',
        pickupEtaMinutes: 18,
        orderSummary: {
          orderNo: 'A476',
          tableInfo: 'Cara Lazara 12',
          userPhone: '060123',
          totalAmount: 2890,
          scheduledFor: '2026-04-03 18:30:00',
          items: [
            { name: '烤鸡腿', quantity: 2 },
            { name: '米饭', quantity: 1 },
          ],
        },
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramBody?.shop_slug, 'demo-shop');
  assert.match(String(telegramBody?.text || ''), /A476/);
  assert.match(String(telegramBody?.text || ''), /Cara Lazara 12/);
  assert.match(String(telegramBody?.text || ''), /060123/);
  assert.match(String(telegramBody?.text || ''), /烤鸡腿 x2/);
  assert.match(String(telegramBody?.text || ''), /2890 RSD/);
  assert.match(String(telegramBody?.text || ''), /立即接单/);

  const replyMarkup = telegramBody?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined;
  const claimButton = replyMarkup?.inline_keyboard?.flat().find((button) => button?.text === '立即接单');
  assert.ok(claimButton?.callback_data);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/admin-rider-assign.test.ts"`
Expected: FAIL，因为当前消息只有 `订单已指派给你：...`，没有订单摘要和 `reply_markup`。

- [ ] **Step 3: Write minimal implementation**

先在 `src/lib/telegram-dispatch.ts` 增加 admin 指派消息构造函数：

```ts
interface AdminAssignedOrderTelegramInput {
  orderNo: string;
  address: string;
  totalAmount: number;
  phone: string;
  pickupEtaMinutes: number;
  scheduledFor?: string;
  itemSummary: string[];
  claimCallbackData: string;
}

export function buildAdminAssignedOrderTelegramMessage(input: AdminAssignedOrderTelegramInput): TelegramDispatchMessage {
  const lines = [
    `你有新的指派订单`,
    `订单号：${input.orderNo}`,
    `地址：${input.address}`,
    `电话：${input.phone}`,
    `金额：${input.totalAmount} RSD`,
    `预计 ${input.pickupEtaMinutes} 分钟后可取`,
    ...input.itemSummary,
  ];

  if (String(input.scheduledFor || '').trim()) {
    lines.splice(5, 0, `预约送达：${String(input.scheduledFor).trim()}`);
  }

  return {
    text: lines.join('\n'),
    replyMarkup: {
      inline_keyboard: [[{ text: '立即接单', callback_data: input.claimCallbackData }]],
    },
  };
}
```

再在 `src/pages/api/admin/rider-assign.ts`：

```ts
import {
  buildAdminAssignedOrderTelegramMessage,
  buildTelegramClaimCallback,
} from '../../../lib/telegram-dispatch.ts';
```

加入订单摘要读取：

```ts
type OrderSummaryItem = { name?: unknown; quantity?: unknown };
type OrderSummaryInput = {
  orderNo?: unknown;
  tableInfo?: unknown;
  userPhone?: unknown;
  totalAmount?: unknown;
  scheduledFor?: unknown;
  items?: unknown;
};

function readOrderSummary(body: Record<string, unknown>) {
  const raw = (body.orderSummary && typeof body.orderSummary === 'object')
    ? body.orderSummary as OrderSummaryInput
    : {};
  const items = Array.isArray(raw.items) ? raw.items as OrderSummaryItem[] : [];
  return {
    orderNo: String(raw.orderNo || body.orderId || '').trim(),
    address: String(raw.tableInfo || '').trim() || '未提供地址',
    phone: String(raw.userPhone || '').trim() || '-',
    totalAmount: Number(raw.totalAmount || 0),
    scheduledFor: String(raw.scheduledFor || '').trim(),
    itemSummary: items
      .map((item) => `${String(item?.name || '').trim()} x${Number(item?.quantity || 0)}`.trim())
      .filter((line) => line !== 'x0' && !line.startsWith(' x')),
  };
}
```

把通知逻辑改成：

```ts
const summary = readOrderSummary(body);
const claimCallbackData = buildTelegramClaimCallback({
  orderId: Number(orderId),
  riderId: Number(target.id || 0),
  riderName: String(target.name || '').trim(),
  riderPhone: String(target.phone || '').trim(),
  restaurantId: String(body.restaurantId || body.shopId || 'admin'),
  telegramChatId: chatId,
});
const message = buildAdminAssignedOrderTelegramMessage({
  orderNo: summary.orderNo,
  address: summary.address,
  totalAmount: summary.totalAmount,
  phone: summary.phone,
  pickupEtaMinutes,
  scheduledFor: summary.scheduledFor,
  itemSummary: summary.itemSummary,
  claimCallbackData,
});
```

发送时 body 改成：

```ts
body: JSON.stringify({
  shop_slug: shopSlug,
  chat_id: chatId,
  text: message.text,
  reply_markup: message.replyMarkup,
}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/admin-rider-assign.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tests/pages/api/admin-rider-assign.test.ts src/lib/telegram-dispatch.ts src/pages/api/admin/rider-assign.ts && git commit -m "$(cat <<'EOF'
feat: add rider claim button to admin assign message
EOF
)"
```

## Task 2: 锁定 Telegram 接单后仍更新为 delivering

**Files:**
- Modify: `src/tests/pages/api/telegram-rider-claim.test.ts`
- Modify: `src/pages/api/telegram/rider-claim.ts`

- [ ] **Step 1: Write the failing test**

在 `src/tests/pages/api/telegram-rider-claim.test.ts` 追加：

```ts
test('POST rider-claim updates order to delivering with courier info from signed callback', async () => {
  const originalFetch = globalThis.fetch;

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
    });

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.equal(url, 'http://localhost/api/order/update_status');
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
        id: 108,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '骑手888',
        courier_phone: '0613888',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const request = new Request('http://localhost/api/telegram/rider-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({ callbackData, chatId: 'chat-888' }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/telegram-rider-claim.test.ts"`
Expected: 若当前实现或测试覆盖不足，应先 FAIL；若直接 PASS，则补下一步源断言确认当前实现被锁住。

- [ ] **Step 3: Write minimal implementation**

若上一步已 PASS，则追加一个源断言测试，不改生产逻辑；在同文件追加：

```ts
test('rider-claim source keeps awaiting_courier to delivering transition for telegram accept', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/api/telegram/rider-claim.ts'), 'utf8');

  assert.match(source, /expected_current_status: 'awaiting_courier'/);
  assert.match(source, /status: 'delivering'/);
  assert.match(source, /courier_name: matchedName/);
  assert.match(source, /courier_phone: matchedPhone/);
});
```

若确实失败，则仅补足使其通过的最小代码，保持现有协议不变。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/telegram-rider-claim.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tests/pages/api/telegram-rider-claim.test.ts src/pages/api/telegram/rider-claim.ts && git commit -m "$(cat <<'EOF'
test: lock telegram rider claim transition
EOF
)"
```

## Task 3: admin 明确显示骑手已接单

**Files:**
- Modify: `src/components/admin/TabTables.astro`
- Modify: `src/tests/pages/master/master-dispatch-ui.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/tests/pages/master/master-dispatch-ui.test.ts` 追加：

```ts
test('admin delivery card source labels rider acceptance clearly', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/components/admin/TabTables.astro'), 'utf8');

  assert.match(source, /o\.status === 'awaiting_courier' \? '待骑手确认'/);
  assert.match(source, /o\.status === 'delivering' \? '骑手已接单'/);
  assert.match(source, /已指派骑手：\{o\.courierName \|\| o\.courierPhone \|\| '未命名骑手'\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/master/master-dispatch-ui.test.ts"`
Expected: 若当前文字或文案不同则 FAIL；若直接 PASS，可进入最小收紧实现，确保文案保持不回退。

- [ ] **Step 3: Write minimal implementation**

如果失败，就把 `src/components/admin/TabTables.astro` 的状态文案和骑手显示收敛到：

```astro
{o.status === 'pending' ? '待处理' :
 o.status === 'confirmed' ? '已接单' :
 o.status === 'awaiting_courier' ? '待骑手确认' :
 o.status === 'delivering' ? '骑手已接单' : o.status}
```

并保留：

```astro
<span style="font-size:12px; color:#7c2d12; font-weight:700;">已指派骑手：{o.courierName || o.courierPhone || '未命名骑手'}</span>
```

如果已是该状态，则不改实现，只保留测试锁定。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/master/master-dispatch-ui.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabTables.astro src/tests/pages/master/master-dispatch-ui.test.ts && git commit -m "$(cat <<'EOF'
fix: lock admin rider acceptance copy
EOF
)"
```

## Task 4: 运行聚焦回归

**Files:**
- Test: `src/tests/pages/api/admin-rider-assign.test.ts`
- Test: `src/tests/pages/api/telegram-rider-claim.test.ts`
- Test: `src/tests/pages/master/master-dispatch-ui.test.ts`
- Test: `src/tests/pages/api/admin-rider-dispatch.test.ts`
- Test: `src/tests/pages/api/telegram-send.test.ts`
- Test: `src/tests/pages/api/rider-status.test.ts`

- [ ] **Step 1: Run focused regression suite**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/admin-rider-assign.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/telegram-rider-claim.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/master/master-dispatch-ui.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/admin-rider-dispatch.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/telegram-send.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/rider-status.test.ts"`
Expected: PASS.

- [ ] **Step 2: Manual verification checklist**

Run these checks in dev:

```text
1. Admin 点击“指派骑手”后，被指派骑手收到 Telegram 私聊消息
2. 消息里能看到订单号、地址、电话、金额、菜品摘要
3. 消息里有“立即接单”按钮
4. 骑手点击后，admin 订单状态从“待骑手确认”变成“骑手已接单”
5. admin 卡片里显示该骑手姓名或电话
6. 若 Telegram send 失败，admin 仍看到真实失败提示
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/rider-assign.ts src/lib/telegram-dispatch.ts src/tests/pages/api/admin-rider-assign.test.ts src/tests/pages/api/telegram-rider-claim.test.ts src/components/admin/TabTables.astro src/tests/pages/master/master-dispatch-ui.test.ts && git commit -m "$(cat <<'EOF'
feat: add telegram rider claim message for admin assign
EOF
)"
```

## Self-Review

- Spec coverage:
  - 指派消息包含订单摘要：Task 1
  - 指派消息包含“立即接单”按钮：Task 1
  - 点击后进入 `delivering`：Task 2
  - admin 明确显示骑手已接单：Task 3
  - Telegram 失败继续透出：Task 1 + Task 4
- Placeholder scan:
  - 无 TBD / TODO / “类似前文” 占位描述；每个任务都给了具体文件、命令、测试和代码骨架。
- Type consistency:
  - Telegram callback 统一使用 `callbackData` / `chatId`
  - 指派发送统一使用 `shop_slug` / `chat_id` / `reply_markup`
  - admin 回显统一依赖 `awaiting_courier` / `delivering` / `courierName` / `courierPhone`
