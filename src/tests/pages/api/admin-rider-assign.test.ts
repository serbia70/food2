import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'http://localhost:3030';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/admin/rider-assign.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createCookies() {
  return {
    get(name: string) {
      if (name === 'admin_token') return { value: 'test-token' };
      return undefined;
    },
  };
}

test('manual_assign updates order to delivering for selected available rider', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/admin/orders/470/status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.status, 'delivering');
      assert.equal(body.courierName, '骑手A');
      assert.equal(body.courierPhone, '061');
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/telegram/send') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'manual_assign', orderId: '470', riderId: '7', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.ok(calls.includes('http://localhost:3030/api/admin/orders/470/status'));
});

test('auto_assign picks next available rider when cursor is present', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
          { id: 8, name: '骑手B', phone: '062', status: 'available', telegramChatId: 'tg-8' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/admin/orders/471/status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.courierName, '骑手B');
      assert.equal(body.courierPhone, '062');
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/telegram/send') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'auto_assign', orderId: '471', shopSlug: 'demo-shop', lastAssignedRiderId: '7' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('returns no_available_riders when no available rider exists', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({ riders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'auto_assign', orderId: '472', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'no_available_riders',
  });
});
