import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';

import { buildDispatchMetaRemarks, readDispatchMetaFromRemarks } from './rider-dispatch.ts';
import { runSharedRiderProgressAction } from './rider-route-shared.ts';
import { buildTelegramShortClaimCallback } from './telegram-dispatch.ts';
import { handleTelegramRiderClaim } from '../pages/api/telegram/rider-claim.ts';

const TEST_SECRET = 'telegram-rider-claim-test-secret';
const TEST_API_BASE = 'https://api.example.com';
const TEST_CHAT_ID = '123456789';
const TEST_ORDER_ID = 101;
const TEST_RIDER_ID = 202;
const TEST_RIDER_NAME = 'Rider 1';
const TEST_RIDER_PHONE = '381641234567';

type FetchHandler = (request: Request) => Promise<Response>;

interface MockFetchCall {
  url: string;
  method: string;
  body: string;
  headers: Headers;
}

interface OrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone?: string;
  shopSlug?: string;
  itemsJson?: string;
}

function useTestEnv(t: TestContext): void {
  const originalCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const originalApiUrl = process.env.PUBLIC_API_URL;

  process.env.TELEGRAM_CALLBACK_SECRET = TEST_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = TEST_SECRET;
  process.env.PUBLIC_API_URL = TEST_API_BASE;

  t.after(() => {
    if (typeof originalCallbackSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalCallbackSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }

    if (typeof originalWebhookSecret === 'string') {
      process.env.TELEGRAM_WEBHOOK_SECRET = originalWebhookSecret;
    } else {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    }

    if (typeof originalApiUrl === 'string') {
      process.env.PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.PUBLIC_API_URL;
    }
  });
}

function useMockFetch(t: TestContext, handler: FetchHandler): MockFetchCall[] {
  const calls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      body: await request.clone().text(),
      headers: request.headers,
    });
    return handler(request);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createRemarksJson(overrides: Partial<{
  currentRiderId: string;
  currentAssignedAt: string;
  currentExpiresAt: string;
  invalidatedRiderIds: string[];
  declinedRiderIds: string[];
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
  telegramMessageRef: { chatId: string; messageId: number } | null;
}> = {}): string {
  return JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: null,
    declinedRiderIds: overrides.declinedRiderIds || [],
    currentRiderId: overrides.currentRiderId || String(TEST_RIDER_ID),
    currentAssignedAt: overrides.currentAssignedAt || '2026-04-10T10:00:00.000Z',
    currentExpiresAt: overrides.currentExpiresAt || new Date(Date.now() + 5 * 60_000).toISOString(),
    invalidatedRiderIds: overrides.invalidatedRiderIds || [],
    lastInvalidationReason: null,
    acceptedAt: overrides.acceptedAt ?? '',
    pickedUpAt: overrides.pickedUpAt ?? '',
    completedAt: overrides.completedAt ?? '',
    telegramMessageRef: overrides.telegramMessageRef === undefined ? null : overrides.telegramMessageRef,
  }));
}

function createOrderRow(snapshot: OrderSnapshot): Record<string, unknown> {
  return {
    id: String(TEST_ORDER_ID),
    orderNo: 'A101',
    status: snapshot.status,
    remarksJson: snapshot.remarksJson,
    courierPhone: snapshot.courierPhone ?? TEST_RIDER_PHONE,
    shopSlug: snapshot.shopSlug ?? 'shop-1',
    shopName: 'Pizza One',
    shopAddress: 'Shop Street 1',
    shopMapUrl: 'https://maps.example.com/shop',
    tableInfo: 'Test Address',
    userPhone: '381600000000',
    totalAmount: 1500,
    pickupEtaMinutes: 20,
    itemsJson: snapshot.itemsJson ?? JSON.stringify([
      { name: '土豆牛肉饼', subName: 'Pljeskavica', quantity: 2, price: 600 },
      { name: '可乐', subName: 'Coca-Cola', quantity: 1, price: 200 },
    ]),
  };
}

function signShortCallbackParts(parts: string[]): string {
  return createHmac('sha256', TEST_SECRET)
    .update(['rc2', ...parts].join('.'))
    .digest('base64url')
    .slice(0, 8);
}

function hashChatId(chatId: string): string {
  return createHmac('sha256', TEST_SECRET)
    .update(`chat:${chatId}`)
    .digest('base64url')
    .slice(0, 6);
}

function createCallback(action: 'accept' | 'picked_up' | 'complete', expiresAt: number): string {
  if (action === 'accept') {
    const parts = [
      'a',
      TEST_ORDER_ID.toString(36),
      TEST_RIDER_ID.toString(36),
      Math.floor(expiresAt / 1000).toString(36),
      hashChatId(TEST_CHAT_ID),
      TEST_RIDER_PHONE,
      'Rider_1',
    ];
    return `rc2.${parts.join('.')}.${signShortCallbackParts(parts)}`;
  }

  return buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'shop-1',
    telegramChatId: TEST_CHAT_ID,
    action,
    expiresAt,
  });
}

function createRequest(callbackData: string): Request {
  return new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callbackData, chatId: TEST_CHAT_ID }),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

interface TelegramSendPayloadButton {
  text?: string;
  url?: string;
  callback_data?: string;
}

interface TelegramSendPayload {
  chat_id?: string;
  message_id?: number;
  text?: string;
  shopSlug?: string;
  replyMarkup?: {
    inline_keyboard?: TelegramSendPayloadButton[][];
  };
  reply_markup?: {
    inline_keyboard?: TelegramSendPayloadButton[][];
  };
}

function readTelegramSendPayload(call: MockFetchCall | undefined): TelegramSendPayload {
  assert.ok(call);
  return JSON.parse(call.body) as TelegramSendPayload;
}

function readTelegramInlineKeyboard(payload: TelegramSendPayload): TelegramSendPayloadButton[][] {
  return payload.replyMarkup?.inline_keyboard || payload.reply_markup?.inline_keyboard || [];
}

function flattenTelegramButtonTexts(payload: TelegramSendPayload): string[] {
  return readTelegramInlineKeyboard(payload).flat().map((button) => button.text ?? '');
}

function findTelegramButton(payload: TelegramSendPayload, text: string): TelegramSendPayloadButton | undefined {
  return readTelegramInlineKeyboard(payload).flat().find((button) => button.text === text);
}

function readRouteSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function createFetchHandler(
  snapshot: OrderSnapshot,
  options?: {
    updateStatusOk?: boolean;
    updateStatusBody?: unknown;
    updateStatusStatus?: number;
  },
): FetchHandler {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow(snapshot)]);
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse(
        options?.updateStatusBody ?? { success: options?.updateStatusOk !== false },
        options?.updateStatusStatus ?? (options?.updateStatusOk === false ? 409 : 200),
      );
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  };
}

test('telegram/rider-claim route uses shared non-decline progress helper and keeps decline path local', () => {
  assert.equal(typeof runSharedRiderProgressAction, 'function');
  const source = readRouteSource('../pages/api/telegram/rider-claim.ts');

  assert.match(source, /runSharedRiderProgressAction\(/);
  assert.doesNotMatch(source, /const nextActionTimes = \{/);
  assert.match(source, /if \(isDeclineAction\) \{/);
});

test('stale picked_up callback 在 delivering 且当前骑手匹配时可成功推进', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.strictEqual(response.status, 200);
  assert.ok(body.success);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  assert.match(updateCall.body, /"expectedCurrentStatus":"delivering"/);
  assert.match(updateCall.body, /"status":"picked_up"/);
  assert.ok(!calls.find((call) => call.url.endsWith('/api/telegram/send')));
});

test('stale accept callback 仍返回 expired_callback', async (t) => {
  useTestEnv(t);
  useMockFetch(t, async () => {
    throw new Error('fetch should not be called');
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.ok(!body.success);
  assert.equal(body.error, 'expired_callback');
});

test('stale complete callback 在订单已完成时返回 order_completed', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'completed',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.ok(!body.success);
  assert.equal(body.error, 'order_completed');
  assert.ok(!calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('配送阶段状态已变化时优先返回 order_status_updated', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.ok(!body.success);
  assert.equal(body.error, 'order_status_updated');
  assert.ok(!calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('配送阶段当前骑手不匹配时优先返回 dispatch_invalidated', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({ currentRiderId: '303' }),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.ok(!body.success);
  assert.equal(body.error, 'dispatch_invalidated');
  assert.equal(body.reason, '已改派');
  assert.ok(!calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('配送阶段 admin orders 未授权时回退 rider orders 仍能推进 picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    }

    if (url.pathname === '/api/rider/orders') {
      return jsonResponse({
        success: true,
        orders: [
          createOrderRow({ status: 'delivering', remarksJson: createRemarksJson() }),
        ],
      });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.strictEqual(response.status, 200);
  assert.ok(body.success);
  assert.equal(body.action, 'picked_up');
  assert.ok(calls.some((call) => call.url.includes('/api/rider/orders?phone=')));
  assert.ok(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('配送阶段 remarksJson 为空但订单仍属于当前骑手时可推进 picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: '',
    courierPhone: TEST_RIDER_PHONE,
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.strictEqual(response.status, 200);
  assert.ok(body.success);
  assert.equal(body.action, 'picked_up');
  assert.ok(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('picked_up writes pickedUpAt and edits original telegram message instead of sending new one', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt,
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.strictEqual(response.status, 200);
  assert.ok(body.success);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);

  const updatePayload = JSON.parse(updateCall.body) as { id?: unknown; remarksJson?: string };
  assert.equal(updatePayload.id, TEST_ORDER_ID);
  const nextMeta = readDispatchMetaFromRemarks(updatePayload.remarksJson || '');
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.match(nextMeta.pickedUpAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(nextMeta.completedAt, '');
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: TEST_CHAT_ID, messageId: 7788 });

  assert.strictEqual(telegramCalls.length, 1);
  assert.match(telegramCalls[0].body, /"message_id":7788/);
  assert.match(telegramCalls[0].body, /"chat_id":"123456789"/);
  assert.match(telegramCalls[0].body, /状态：配送中/);
  assert.match(telegramCalls[0].body, /接单时间：12:03/);
  assert.match(telegramCalls[0].body, /取餐时间：\d{2}:\d{2}/);
  assert.doesNotMatch(telegramCalls[0].body, /取餐时间：\d{4}-\d{2}-\d{2}T/);
  assert.match(telegramCalls[0].body, /菜品：/);
  assert.match(telegramCalls[0].body, /土豆牛肉饼 \/ Pljeskavica x2 · 600 RSD/);
  assert.match(telegramCalls[0].body, /可乐 \/ Coca-Cola x1 · 200 RSD/);
  assert.match(telegramCalls[0].body, /送达/);
  assert.doesNotMatch(telegramCalls[0].body, /已送达/);
  assert.doesNotMatch(telegramCalls[0].body, /Nova dodeljena porudžbina|Stavke/);
  assert.doesNotMatch(telegramCalls[0].body, /"text":"Pizza One有新单/);
});

test('picked_up 更新成功后即使二次读取订单失败也必须编辑原消息', async (t) => {
  useTestEnv(t);
  let adminOrdersReads = 0;
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      adminOrdersReads += 1;
      if (adminOrdersReads === 1) {
        return jsonResponse([createOrderRow({
          status: 'delivering',
          remarksJson: createRemarksJson({
            acceptedAt: '2026-04-14T10:03:00.000Z',
            telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
          }),
          shopSlug: 'real-shop',
        })]);
      }
      return jsonResponse([], 200);
    }

    if (url.pathname === '/api/rider/orders') {
      return jsonResponse({ success: true, orders: [] });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.strictEqual(response.status, 200);
  assert.ok(body.success);
  assert.equal(body.action, 'picked_up');
  assert.strictEqual(telegramCalls.length, 1);
  const telegramPayload = readTelegramSendPayload(telegramCalls[0]);
  assert.match(telegramPayload.text || '', /状态：配送中/);
  assert.ok(findTelegramButton(telegramPayload, '送达'));
  assert.strictEqual(typeof findTelegramButton(telegramPayload, '送达')?.callback_data, 'string');
  assert.ok(findTelegramButton(telegramPayload, '送达')?.callback_data?.trim().length);
});

test('picked_up 编辑消息时使用订单真实 shopSlug 且 complete callback 不回退 admin', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt: '2026-04-14T10:03:00.000Z',
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
    shopSlug: 'real-shop',
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.strictEqual(response.status, 200);
  assert.ok(body.success);
  assert.equal(body.action, 'picked_up');
  assert.ok(telegramCall);
  assert.match(telegramCall.body, /"shopSlug":"real-shop"/);
  assert.match(telegramCall.body, /real-shop/);
  assert.doesNotMatch(telegramCall.body, /admin/);
});

test('complete edits original telegram message to readonly delivered state without action buttons', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const pickedUpAt = '2026-04-14T10:19:00.000Z';
  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson: createRemarksJson({
      acceptedAt,
      pickedUpAt,
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.ok(body.success);
  assert.equal(body.action, 'complete');
  assert.ok(updateCall);

  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(updatePayload.remarksJson || '');
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.equal(nextMeta.pickedUpAt, pickedUpAt);
  assert.match(nextMeta.completedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: TEST_CHAT_ID, messageId: 7788 });

  assert.strictEqual(telegramCalls.length, 1);
  const telegramPayload = readTelegramSendPayload(telegramCalls[0]);
  assert.equal(telegramPayload.message_id, 7788);
  assert.match(telegramPayload.text || '', /状态：已送达/);
  assert.match(telegramPayload.text || '', /接单时间：12:03/);
  assert.match(telegramPayload.text || '', /取餐时间：12:19/);
  assert.match(telegramPayload.text || '', /送达时间：\d{2}:\d{2}/);
  assert.doesNotMatch(telegramPayload.text || '', /送达时间：\d{4}-\d{2}-\d{2}T/);
  assert.match(telegramPayload.text || '', /菜品：/);
  assert.match(telegramPayload.text || '', /土豆牛肉饼 \/ Pljeskavica x2 · 600 RSD/);
  assert.match(telegramPayload.text || '', /可乐 \/ Coca-Cola x1 · 200 RSD/);
  assert.ok(flattenTelegramButtonTexts(telegramPayload).includes('取餐导航'));
  assert.ok(flattenTelegramButtonTexts(telegramPayload).includes('送餐导航'));
  assert.ok(!readTelegramInlineKeyboard(telegramPayload).flat().some((button) => typeof button.callback_data === 'string' && button.callback_data.trim().length > 0));
  assert.doesNotMatch(telegramPayload.text || '', /Nova dodeljena porudžbina|Stavke/);
  assert.doesNotMatch(telegramPayload.text || '', /Pizza One有新单/);
});

test('配送阶段 admin orders 只返回 remarks_json 时仍能识别当前骑手并推进 picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          ...createOrderRow({ status: 'delivering', remarksJson: '' }),
          remarksJson: '',
          remarks_json: createRemarksJson(),
        },
      ]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('配送阶段 admin orders 返回对象包装时仍能识别当前骑手并推进 picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({
        success: true,
        orders: [
          {
            ...createOrderRow({ status: 'delivering', remarksJson: '' }),
            remarksJson: '',
            remarks_json: createRemarksJson(),
          },
        ],
      });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('picked_up 调用 update_status 返回 409 时透传业务错误', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }, {
    updateStatusOk: false,
    updateStatusStatus: 409,
    updateStatusBody: { success: false, error: 'order_status_updated' },
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_status_updated');
  assert.equal(body.action, undefined);
  assert.ok(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('complete 调用 update_status 返回 409 时透传业务错误', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson: createRemarksJson(),
  }, {
    updateStatusOk: false,
    updateStatusStatus: 409,
    updateStatusBody: { success: false, error: 'dispatch_invalidated', reason: '已改派' },
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'dispatch_invalidated');
  assert.equal(body.reason, '已改派');
  assert.equal(body.action, undefined);
  assert.ok(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('complete 在订单快照仍为 delivering 时返回 order_status_updated 且不调用 update_status', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_status_updated');
  assert.ok(!calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('decline 通过共享 actionDecision 的单一路径写回 update_status remarks 且不走 admin remarks', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({ success: false }, 500);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const declineCallback = buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'shop-1',
    telegramChatId: TEST_CHAT_ID,
    action: 'decline',
    expiresAt: Date.now() + 60_000,
  });
  const response = await handleTelegramRiderClaim(createRequest(declineCallback));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'decline');
  assert.equal(body.reassigned, false);
  assert.ok(updateCall);
  assert.ok(!calls.some((call) => call.url.endsWith('/api/admin/orders/remarks')));

  const updatePayload = JSON.parse(updateCall.body) as {
    expectedCurrentStatus?: string;
    status?: string;
    remarksJson?: string;
  };
  assert.equal(updatePayload.expectedCurrentStatus, 'awaiting_courier');
  assert.equal(updatePayload.status, 'awaiting_courier');
  assert.equal(typeof updatePayload.remarksJson, 'string');

  const nextMeta = readDispatchMetaFromRemarks(updatePayload.remarksJson);
  assert.equal(nextMeta.lastRiderDecision?.action, 'declined');
  assert.equal(nextMeta.lastRiderDecision?.riderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.lastRiderDecision?.riderPhone, TEST_RIDER_PHONE);
  assert.equal(nextMeta.currentRiderId, '');
  assert.deepEqual(nextMeta.declinedRiderIds, ['404', String(TEST_RIDER_ID)]);
  assert.deepEqual(nextMeta.invalidatedRiderIds, [String(TEST_RIDER_ID)]);
  assert.equal(nextMeta.lastInvalidationReason, 'declined');
  assert.doesNotMatch(updateCall.body, /"courierName"/);
  assert.doesNotMatch(updateCall.body, /"courierPhone"/);
});

test('decline 自动续派在 rider-dispatch 返回 success true 且 telegram_dispatch delivered 时必须返回 reassigned true', async (t) => {
  useTestEnv(t);
  const nextRiderId = '303';
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
          {
            id: nextRiderId,
            name: 'Rider 2',
            phone: '381641111111',
            telegramChatId: '987654321',
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({
        success: true,
        telegram_dispatch: {
          failedCount: 0,
          skippedReason: '',
          attempts: [
            {
              riderId: nextRiderId,
              delivered: true,
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const declineCallback = buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'shop-1',
    telegramChatId: TEST_CHAT_ID,
    action: 'decline',
    expiresAt: Date.now() + 60_000,
  });
  const response = await handleTelegramRiderClaim(createRequest(declineCallback));
  const body = await readJson(response);
  const redispatchCall = calls.find((call) => call.url.endsWith('/api/admin/rider-dispatch'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'decline');
  assert.equal(body.reassigned, true);
  assert.ok(redispatchCall);
  assert.match(redispatchCall.body, new RegExp(`"forceRiderId":"${nextRiderId}"`));
});

test('decline 自动续派不得再把 deliveredCount 当作 reassigned 成功判据', async (t) => {
  useTestEnv(t);
  const nextRiderId = '303';
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
          {
            id: nextRiderId,
            name: 'Rider 2',
            phone: '381641111111',
            telegramChatId: '987654321',
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({
        success: true,
        telegram_dispatch: {
          deliveredCount: 1,
          failedCount: 0,
          skippedReason: '',
          attempts: [
            {
              riderId: nextRiderId,
              delivered: false,
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const declineCallback = buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'shop-1',
    telegramChatId: TEST_CHAT_ID,
    action: 'decline',
    expiresAt: Date.now() + 60_000,
  });
  const response = await handleTelegramRiderClaim(createRequest(declineCallback));
  const body = await readJson(response);
  const redispatchCall = calls.find((call) => call.url.endsWith('/api/admin/rider-dispatch'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'decline');
  assert.equal(body.reassigned, false);
  assert.ok(redispatchCall);
  assert.match(redispatchCall.body, new RegExp(`"forceRiderId":"${nextRiderId}"`));
});

test('decline 自动续派在 rider-dispatch 返回 success true 但 telegram_dispatch 失败时必须保持 reassigned false', async (t) => {
  useTestEnv(t);
  const nextRiderId = '303';
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
          {
            id: nextRiderId,
            name: 'Rider 2',
            phone: '381641111111',
            telegramChatId: '987654321',
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({
        success: true,
        telegram_dispatch: {
          failedCount: 1,
          skippedReason: 'no_telegram_bound_riders',
        },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const declineCallback = buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'shop-1',
    telegramChatId: TEST_CHAT_ID,
    action: 'decline',
    expiresAt: Date.now() + 60_000,
  });
  const response = await handleTelegramRiderClaim(createRequest(declineCallback));
  const body = await readJson(response);
  const redispatchCall = calls.find((call) => call.url.endsWith('/api/admin/rider-dispatch'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'decline');
  assert.equal(body.reassigned, false);
  assert.ok(redispatchCall);
  assert.match(redispatchCall.body, new RegExp(`"forceRiderId":"${nextRiderId}"`));
});

test('decline update_status 调用会透传 cookie 和 authorization 头', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({ success: false }, 500);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const declineCallback = buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'shop-1',
    telegramChatId: TEST_CHAT_ID,
    action: 'decline',
    expiresAt: Date.now() + 60_000,
  });
  const response = await handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify({ callbackData: declineCallback, chatId: TEST_CHAT_ID }),
  }));
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.success, true);
  assert.ok(updateCall);
  assert.equal(updateCall.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(updateCall.headers.get('authorization'), 'Bearer test-token');
});

test('accept 失败时走共享错误出口并且不补发阶段消息', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson(),
  }, {
    updateStatusOk: false,
    updateStatusStatus: 409,
    updateStatusBody: { success: false, error: 'order_status_updated' },
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_status_updated');
  assert.ok(!calls.some((call) => call.url.endsWith('/api/telegram/send')));
});

test('accept 成功时即使 list_available 不再返回当前骑手，也必须编辑出取餐按钮', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [] });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({
          currentAssignedAt,
          currentExpiresAt,
          invalidatedRiderIds: ['303'],
          declinedRiderIds: ['404'],
          telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
        }),
      })]);
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.success, true);
  assert.strictEqual(telegramCalls.length, 1);
  const telegramPayload = readTelegramSendPayload(telegramCalls[0]);
  assert.ok(findTelegramButton(telegramPayload, '取餐'));
  assert.strictEqual(typeof findTelegramButton(telegramPayload, '取餐')?.callback_data, 'string');
  assert.ok(findTelegramButton(telegramPayload, '取餐')?.callback_data?.trim().length);
});

test('accept 成功时订单只有 restaurantId 也必须编辑出取餐按钮', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [] });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          ...createOrderRow({
            status: 'awaiting_courier',
            remarksJson: createRemarksJson({
              telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
            }),
            shopSlug: '',
          }),
          shopSlug: '',
          restaurantId: 103,
        },
      ]);
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.success, true);
  assert.strictEqual(telegramCalls.length, 1);
  const telegramPayload = readTelegramSendPayload(telegramCalls[0]);
  assert.equal(telegramPayload.shopSlug, '103');
  assert.ok(findTelegramButton(telegramPayload, '取餐'));
  assert.strictEqual(typeof findTelegramButton(telegramPayload, '取餐')?.callback_data, 'string');
  assert.ok(findTelegramButton(telegramPayload, '取餐')?.callback_data?.trim().length);
});

test('accept 成功时写回 dispatch_meta 保留当前骑手位，并把 Telegram 原消息切到待取餐', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson({
      currentAssignedAt,
      currentExpiresAt,
      invalidatedRiderIds: ['303'],
      declinedRiderIds: ['404'],
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const remarksCall = calls.find((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.success, true);
  assert.ok(remarksCall);
  assert.ok(updateCall);

  const remarksPayload = JSON.parse(remarksCall.body) as { remarks?: string[] };
  assert.ok(Array.isArray(remarksPayload.remarks), 'remarks must be a string array');
  const nextMeta = readDispatchMetaFromRemarks(JSON.stringify(remarksPayload.remarks));

  assert.equal(nextMeta.lastRiderDecision?.action, 'accepted');
  assert.equal(nextMeta.lastRiderDecision?.riderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.currentRiderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.currentAssignedAt, currentAssignedAt);
  assert.equal(nextMeta.currentExpiresAt, currentExpiresAt);
  assert.deepEqual(nextMeta.invalidatedRiderIds, ['303']);
  assert.equal(nextMeta.lastInvalidationReason, null);
  assert.deepEqual(nextMeta.declinedRiderIds, []);
  assert.equal(updateCall.headers.get('cookie'), null);
  assert.equal(updateCall.headers.get('authorization'), null);
  assert.strictEqual(telegramCalls.length, 1);
  assert.equal(telegramCalls[0].url, 'https://example.com/api/telegram/send');
  const telegramPayload = readTelegramSendPayload(telegramCalls[0]);
  assert.equal(telegramPayload.message_id, 7788);
  assert.match(telegramPayload.text || '', /状态：待取餐/);
  assert.ok(findTelegramButton(telegramPayload, '取餐'));
  assert.strictEqual(typeof findTelegramButton(telegramPayload, '取餐')?.callback_data, 'string');
  assert.ok(findTelegramButton(telegramPayload, '取餐')?.callback_data?.trim().length);
  assert.doesNotMatch(telegramPayload.text || '', /送达/);
});

test('accept 成功时 admin orders 未授权且回退 rider orders 仍保留取餐导航', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [] });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    }

    if (url.pathname === '/api/rider/orders') {
      return jsonResponse({
        success: true,
        orders: [
          {
            ...createOrderRow({
              status: 'awaiting_courier',
              remarksJson: createRemarksJson({
                currentAssignedAt,
                currentExpiresAt,
                telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
              }),
            }),
            shopAddress: '',
            restaurantAddress: 'Bulevar 1',
            shopMapUrl: 'https://maps.example.com/shop-a',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.success, true);
  assert.ok(calls.some((call) => call.url.includes('/api/rider/orders?phone=')));
  assert.strictEqual(telegramCalls.length, 1);
  const telegramPayload = readTelegramSendPayload(telegramCalls[0]);
  assert.match(telegramPayload.text || '', /状态：待取餐/);
  assert.ok(findTelegramButton(telegramPayload, '取餐'));
  assert.strictEqual(typeof findTelegramButton(telegramPayload, '取餐')?.callback_data, 'string');
  assert.ok(findTelegramButton(telegramPayload, '取餐')?.callback_data?.trim().length);
  assert.equal(findTelegramButton(telegramPayload, '取餐导航')?.url, 'https://maps.example.com/shop-a');
  assert.equal(findTelegramButton(telegramPayload, '送餐导航')?.text, '送餐导航');
});

test('accept update_status 调用会透传 cookie 和 authorization 头', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson({
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));

  const response = await handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify({
      callbackData: createCallback('accept', Date.now() + 60_000),
      chatId: TEST_CHAT_ID,
    }),
  }));
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  const body = await readJson(response);
  assert.equal(body.success, true);
  assert.ok(updateCall);
  assert.equal(updateCall.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(updateCall.headers.get('authorization'), 'Bearer test-token');
});

