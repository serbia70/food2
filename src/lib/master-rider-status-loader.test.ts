import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { loadMasterRiderStatusData } from './master-rider-status-loader.ts';

type FetchHandler = (request: Request) => Promise<Response>;

type MockCall = {
  url: string;
  method: string;
  body: string;
  cookie: string;
};

function useMockFetch(t: TestContext, handler: FetchHandler): MockCall[] {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      body: await request.clone().text(),
      cookie: request.headers.get('cookie') || '',
    });
    return handler(request);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return calls;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

test('loadMasterRiderStatusData uses POST impersonate and cookie auth for riders proxy', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const pathname = new URL(request.url).pathname;

    if (pathname === '/api/master/impersonate-shop') {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('authorization'), 'Bearer master-secret');
      assert.equal(request.headers.get('cookie'), 'master_token=master-secret; theme=dark');
      assert.deepEqual(await request.json(), { id: 11 });
      return jsonResponse(
        { ok: true, data: { slug: 'shop-11', impersonated: true } },
        { headers: { 'Set-Cookie': 'admin_token=admin-secret-11; Path=/; HttpOnly; Max-Age=7200' } },
      );
    }

    if (pathname === '/api/admin/riders') {
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('authorization'), null);
      const cookie = request.headers.get('cookie') || '';
      assert.match(cookie, /(?:^|;\s*)master_token=master-secret(?:;|$)/);
      assert.match(cookie, /(?:^|;\s*)theme=dark(?:;|$)/);
      assert.match(cookie, /(?:^|;\s*)admin_token=admin-secret-11(?:;|$)/);
      return jsonResponse({
        success: true,
        riders: [
          { id: 1, name: 'Rider A', phone: '111', status: 'available' },
          { id: 2, name: 'Rider B', phone: '222', status: 'busy' },
        ],
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await loadMasterRiderStatusData({
    requestUrl: new URL('https://example.com/master?tab=riders'),
    authHeader: 'Bearer master-secret',
    cookieHeader: 'master_token=master-secret; theme=dark',
    shopRows: [{ id: 11, name: 'Shop 11' }],
  });

  assert.equal(result.error, '');
  assert.equal(result.payload.summary.total_riders, 2);
  assert.equal(result.payload.summary.available_riders, 1);
  assert.equal(result.payload.summary.busy_riders, 1);
  assert.equal(result.payload.groups.available[0]?.name, 'Rider A');
  assert.equal(result.payload.groups.busy[0]?.name, 'Rider B');
  assert.deepEqual(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`), ['POST /api/master/impersonate-shop', 'GET /api/admin/riders']);
});

test('loadMasterRiderStatusData keeps cross-shop dedupe with cookie-based impersonation', async (t) => {
  useMockFetch(t, async (request) => {
    const pathname = new URL(request.url).pathname;

    if (pathname === '/api/master/impersonate-shop') {
      const { id } = await request.json() as { id?: number };
      assert.equal(request.method, 'POST');
      return jsonResponse(
        { ok: true, data: { slug: `shop-${id}`, impersonated: true } },
        { headers: { 'Set-Cookie': `admin_token=admin-secret-${id}; Path=/; HttpOnly; Max-Age=7200` } },
      );
    }

    if (pathname === '/api/admin/riders') {
      const cookie = request.headers.get('cookie') || '';
      if (cookie.includes('admin_token=admin-secret-11')) {
        return jsonResponse({
          success: true,
          riders: [
            { id: 1, name: 'Rider A', phone: '111', status: 'available' },
            { id: 2, name: 'Rider B', phone: '222', status: 'busy' },
          ],
        });
      }
      if (cookie.includes('admin_token=admin-secret-12')) {
        return jsonResponse({
          success: true,
          riders: [
            { id: 1, name: 'Rider A', phone: '111', status: 'available' },
            { name: 'Rider C', phone: '333', status: 'offline' },
          ],
        });
      }
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await loadMasterRiderStatusData({
    requestUrl: new URL('https://example.com/master?tab=riders'),
    authHeader: 'Bearer master-secret',
    cookieHeader: 'master_token=master-secret',
    shopRows: [{ id: 11, name: 'Shop 11' }, { id: 12, name: 'Shop 12' }],
  });

  assert.equal(result.error, '');
  assert.deepEqual(result.payload.summary, {
    total_riders: 3,
    available_riders: 1,
    busy_riders: 1,
    offline_riders: 1,
    active_order_count: 0,
    cod_order_count: 0,
    delivery_fee_total: 0,
    cod_amount_total: 0,
  });
  assert.deepEqual(result.payload.groups.available.map((rider) => rider.name), ['Rider A']);
  assert.deepEqual(result.payload.groups.busy.map((rider) => rider.name), ['Rider B']);
  assert.deepEqual(result.payload.groups.offline.map((rider) => rider.name), ['Rider C']);
});
