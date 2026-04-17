import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { PUT as handleAdminOrderStatus } from '../pages/api/admin/orders/[id]/status.ts';
import { API_BASE_URL } from '../config.ts';

type FetchHandler = (request: Request) => Promise<Response>;

interface MockFetchCall {
  url: string;
  method: string;
  body: string;
  headers: Headers;
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

test('admin order status route returns 404 when id is missing', async (t) => {
  const calls = useMockFetch(t, async () => jsonResponse({ success: true }));

  const response = await handleAdminOrderStatus({
    request: new Request('https://example.com/api/admin/orders//status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'picked_up' }),
    }),
    params: {},
    cookies: { get: () => undefined },
  } as never);

  assert.equal(response.status, 404);
  assert.equal(calls.length, 0);
});

test('admin order status route proxies PUT body unchanged and uses cookie auth', async (t) => {
  const calls = useMockFetch(t, async () => jsonResponse({ success: true }));
  const rawBody = JSON.stringify({
    status: 'picked_up',
    pickupEtaMinutes: 10,
    remarksJson: '["dispatch_meta:{}"]',
  });

  const response = await handleAdminOrderStatus({
    request: new Request('https://example.com/api/admin/orders/101/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    }),
    params: { id: '101' },
    cookies: {
      get: (name: string) => name === 'admin_token' ? { value: 'cookie-token' } : undefined,
    },
  } as never);

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `${API_BASE_URL}/api/admin/orders/101/status`);
  assert.equal(calls[0]?.method, 'PUT');
  assert.equal(calls[0]?.body, rawBody);
  assert.equal(calls[0]?.headers.get('authorization'), 'Bearer cookie-token');
});
