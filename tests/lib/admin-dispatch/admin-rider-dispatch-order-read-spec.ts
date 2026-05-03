import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import {
  findAdminOrderRow,
  readAdminOrderById,
} from '../../../src/lib/rider-route-admin-orders.ts';

type FetchHandler = (request: Request) => Promise<Response>;

interface MockFetchCall {
  url: string;
  method: string;
  body: string;
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
  return {
    get: () => undefined,
  };
}

test('findAdminOrderRow 兼容 array / orders / order / data.order / data.orders 形状并按规范化 id 匹配', () => {
  const order = {
    id: '901',
    remarksJson: '[]',
  };

  assert.deepEqual(findAdminOrderRow([order], '901'), order);
  assert.deepEqual(findAdminOrderRow({ orders: [order] }, '901'), order);
  assert.deepEqual(findAdminOrderRow({ order }, '901'), order);
  assert.deepEqual(findAdminOrderRow({ data: { order } }, '901'), order);
  assert.deepEqual(findAdminOrderRow({ data: { orders: [order] } }, '901'), order);
  assert.equal(findAdminOrderRow({ data: { orders: [order] } }, '  '), null);
});

test('readAdminOrderById treats top-level success:false on HTTP 200 as order fetch failure with 502', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ success: false, error: 'orders_payload_failed' }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminOrderById({
    request: new Request('https://example.com/api/admin/rider-assign'),
    cookies: createCookies() as never,
    apiBaseUrl: 'https://example.com',
    orderId: '901',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 502);
    assert.match(result.upstreamBody, /orders_payload_failed/);
  }
  assert.equal(calls.length, 1);
});

test('readAdminOrderById treats nested data.success:false on HTTP 200 as order fetch failure with 502', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ data: { success: false, error: 'nested_failed' } }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminOrderById({
    request: new Request('https://example.com/api/admin/rider-dispatch'),
    cookies: createCookies() as never,
    apiBaseUrl: 'https://example.com',
    orderId: '901',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 502);
    assert.match(result.upstreamBody, /nested_failed/);
  }
  assert.equal(calls.length, 1);
});

test('readAdminOrderById treats nested data.ok:false on HTTP 200 as order fetch failure with 502', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ data: { ok: false, error: 'nested_failed' } }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminOrderById({
    request: new Request('https://example.com/api/admin/rider-dispatch'),
    cookies: createCookies() as never,
    apiBaseUrl: 'https://example.com',
    orderId: '901',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 502);
    assert.match(result.upstreamBody, /nested_failed/);
  }
  assert.equal(calls.length, 1);
});

test('readAdminOrderById accepts top-level order carrier shape', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ order: { id: '901', remarksJson: '["a"]' } }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminOrderById({
    request: new Request('https://example.com/api/admin/rider-dispatch'),
    cookies: createCookies() as never,
    apiBaseUrl: 'https://example.com',
    orderId: '901',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.order?.id, '901');
    assert.equal(result.remarksJson, '["a"]');
  }
  assert.equal(calls.length, 1);
});

test('readAdminOrderById accepts top-level orders carrier shape', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ orders: [{ id: '901', remarksJson: '["b"]' }] }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminOrderById({
    request: new Request('https://example.com/api/admin/rider-dispatch'),
    cookies: createCookies() as never,
    apiBaseUrl: 'https://example.com',
    orderId: '901',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.order?.id, '901');
    assert.equal(result.remarksJson, '["b"]');
  }
  assert.equal(calls.length, 1);
});

test('readAdminOrderById accepts nested data.order carrier shape', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ data: { order: { id: '901', remarksJson: '["c"]' } } }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminOrderById({
    request: new Request('https://example.com/api/admin/rider-dispatch'),
    cookies: createCookies() as never,
    apiBaseUrl: 'https://example.com',
    orderId: '901',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.order?.id, '901');
    assert.equal(result.remarksJson, '["c"]');
  }
  assert.equal(calls.length, 1);
});

test('readAdminOrderById accepts nested data.orders carrier shape', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ data: { orders: [{ id: '901', remarksJson: '["d"]' }] } }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminOrderById({
    request: new Request('https://example.com/api/admin/rider-dispatch'),
    cookies: createCookies() as never,
    apiBaseUrl: 'https://example.com',
    orderId: '901',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.order?.id, '901');
    assert.equal(result.remarksJson, '["d"]');
  }
  assert.equal(calls.length, 1);
});

