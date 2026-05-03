import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { POST as handleAdminRiderDispatch } from '../../../src/pages/api/admin/rider-dispatch.ts';

type FetchHandler = (request: Request) => Promise<Response>;

type MockCall = {
  url: string;
  method: string;
  body: string;
};

function useTestEnv(t: TestContext): void {
  const originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.PUBLIC_API_URL = 'https://api.example.com';
  t.after(() => {
    if (typeof originalApiUrl === 'string') {
      process.env.PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.PUBLIC_API_URL;
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

function createTimeoutMetaJson() {
  return JSON.stringify([`dispatch_meta:${JSON.stringify({
    lastRiderDecision: {
      action: 'accepted',
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
  })}`]);
}

test('republish_on_timeout 骑手读取 HTTP 非 2xx 失败时直接返回上游错误而不是 no_next_rider', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: false, error: 'riders_backend_unavailable' }, 502);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '911',
        action: 'republish_on_timeout',
        remarksJson: createTimeoutMetaJson(),
        status: 'awaiting_courier',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_backend_unavailable');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('republish_on_timeout 骑手读取 HTTP 200 success:false 时直接返回上游错误而不是 no_next_rider', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: false, error: 'riders_payload_failed' }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '914',
        action: 'republish_on_timeout',
        remarksJson: createTimeoutMetaJson(),
        status: 'awaiting_courier',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_payload_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('republish_on_timeout 真正空骑手列表时保持 no_next_rider 语义', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: true, riders: [] });
    }
    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '915',
        action: 'republish_on_timeout',
        remarksJson: createTimeoutMetaJson(),
        status: 'awaiting_courier',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, telegram_dispatch } = JSON.parse(await response.text()) as {
    success: boolean;
    telegram_dispatch: { skippedReason: 'no_next_rider' };
  };

  assert.equal(response.status, 200);
  assert.equal(success, true);
  assert.equal(telegram_dispatch.skippedReason, 'no_next_rider');
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('republish_on_timeout 非 awaiting_courier 时通过 telegram_dispatch.skippedReason 暴露跳过原因', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '901',
        action: 'republish_on_timeout',
        remarksJson: createTimeoutMetaJson(),
        status: 'delivering',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, telegram_dispatch } = JSON.parse(await response.text()) as {
    success: boolean;
    telegram_dispatch: { skippedReason: 'order_status_changed' };
  };

  assert.equal(response.status, 200);
  assert.equal(success, true);
  assert.equal(telegram_dispatch.skippedReason, 'order_status_changed');
  assert.equal(calls.length, 0);
});

