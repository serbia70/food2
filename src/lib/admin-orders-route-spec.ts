import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { GET as handleAdminOrders } from '../pages/api/admin/orders.ts';
import { API_BASE_URL } from '../config.ts';

type FetchHandler = (request: Request) => Promise<Response>;

interface MockFetchCall {
  url: string;
  method: string;
  headers: Headers;
}

function useMockFetch(t: TestContext, handler: FetchHandler): MockFetchCall[] {
  const calls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
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

test('admin orders route keeps object-shaped itemsJson unchanged and leaves normalization to consumers', async (t) => {
  const originalItemsJson = JSON.stringify({
    '11': { name: '鱼香肉丝', quantity: 2 },
    '12': { name: '米饭' },
  });
  const calls = useMockFetch(t, async () => jsonResponse([
    {
      id: 101,
      itemsJson: originalItemsJson,
    },
  ]));

  const response = await handleAdminOrders({
    request: new Request('https://example.com/api/admin/orders?status=pending', { method: 'GET' }),
    url: new URL('https://example.com/api/admin/orders?status=pending'),
    cookies: { get: () => undefined },
  } as never);
  const body = JSON.parse(await response.text()) as Array<{ itemsJson?: string }>;

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `${API_BASE_URL}/api/admin/orders?status=pending`);
  assert.equal(body[0]?.itemsJson, originalItemsJson);
});

test('admin orders route keeps array-shaped itemsJson unchanged', async (t) => {
  const originalItemsJson = JSON.stringify([
    { name: '可乐', quantity: 1, productId: 9 },
  ]);
  const calls = useMockFetch(t, async () => jsonResponse([
    { id: 102, itemsJson: originalItemsJson },
  ]));

  const response = await handleAdminOrders({
    request: new Request('https://example.com/api/admin/orders', { method: 'GET' }),
    url: new URL('https://example.com/api/admin/orders'),
    cookies: { get: () => undefined },
  } as never);
  const body = JSON.parse(await response.text()) as Array<{ itemsJson?: string }>;

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(body[0]?.itemsJson, originalItemsJson);
});
