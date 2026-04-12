import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { POST as handleAdminRiderDispatch } from '../pages/api/admin/rider-dispatch.ts';
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
  process.env.PUBLIC_API_URL = TEST_API_BASE;
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
