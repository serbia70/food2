import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import { buildDispatchMetaRemarks, readDispatchMetaFromRemarks } from './rider-dispatch.ts';
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
}

interface OrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone?: string;
  shopSlug?: string;
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
    const cloned = request.clone();
    calls.push({
      url: request.url,
      method: request.method,
      body: await cloned.text(),
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
    acceptedAt: overrides.acceptedAt || '',
    pickedUpAt: overrides.pickedUpAt || '',
    completedAt: overrides.completedAt || '',
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

test('stale picked_up callback 在 delivering 且当前骑手匹配时可成功推进', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramSendCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  assert.match(updateCall.body, /"expectedCurrentStatus":"delivering"/);
  assert.match(updateCall.body, /"status":"picked_up"/);
  assert.equal(telegramSendCall, undefined);
});

test('stale accept callback 仍返回 expired_callback', async (t) => {
  useTestEnv(t);
  useMockFetch(t, async () => {
    throw new Error('fetch should not be called');
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
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
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_completed');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
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
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_status_updated');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
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
  assert.equal(body.success, false);
  assert.equal(body.error, 'dispatch_invalidated');
  assert.equal(body.reason, '已改派');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
});

test('配送阶段 admin orders 未授权时回退 rider orders 仍能推进 picked_up', async (t) => {
  useTestEnv(t);
  const remarksJson = createRemarksJson();
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
          createOrderRow({ status: 'delivering', remarksJson }),
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
  assert.equal(calls.some((call) => call.url.includes('/api/rider/orders?phone=')), true);
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
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

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
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

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);

  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.match(nextMeta.pickedUpAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(nextMeta.completedAt, '');
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: TEST_CHAT_ID, messageId: 7788 });

  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0]?.body || '', /"message_id":7788/);
  assert.match(telegramCalls[0]?.body || '', /"chat_id":"123456789"/);
  assert.match(telegramCalls[0]?.body || '', /状态：配送中/);
  assert.match(telegramCalls[0]?.body || '', /接单时间：2026-04-14T10:03:00.000Z/);
  assert.match(telegramCalls[0]?.body || '', /取餐时间：/);
  assert.match(telegramCalls[0]?.body || '', /送达/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /已送达/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /"text":"Pizza One有新单/);
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

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(telegramCall);
  assert.match(telegramCall.body, /"shopSlug":"real-shop"/);
  assert.match(telegramCall.body, /real-shop/);
  assert.doesNotMatch(telegramCall.body, /admin/);
});

 test('complete edits original telegram message to readonly delivered state without buttons', async (t) => {
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
  assert.equal(body.success, true);
  assert.equal(body.action, 'complete');
  assert.ok(updateCall);

  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.equal(nextMeta.pickedUpAt, pickedUpAt);
  assert.match(nextMeta.completedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: TEST_CHAT_ID, messageId: 7788 });

  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0]?.body || '', /"message_id":7788/);
  assert.match(telegramCalls[0]?.body || '', /状态：已送达/);
  assert.match(telegramCalls[0]?.body || '', /接单时间：2026-04-14T10:03:00.000Z/);
  assert.match(telegramCalls[0]?.body || '', /取餐时间：2026-04-14T10:19:00.000Z/);
  assert.match(telegramCalls[0]?.body || '', /送达时间：/);
  assert.match(telegramCalls[0]?.body || '', /"inline_keyboard":\[\]/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /"callback_data":/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /"text":"Pizza One有新单/);
});

test('配送阶段 admin orders 只返回 remarks_json 时仍能识别当前骑手并推进 picked_up', async (t) => {
  useTestEnv(t);
  const remarksJson = createRemarksJson();
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
          remarks_json: remarksJson,
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
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
});

test('配送阶段 admin orders 返回对象包装时仍能识别当前骑手并推进 picked_up', async (t) => {
  useTestEnv(t);
  const remarksJson = createRemarksJson();
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
            remarks_json: remarksJson,
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
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
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
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
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
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
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
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
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
  assert.ok(updateCall);
  assert.equal(calls.some((call) => call.url.endsWith('/api/admin/orders/remarks')), false);

  const updatePayload = JSON.parse(updateCall.body) as {
    expectedCurrentStatus?: string;
    status?: string;
    remarksJson?: string;
  };
  assert.equal(updatePayload.expectedCurrentStatus, 'awaiting_courier');
  assert.equal(updatePayload.status, 'awaiting_courier');
  assert.equal(typeof updatePayload.remarksJson, 'string');

  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
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
  assert.equal(calls.some((call) => call.url.endsWith('/api/telegram/send')), false);
});

test('accept 成功时写回 dispatch_meta 保留当前骑手位，并把 Telegram 原消息切到待取餐', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const existingRemarksJson = createRemarksJson({
    currentAssignedAt,
    currentExpiresAt,
    invalidatedRiderIds: ['303'],
    declinedRiderIds: ['404'],
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  });
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: existingRemarksJson,
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const remarksCall = calls.find((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(remarksCall);

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
  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0]?.url, 'https://example.com/api/telegram/send');
  assert.match(telegramCalls[0]?.body || '', /"message_id":7788/);
  assert.match(telegramCalls[0]?.body || '', /状态：待取餐/);
  assert.match(telegramCalls[0]?.body || '', /"text":"取餐"/);
  assert.match(telegramCalls[0]?.body || '', /"callback_data":/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /"inline_keyboard":\[\]/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /送达/);
});

