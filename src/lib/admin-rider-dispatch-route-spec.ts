import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { POST as handleAdminRiderDispatch } from '../pages/api/admin/rider-dispatch.ts';
import { POST as handleAdminRiderAssign } from '../pages/api/admin/rider-assign.ts';
import { fetchAdminOrderDetails, findAdminOrderRow, readAdminOrderSummaryFromRow, readAdminOrderShopSlug } from './admin-telegram-dispatch.ts';
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

function readCallJson(call: { body: string } | undefined): Record<string, unknown> {
  assert.ok(call, 'expected mocked fetch call');
  return JSON.parse(call.body) as Record<string, unknown>;
}

function readTelegramText(call: { body: string } | undefined): string {
  return String(readCallJson(call).text || '');
}

function readTelegramInlineKeyboard(call: { body: string } | undefined): Array<Array<{ text?: string; url?: string; callback_data?: string }>> {
  const replyMarkup = readCallJson(call).reply_markup as {
    inline_keyboard?: Array<Array<{ text?: string; url?: string; callback_data?: string } | null> | null>;
  } | undefined;
  if (!Array.isArray(replyMarkup?.inline_keyboard)) return [];
  return replyMarkup.inline_keyboard
    .filter((row): row is Array<{ text?: string; url?: string; callback_data?: string } | null> => Array.isArray(row))
    .map((row) => row.filter((button): button is { text?: string; url?: string; callback_data?: string } => {
      if (!button || typeof button !== 'object') return false;
      return typeof button.text === 'string'
        && (typeof button.url === 'string' || typeof button.callback_data === 'string');
    }))
    .filter((row) => row.length > 0);
}

test('readTelegramInlineKeyboard 会丢弃 admin dispatch 空按钮行', () => {
  const inlineKeyboard = readTelegramInlineKeyboard({
    body: JSON.stringify({
      reply_markup: {
        inline_keyboard: [
          [null],
          [{ text: '取餐导航', url: 'https://maps.example.com/shop-a' }],
        ],
      },
    }),
  });

  assert.deepEqual(inlineKeyboard, [
    [{ text: '取餐导航', url: 'https://maps.example.com/shop-a' }],
  ]);
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test('fetchAdminOrderDetails reads order summary and shop slug from admin orders payload', async (t) => {
  useTestEnv(t);
  const payload = {
    success: true,
    orders: [
      {
        id: '931',
        orderNo: '260415031',
        remarksJson: JSON.stringify(['note:keep-me']),
        shopSlug: 'shop-a',
        restaurantName: 'Ruma Sushi',
        restaurantAddress: 'Bulevar 1',
        tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
        totalAmount: 611,
        userPhone: '0613083888',
        itemsJson: JSON.stringify([{ name: 'Burger', quantity: 2 }]),
        status: 'awaiting_courier',
      },
    ],
  };

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse(payload);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const row = findAdminOrderRow(payload, '931');
  assert.ok(row);
  assert.equal(readAdminOrderShopSlug(payload, '931'), 'shop-a');
  assert.deepEqual(readAdminOrderSummaryFromRow(row, '931'), {
    orderNo: '260415031',
    shopName: 'Ruma Sushi',
    shopAddress: 'Bulevar 1',
    shopMapUrl: 'https://www.google.com/maps/search/?api=1&query=Bulevar%201',
    address: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
    deliveryMapUrl: 'https://www.google.com/maps/search/?api=1&query=ruma1',
    phone: '0613083888',
    totalAmount: 611,
    scheduledFor: '',
    itemSummary: ['Burger x2'],
  });

  const result = await fetchAdminOrderDetails({
    request: new Request('https://example.com/api/admin/rider-assign', { method: 'POST' }),
    cookies: createCookies() as never,
    orderId: '931',
  });

  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.shopSlug, 'shop-a');
  assert.equal(result.remarksJson, JSON.stringify(['note:keep-me']));
  assert.deepEqual(result.orderSummary, {
    orderNo: '260415031',
    shopName: 'Ruma Sushi',
    shopAddress: 'Bulevar 1',
    shopMapUrl: 'https://www.google.com/maps/search/?api=1&query=Bulevar%201',
    address: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
    deliveryMapUrl: 'https://www.google.com/maps/search/?api=1&query=ruma1',
    phone: '0613083888',
    totalAmount: 611,
    scheduledFor: '',
    itemSummary: ['Burger x2'],
  });
});

test('fetchAdminOrderDetails keeps raw row data for shared route hydration', async (t) => {
  useTestEnv(t);
  const payload = {
    success: true,
    data: {
      orders: [
        {
          id: '932',
          orderNo: '260415032',
          remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202"}']),
          shopSlug: 'shop-b',
          restaurantName: 'Tokyo Roll',
          restaurantAddress: 'Kralja Petra 2',
          tableInfo: '李四, 0613000000, novi sad',
          totalAmount: 712,
          userPhone: '0613000000',
          pickupEtaMinutes: 18,
          status: 'awaiting_courier',
          itemsJson: JSON.stringify({
            a: { name: 'Roll', quantity: 2 },
            b: { name: 'Soup', qty: 1 },
          }),
        },
      ],
    },
  };

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse(payload);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await fetchAdminOrderDetails({
    request: new Request('https://example.com/api/admin/rider-dispatch', { method: 'POST' }),
    cookies: createCookies() as never,
    orderId: '932',
  });

  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.shopSlug, 'shop-b');
  assert.equal(result.remarksJson, JSON.stringify(['dispatch_meta:{"currentRiderId":"202"}']));
  assert.deepEqual(result.orderSummary, {
    orderNo: '260415032',
    shopName: 'Tokyo Roll',
    shopAddress: 'Kralja Petra 2',
    shopMapUrl: 'https://www.google.com/maps/search/?api=1&query=Kralja%20Petra%202',
    address: '李四, 0613000000, novi sad',
    deliveryMapUrl: 'https://www.google.com/maps/search/?api=1&query=novi%20sad',
    phone: '0613000000',
    totalAmount: 712,
    scheduledFor: '',
    itemSummary: ['Roll x2', 'Soup x1'],
  });
  assert.equal(result.orderRow?.id, '932');
});

test('fetchAdminOrderDetails falls back to restaurantId when shop slug fields are missing', async (t) => {
  useTestEnv(t);
  const payload = {
    success: true,
    orders: [
      {
        id: '933',
        orderNo: '260415033',
        remarksJson: JSON.stringify(['note:shop-id-fallback']),
        restaurantId: 103,
        restaurantName: 'Fallback Shop',
        restaurantAddress: 'Bulevar 3',
        tableInfo: '王五, 0613999999, zemun',
        totalAmount: 500,
        userPhone: '0613999999',
        itemsJson: JSON.stringify([{ name: 'Tea', qty: 1 }]),
        status: 'awaiting_courier',
      },
    ],
  };

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse(payload);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await fetchAdminOrderDetails({
    request: new Request('https://example.com/api/admin/rider-assign', { method: 'POST' }),
    cookies: createCookies() as never,
    orderId: '933',
  });

  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.shopSlug, '103');
  assert.deepEqual(result.orderSummary?.itemSummary, ['Tea x1']);
});

test('fetchAdminOrderDetails keeps upstream status and body when admin orders payload is unreadable', async (t) => {
  useTestEnv(t);

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return new Response('{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await fetchAdminOrderDetails({
    request: new Request('https://example.com/api/admin/rider-dispatch', { method: 'POST' }),
    cookies: createCookies() as never,
    orderId: '932',
  });

  assert.equal(result.ok, false);
  assert.equal(result.found, false);
  assert.equal(result.orderRow, null);
  assert.equal((result as { upstreamStatus?: number }).upstreamStatus, 200);
  assert.equal((result as { upstreamBody?: string }).upstreamBody, '{');
});

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
  const telegramText = readTelegramText(telegramCall);
  const buttons = readTelegramInlineKeyboard(telegramCall).flat();
  const pickupButton = buttons.find((button) => button.text === '取餐导航');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(telegramText, /Shop A/);
  assert.equal(String(pickupButton?.url || ''), 'https://maps.example.com/shop-a');
});

test('publish dispatch telegram includes item summary lines like manual assign', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/922/status') {
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
      orderId: '922',
      action: 'publish',
      shopSlug: 'shop-a',
      shopName: 'Shop A',
      tableInfo: 'Address',
      totalAmount: 100,
      userPhone: '381600000000',
      pickupEtaMinutes: 12,
      status: 'awaiting_courier',
      itemsJson: JSON.stringify([
        { name: 'Burger', quantity: 2 },
        { name: 'Cola', quantity: 1 },
      ]),
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  assert.ok(telegramCall);
  const telegramText = readTelegramText(telegramCall);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(telegramText, /^菜品：/m);
  assert.match(telegramText, /• Burger x2/);
  assert.match(telegramText, /• Cola x1/);
});

test('publish dispatch returns shared upstream error detail when admin orders hydrate payload is unreadable', async (t) => {
  useTestEnv(t);

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return new Response('{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '923',
      action: 'publish',
      status: 'awaiting_courier',
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as {
    success?: boolean;
    error?: string;
    upstream_status?: number;
    upstream_body?: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_fetch_failed');
  assert.equal(body.upstream_status, 200);
  assert.equal(body.upstream_body, '{');
});

test('publish dispatch keeps top-level restaurant fields without degrading to placeholder shop data', async (t) => {
  useTestEnv(t);
  let orderReadCount = 0;
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/925/status') {
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
      orderReadCount += 1;
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '925',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7795 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '925',
      action: 'publish',
      shopSlug: 'shop-a',
      restaurantName: 'Body Sushi',
      restaurantAddress: 'Bulevar 9',
      deliveryAddress: 'Body Address',
      totalAmount: 222,
      userPhone: '381600000000',
      pickupEtaMinutes: 12,
      itemsJson: JSON.stringify([{ name: 'Burger', quantity: 1 }]),
      status: 'awaiting_courier',
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  const telegramText = readTelegramText(telegramCall);
  const buttons = readTelegramInlineKeyboard(telegramCall).flat();
  const pickupButton = buttons.find((button) => button.text === '取餐导航');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(orderReadCount, 1);
  assert.match(telegramText, /Body Sushi有新单/);
  assert.doesNotMatch(telegramText, /店铺有新单/);
  assert.equal(String(pickupButton?.url || ''), 'https://www.google.com/maps/search/?api=1&query=Bulevar%209');
});

test('publish dispatch uses fetched order summary when body snapshot misses restaurant fields', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/923/status') {
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
            id: '923',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            restaurantName: 'Ruma Sushi',
            restaurantAddress: 'Bulevar 1',
            tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
            totalAmount: 100,
            userPhone: '381600000000',
            itemsJson: JSON.stringify([{ name: 'Burger', quantity: 1 }]),
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7793 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '923',
      action: 'publish',
      shopSlug: 'shop-a',
      tableInfo: 'Address only from body',
      totalAmount: 100,
      userPhone: '381600000000',
      pickupEtaMinutes: 12,
      status: 'awaiting_courier',
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  const telegramText = readTelegramText(telegramCall);
  const buttons = readTelegramInlineKeyboard(telegramCall).flat();
  const pickupButton = buttons.find((button) => button.text === '取餐导航');
  const deliveryButton = buttons.find((button) => button.text === '送餐导航');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(telegramText, /Ruma Sushi有新单/);
  assert.doesNotMatch(telegramText, /店铺有新单/);
  assert.match(telegramText, /• Burger x1/);
  assert.equal(String(pickupButton?.url || ''), 'https://www.google.com/maps/search/?api=1&query=Bulevar%201');
  assert.equal(String(deliveryButton?.url || ''), 'https://www.google.com/maps/search/?api=1&query=ruma1');
});

test('publish dispatch hydrates upstream snapshot when body keeps shopName but misses map and items', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/924/status') {
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
            id: '924',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            restaurantName: 'Ruma Sushi',
            restaurantAddress: 'Bulevar 1',
            tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
            totalAmount: 100,
            userPhone: '381600000000',
            itemsJson: JSON.stringify([{ name: 'Burger', quantity: 1 }]),
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7794 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '924',
      action: 'publish',
      shopSlug: 'shop-a',
      shopName: 'Ruma Sushi',
      tableInfo: 'Address only from body',
      totalAmount: 100,
      userPhone: '381600000000',
      pickupEtaMinutes: 12,
      status: 'awaiting_courier',
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  const telegramText = readTelegramText(telegramCall);
  const buttons = readTelegramInlineKeyboard(telegramCall).flat();
  const pickupButton = buttons.find((button) => button.text === '取餐导航');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(telegramText, /Ruma Sushi有新单/);
  assert.match(telegramText, /• Burger x1/);
  assert.equal(String(pickupButton?.url || ''), 'https://www.google.com/maps/search/?api=1&query=Bulevar%201');
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

test('publish dispatch accepts top-level telegram message_id when persisting telegramMessageRef', async (t) => {
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
  const body = JSON.parse(await response.text()) as { success?: boolean; order?: { remarksJson?: string } };
  const meta = readDispatchMetaFromRemarks(body.order?.remarksJson || '');
  const remarksCalls = calls.filter((call) => call.url.endsWith('/api/admin/orders/remarks'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(meta.telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7789,
  });
  assert.ok(remarksCalls.length >= 1);
});

test('publish dispatch retries telegram send without reply_markup after html 502', async (t) => {
  useTestEnv(t);
  let telegramSendCount = 0;

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/917/status') {
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
            id: '917',
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
      telegramSendCount += 1;
      if (telegramSendCount === 1) {
        return new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return jsonResponse({ success: true, result: { message_id: 7793 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '917',
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
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));
  const firstTelegramPayload = readCallJson(telegramCalls[0]);
  const secondTelegramPayload = readCallJson(telegramCalls[1]);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(telegramSendCount, 2);
  assert.ok(firstTelegramPayload.reply_markup);
  assert.equal('reply_markup' in secondTelegramPayload, false);
  assert.deepEqual(meta.telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7793,
  });
});

test('manual assign accepts top-level telegram message_id when persisting telegramMessageRef', async (t) => {
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
  const body = JSON.parse(await response.text()) as { success?: boolean; order?: { remarksJson?: string } };
  const meta = readDispatchMetaFromRemarks(body.order?.remarksJson || '');
  const remarksCalls = calls.filter((call) => call.url.endsWith('/api/admin/orders/remarks'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(meta.telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7790,
  });
  assert.ok(remarksCalls.length >= 1);
});

test('manual assign 会并发读取 riders 和订单详情', async (t) => {
  useTestEnv(t);
  const ridersStarted = createDeferred<void>();
  const orderStarted = createDeferred<void>();
  let ridersInFlight = false;
  let orderInFlight = false;
  let overlapped = false;

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      ridersInFlight = true;
      ridersStarted.resolve();
      await orderStarted.promise;
      if (orderInFlight) overlapped = true;
      ridersInFlight = false;
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      orderInFlight = true;
      orderStarted.resolve();
      await ridersStarted.promise;
      if (ridersInFlight) overlapped = true;
      orderInFlight = false;
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

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(overlapped, true);
});

test('manual assign falls back to body summary when fetched summary would degrade to placeholder fields', async (t) => {
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
            id: '910',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/910/status') {
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
      orderId: '910',
      riderId: '202',
      shopSlug: 'shop-a',
      pickupEtaMinutes: 12,
      orderSummary: {
        orderNo: '910',
        shopName: 'Body Shop',
        deliveryAddress: 'Body Address',
        userPhone: '381600000000',
        totalAmount: 321,
        items: [{ name: 'Burger', quantity: 1 }],
      },
    }),
  });

  const response = await handleAdminRiderAssign({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  const telegramText = readTelegramText(telegramCall);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(telegramText, /店铺：Body Shop/);
  assert.match(telegramText, /地址：Body Address/);
  assert.match(telegramText, /电话：381600000000/);
  assert.match(telegramText, /金额：321 RSD/);
  assert.doesNotMatch(telegramText, /店铺：店铺/);
  assert.doesNotMatch(telegramText, /地址：未提供地址/);
  assert.doesNotMatch(telegramText, /电话：-/);
  assert.doesNotMatch(telegramText, /金额：0 RSD/);
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
  const telegramText = readTelegramText(telegramCall);
  const buttons = readTelegramInlineKeyboard(telegramCall).flat();
  const pickupButton = buttons.find((button) => button.text === '取餐导航');
  const deliveryButton = buttons.find((button) => button.text === '送餐导航');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(telegramText, /店铺：Ruma Sushi/);
  assert.doesNotMatch(telegramText, /店铺：店铺/);
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
  const telegramText = readTelegramText(telegramCall);
  const buttons = readTelegramInlineKeyboard(telegramCall).flat();
  const pickupButton = buttons.find((button) => button.text === '取餐导航');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(telegramText, /订单号：260415016/);
  assert.match(telegramText, /店铺：Ruma Sushi/);
  assert.doesNotMatch(telegramText, /店铺：店铺/);
  assert.equal(String(pickupButton?.url || ''), 'https://www.google.com/maps/search/?api=1&query=Bulevar%201');
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
  const body = JSON.parse(await response.text()) as {
    success?: boolean;
    order?: { remarksJson?: string };
    warning?: { code?: string; upstream_status?: number; upstream_body?: string };
  };
  const finalMeta = readDispatchMetaFromRemarks(body.order?.remarksJson || '');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.warning, undefined);
  assert.equal(remarksBodies.length, 2);
  assert.match(remarksBodies[1] || '', /note:keep-me/);
  assert.deepEqual(finalMeta.telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
  assert.equal(calls.some((call) => call.url.endsWith('/api/admin/orders') && call.method === 'GET'), true);
});

test('remind dispatch accepts snake_case remind fields from master caller', async (t) => {
  useTestEnv(t);
  const statusBodies: Array<Record<string, unknown>> = [];

  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/906/status') {
      statusBodies.push(JSON.parse(await request.text()) as Record<string, unknown>);
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
      return jsonResponse({ success: true, result: { message_id: 7788 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const request = new Request('https://example.com/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: '906',
      action: 'remind',
      shopSlug: 'shop-a',
      shopName: 'Shop A',
      tableInfo: 'Address',
      totalAmount: 100,
      userPhone: '381600000000',
      status: 'awaiting_courier',
      remarksJson: JSON.stringify(['note:keep-me']),
      rider_remind_count: 3,
      rider_last_reminded_at: '2026-04-16T02:00:00.000Z',
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as { success?: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(statusBodies.length, 1);
  assert.equal(statusBodies[0]?.riderRemindCount, 3);
  assert.equal(statusBodies[0]?.riderLastRemindedAt, '2026-04-16T02:00:00.000Z');
});

test('publish dispatch latest remarks 重读失败时沿用共享 warning 语义且不得覆盖 remarks', async (t) => {
  useTestEnv(t);
  let orderReadCount = 0;
  let remarksWriteCount = 0;

  useMockFetch(t, async (request) => {
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
      orderReadCount += 1;
      return new Response('{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      remarksWriteCount += 1;
      return jsonResponse({ success: true });
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
      remarksJson: JSON.stringify(['note:keep-me']),
    }),
  });

  const response = await handleAdminRiderDispatch({ request, cookies: createCookies() } as never);
  const body = JSON.parse(await response.text()) as {
    success?: boolean;
    warning?: { code?: string; upstream_status?: number; upstream_body?: string };
    order?: { remarksJson?: string };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(orderReadCount, 1);
  assert.equal(remarksWriteCount, 1);
  assert.deepEqual(body.warning, {
    code: 'telegram_message_ref_persist_failed',
    upstream_status: 200,
    upstream_body: '{',
  });
  assert.match(String(body.order?.remarksJson || ''), /note:keep-me/);
  assert.doesNotMatch(String(body.order?.remarksJson || ''), /"messageId":7788/);
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
    order?: { remarksJson?: string };
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
  assert.equal(body.order?.remarksJson, JSON.stringify(['note:keep-me']));
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
    order?: { remarksJson?: string };
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
