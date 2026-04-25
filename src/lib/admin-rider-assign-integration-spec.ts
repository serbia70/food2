import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { POST as handleAdminRiderAssign } from '../pages/api/admin/rider-assign.ts';

const TEST_API_BASE = 'https://api.example.com';

type FetchHandler = (request: Request) => Promise<Response>;

type MockCall = {
  url: string;
  method: string;
  body: string;
  headers: Headers;
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

function createCookies(): { get: () => undefined } {
  return { get: () => undefined };
}

test('manual assign latest remarks 重读失败时不得覆盖 remarks 且不阻断主流程', async (t) => {
  useTestEnv(t);
  let orderReadCount = 0;

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
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/admin/orders/906/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9988 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '906',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(orderReadCount, 2);
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/906/status'));
});

test('manual assign 兼容上游顶层 order 包装的订单快照', async (t) => {
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
        order: {
          id: '911',
          orderNo: '260415911',
          remarksJson: JSON.stringify(['note:keep-me']),
          shopSlug: 'shop-a',
          shopName: 'Shop A',
          tableInfo: 'Address',
          totalAmount: 100,
          userPhone: '381600000000',
          status: 'awaiting_courier',
        },
      });
    }

    if (url.pathname === '/api/admin/orders/911/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9992 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '911',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const body = JSON.parse(await response.text()) as { success: boolean; error?: string };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/911/status'));
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});
