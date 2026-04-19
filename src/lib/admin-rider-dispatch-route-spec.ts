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

function readRemarksPayload(call: MockCall): { orderId: string; remarks: string[] } {
  const parsed = JSON.parse(call.body) as { orderId?: unknown; remarks?: unknown };
  return {
    orderId: String(parsed.orderId || '').trim(),
    remarks: Array.isArray(parsed.remarks) ? parsed.remarks.map((item) => String(item || '')) : [],
  };
}

function readDispatchMetaFromRemarksPayload(call: MockCall) {
  return readDispatchMetaFromRemarks(JSON.stringify(readRemarksPayload(call).remarks));
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
  assert.equal(telegramCall.url, 'https://example.com/api/telegram/send');
  const telegramBody = JSON.parse(telegramCall.body) as { text?: string };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(String(telegramBody.text || ''), /Shop A/);
  assert.match(String(telegramBody.text || ''), /https:\/\/maps\.example\.com\/shop-a/);
});

test('publish dispatch stores telegram message ref into remarks write payload', async (t) => {
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
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const remarksCalls = calls.filter((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const finalRemarksCall = remarksCalls.at(-1);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(finalRemarksCall);
  assert.equal(readRemarksPayload(finalRemarksCall).orderId, '903');
  assert.deepEqual(readDispatchMetaFromRemarksPayload(finalRemarksCall).telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7788,
  });
});

test('publish dispatch accepts top-level telegram message_id when writing telegramMessageRef remarks payload', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/907/status') {
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
            id: '907',
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
      return jsonResponse({ success: true, message_id: 7789 });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '907',
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
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const remarksCalls = calls.filter((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const finalRemarksCall = remarksCalls.at(-1);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(finalRemarksCall);
  assert.equal(readRemarksPayload(finalRemarksCall).orderId, '907');
  assert.deepEqual(readDispatchMetaFromRemarksPayload(finalRemarksCall).telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7789,
  });
});

test('manual assign accepts top-level telegram message_id when writing telegramMessageRef remarks payload', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
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
            id: '908',
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

    if (url.pathname === '/api/admin/orders/908/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, message_id: 7790 });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId: '908',
      riderId: '202',
      shopSlug: 'shop-a',
      pickupEtaMinutes: 12,
      orderSummary: {
        orderNo: '908',
        shopName: 'Shop A',
        deliveryAddress: 'Address',
        userPhone: '381600000000',
        totalAmount: 100,
        items: [{ name: 'Burger', quantity: 1 }],
      },
    }),
  });

  const response = await handleAdminRiderAssign({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const remarksCalls = calls.filter((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const finalRemarksCall = remarksCalls.at(-1);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(finalRemarksCall);
  assert.equal(readRemarksPayload(finalRemarksCall).orderId, '908');
  assert.deepEqual(readDispatchMetaFromRemarksPayload(finalRemarksCall).telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7790,
  });
});


test('manual assign telegram uses restaurantName from fetched order row when shopName is missing', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
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
            id: '909',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            restaurantName: 'Ruma Sushi',
            restaurantAddress: 'Bulevar 1',
            tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/909/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, message_id: 7791 });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId: '909',
      riderId: '202',
      shopSlug: 'shop-a',
      pickupEtaMinutes: 12,
      orderSummary: {
        orderNo: '909',
        deliveryAddress: 'Address',
        userPhone: '381600000000',
        totalAmount: 100,
        items: [{ name: 'Burger', quantity: 1 }],
      },
    }),
  });

  const response = await handleAdminRiderAssign({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  const telegramBody = JSON.parse(String(telegramCall?.body || '{}')) as { text?: string; reply_markup?: { inline_keyboard?: Array<Array<{ text?: string; url?: string }>> } };
  const buttons = telegramBody.reply_markup?.inline_keyboard?.flat() || [];
  const pickupButton = buttons.find((button) => button.text === '取餐导航');
  const deliveryButton = buttons.find((button) => button.text === '送餐导航');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(String(telegramBody.text || ''), /店铺：Ruma Sushi/);
  assert.doesNotMatch(String(telegramBody.text || ''), /店铺：店铺/);
  assert.equal(String(pickupButton?.url || ''), 'https://www.google.com/maps/search/?api=1&query=Bulevar%201');
  assert.equal(String(deliveryButton?.url || ''), 'https://www.google.com/maps/search/?api=1&query=ruma1');
});

test('manual assign still uses fetched shop data when orderNo differs from internal orderId', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
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
            id: '916',
            orderNo: '260415016',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            restaurantName: 'Ruma Sushi',
            restaurantAddress: 'Bulevar 1',
            tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
            totalAmount: 611,
            userPhone: '0613083888',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/916/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, message_id: 7792 });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId: '916',
      riderId: '202',
      shopSlug: 'shop-a',
      pickupEtaMinutes: 10,
      orderSummary: {
        orderNo: '260415016',
        deliveryAddress: 'hui, 0613083888, ruma1 [货到付款/Cash] (备注:)',
        userPhone: '0613083888',
        totalAmount: 611,
        items: [{ name: 'Fileti ribe u ljutom ulju (Shuizhu)', quantity: 1 }],
      },
    }),
  });

  const response = await handleAdminRiderAssign({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  const telegramBody = JSON.parse(String(telegramCall?.body || '{}')) as { text?: string; reply_markup?: { inline_keyboard?: Array<Array<{ text?: string; url?: string }>> } };
  const buttons = telegramBody.reply_markup?.inline_keyboard?.flat() || [];
  const pickupButton = buttons.find((button) => button.text === '取餐导航');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(String(telegramBody.text || ''), /订单号：260415016/);
  assert.match(String(telegramBody.text || ''), /店铺：Ruma Sushi/);
  assert.doesNotMatch(String(telegramBody.text || ''), /店铺：店铺/);
  assert.equal(String(pickupButton?.url || ''), 'https://www.google.com/maps/search/?api=1&query=Bulevar%201');
});

test('manual assign never falls back to internal order id when fetched order lacks orderNo', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
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
            id: '697',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            restaurantName: 'Ruma Sushi',
            restaurantAddress: 'Bulevar 1',
            tableInfo: 'ruma1',
            totalAmount: 611,
            userPhone: '0613083888',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/697/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, message_id: 7793 });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId: '697',
      riderId: '202',
      shopSlug: 'shop-a',
      pickupEtaMinutes: 10,
    }),
  });

  const response = await handleAdminRiderAssign({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  const telegramBody = JSON.parse(String(telegramCall?.body || '{}')) as { text?: string };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.doesNotMatch(String(telegramBody.text || ''), /订单号：697/);
  assert.match(String(telegramBody.text || ''), /店铺：Ruma Sushi/);
});

test('publish dispatch telegramMessageRef 回写前会重读最新 remarks 并保留并发新增内容', async (t) => {
  useTestEnv(t);
  const latestConcurrentRemarks = JSON.stringify([
    'note:keep-me',
    'dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}',
  ]);

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
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const remarksCalls = calls.filter((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const finalRemarksCall = remarksCalls.at(-1);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(remarksCalls.length, 2);
  assert.ok(finalRemarksCall);
  assert.equal(readRemarksPayload(finalRemarksCall).orderId, '904');
  assert.match(JSON.stringify(readRemarksPayload(finalRemarksCall).remarks), /note:keep-me/);
  assert.deepEqual(readDispatchMetaFromRemarksPayload(finalRemarksCall).telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
  assert.equal(calls.some((call) => call.url.endsWith('/api/admin/orders') && call.method === 'GET'), true);
});

test('manual assign 仅 remarks 回写失败时仍返回 success 和 warning', async (t) => {
  useTestEnv(t);
  let remarksWriteCount = 0;

  const calls = useMockFetch(t, async (request) => {
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
  };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.ok(telegramCall);
  assert.equal(telegramCall.url, 'https://example.com/api/telegram/send');
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(remarksWriteCount, 1);
  assert.deepEqual(body.warning, {
    code: 'telegram_message_ref_persist_failed',
    upstream_status: 500,
    upstream_body: '{"success":false,"error":"db_busy"}',
  });
});

test('manual assign telegram 失败时仅返回最小错误字段', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
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

    if (url.pathname === '/api/admin/orders/906/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: false, error: 'telegram_down' }, 500);
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
    telegram_notification?: Record<string, unknown>;
  };

  assert.equal(calls.some((call) => call.url.endsWith('/api/telegram/send')), true);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.telegram_notification, {
    success: false,
    error: '{"success":false,"error":"telegram_down"}',
  });
});

test('manual assign latest remarks 重读失败时不得覆盖 remarks 且返回 warning', async (t) => {
  useTestEnv(t);
  let orderReadCount = 0;
  let remarksWriteCount = 0;

  const calls = useMockFetch(t, async (request) => {
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
  };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.ok(telegramCall);
  assert.equal(telegramCall.url, 'https://example.com/api/telegram/send');
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(orderReadCount, 2);
  assert.equal(remarksWriteCount, 0);
  assert.deepEqual(body.warning, {
    code: 'telegram_message_ref_persist_failed',
  });
});

test('republish_on_timeout 非 awaiting_courier 时也要通过 telegram_dispatch.skippedReason 暴露跳过原因', async (t) => {
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
  const body = JSON.parse(await response.text()) as {
    success?: boolean;
    telegram_dispatch?: { skippedReason?: string };
  };
  const remarksCall = calls.find((call) => call.url.endsWith('/api/admin/orders/remarks'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.telegram_dispatch?.skippedReason, 'order_status_changed');
  assert.equal(remarksCall, undefined);
  assert.equal(calls.some((call) => call.url.endsWith('/api/telegram/send')), false);
});

