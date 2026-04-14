import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { POST as handleAdminRiderDispatch } from '../pages/api/admin/rider-dispatch.ts';
import { POST as handleAdminRiderAssign } from '../pages/api/admin/rider-assign.ts';
import { readDispatchMetaFromRemarks } from './rider-dispatch.ts';

const TEST_API_BASE = 'https://api.example.com';

type FetchHandler = (request: Request) => Promise<Response>;

type MockCall = {
  url: string;
  method: string;
  body: string;
};

function useTestEnv(t: TestContext): void {
  const originalApiUrl = process.env.PUBLIC_API_URL;
  const originalCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.PUBLIC_API_URL = TEST_API_BASE;
  process.env.TELEGRAM_CALLBACK_SECRET = 'test-secret';
  t.after(() => {
    if (typeof originalApiUrl === 'string') {
      process.env.PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.PUBLIC_API_URL;
    }
    if (typeof originalCallbackSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalCallbackSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  });
}

function useMockFetch(t: TestContext, handler: FetchHandler): MockCall[] {
  const calls: MockCall[] = [];
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

function createCookies() {
  return {
    get: () => undefined,
  };
}

test('publish dispatch telegram includes shared shopName and explicit shopMapUrl', async (t) => {
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

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
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
      shopAddress: 'Bulevar 1',
      shopMapUrl: 'https://maps.example.com/shop-a',
      tableInfo: 'Address',
      totalAmount: 100,
      userPhone: '381600000000',
      pickupEtaMinutes: 12,
      status: 'awaiting_courier',
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  assert.ok(telegramCall);
  const telegramBody = JSON.parse(telegramCall.body) as { text?: string };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(String(telegramBody.text || ''), /Shop A/);
  assert.match(String(telegramBody.text || ''), /https:\/\/maps\.example\.com\/shop-a/);
});

test('publish dispatch stores telegram message ref into dispatch_meta remarks', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/903/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '903',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7788 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '903',
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
  const body = JSON.parse(await response.text()) as { success?: boolean; order?: { remarksJson?: string } };
  const meta = readDispatchMetaFromRemarks(body.order?.remarksJson || '');
  const remarksCalls = calls.filter((call) => call.url.endsWith('/api/admin/orders/remarks'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(meta.telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7788,
  });
  assert.ok(remarksCalls.length >= 1);
});

test('publish dispatch telegramMessageRef 回写前会重读最新 remarks 并保留并发新增内容', async (t) => {
  useTestEnv(t);
  const latestConcurrentRemarks = JSON.stringify([
    'note:keep-me',
    'dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}',
  ]);
  const remarksBodies: string[] = [];

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/904/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '904',
            remarksJson: latestConcurrentRemarks,
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      const requestBody = JSON.parse(await request.text()) as { remarks: string[] };
      remarksBodies.push(JSON.stringify(requestBody.remarks));
      return jsonResponse({ success: true, remarks: requestBody.remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7788 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '904',
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
  const body = JSON.parse(await response.text()) as { success?: boolean; order?: { remarksJson?: string } };
  const finalMeta = readDispatchMetaFromRemarks(body.order?.remarksJson || '');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(remarksBodies.length, 2);
  assert.match(remarksBodies[1] || '', /note:keep-me/);
  assert.deepEqual(finalMeta.telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
  assert.equal(calls.some((call) => call.url.endsWith('/api/admin/orders') && call.method === 'GET'), true);
});

test('manual assign 仅 remarks 回写失败时仍返回 success 和 warning', async (t) => {
  useTestEnv(t);
  let remarksWriteCount = 0;

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '905',
            remarksJson: JSON.stringify(['note:keep-me']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/905/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9988 } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      remarksWriteCount += 1;
      return jsonResponse({ success: false, error: 'db_busy' }, 500);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId: '905',
      riderId: '202',
      shopSlug: 'shop-a',
      pickupEtaMinutes: 12,
      orderSummary: {
        orderNo: '905',
        shopName: 'Shop A',
        deliveryAddress: 'Address',
        userPhone: '381600000000',
        totalAmount: 100,
        items: [{ name: 'Burger', quantity: 1 }],
      },
    }),
  });

  const response = await handleAdminRiderAssign({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as {
    success?: boolean;
    warning?: { code?: string; upstream_status?: number; upstream_body?: string };
    order?: { remarksJson?: string };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(remarksWriteCount, 1);
  assert.deepEqual(body.warning, {
    code: 'telegram_message_ref_persist_failed',
    upstream_status: 500,
    upstream_body: '{"success":false,"error":"db_busy"}',
  });
  assert.equal(body.order?.remarksJson, JSON.stringify(['note:keep-me']));
});

test('manual assign latest remarks 重读失败时不得覆盖 remarks 且返回 warning', async (t) => {
  useTestEnv(t);
  let orderReadCount = 0;
  let remarksWriteCount = 0;

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      orderReadCount += 1;
      if (orderReadCount === 1) {
        return jsonResponse({
          success: true,
          orders: [
            {
              id: '906',
              remarksJson: JSON.stringify(['note:keep-me']),
              shopSlug: 'shop-a',
              shopName: 'Shop A',
              tableInfo: 'Address',
              totalAmount: 100,
              userPhone: '381600000000',
              status: 'awaiting_courier',
            },
          ],
        });
      }
      return new Response('{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/admin/orders/906/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9988 } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      remarksWriteCount += 1;
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId: '906',
      riderId: '202',
      shopSlug: 'shop-a',
      pickupEtaMinutes: 12,
      orderSummary: {
        orderNo: '906',
        shopName: 'Shop A',
        deliveryAddress: 'Address',
        userPhone: '381600000000',
        totalAmount: 100,
        items: [{ name: 'Burger', quantity: 1 }],
      },
    }),
  });

  const response = await handleAdminRiderAssign({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as {
    success?: boolean;
    warning?: { code?: string; upstream_status?: number; upstream_body?: string };
    order?: { remarksJson?: string };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(orderReadCount, 2);
  assert.equal(remarksWriteCount, 0);
  assert.deepEqual(body.warning, {
    code: 'telegram_message_ref_persist_failed',
  });
  assert.equal(body.order?.remarksJson, JSON.stringify(['note:keep-me']));
});

test('republish_on_timeout 在 delivering 状态下不得改写 dispatch_meta 当前骑手位', async (t) => {
  useTestEnv(t);
  const originalMeta = {
    lastRiderDecision: {
      action: 'accepted' as const,
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-10T10:00:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-10T10:00:00.000Z',
    currentExpiresAt: '2026-04-10T10:05:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
  };
  const remarksJson = JSON.stringify([`dispatch_meta:${JSON.stringify(originalMeta)}`]);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/901/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
          { id: '303', name: 'Rider 2', phone: '381641111111', telegramChatId: 'chat-2', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '901',
      action: 'republish_on_timeout',
      remarksJson,
      status: 'delivering',
      shopSlug: 'shop-a',
      shopName: 'Shop A',
      tableInfo: 'Address',
      totalAmount: 100,
      userPhone: '381600000000',
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean; skipped?: boolean; order?: { remarksJson?: string } };
  const remarksCall = calls.find((call) => call.url.endsWith('/api/admin/orders/remarks'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.skipped, true);
  assert.equal(remarksCall, undefined);
  assert.equal(calls.some((call) => call.url.endsWith('/api/telegram/send')), false);
  assert.equal(readDispatchMetaFromRemarks(body.order?.remarksJson || '').currentRiderId, '202');
});
