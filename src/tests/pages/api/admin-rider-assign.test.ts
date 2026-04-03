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
      assert.equal(body.pickupEtaMinutes, 15);
      assert.equal(body.pickup_eta_minutes, 15);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3000/api/telegram/send') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'manual_assign', orderId: '470', riderId: '7', shopSlug: 'demo-shop', pickupEtaMinutes: 15 }),
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
      assert.equal(body.pickupEtaMinutes, 20);
      assert.equal(body.pickup_eta_minutes, 20);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3000/api/telegram/send') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'auto_assign', orderId: '471', shopSlug: 'demo-shop', lastAssignedRiderId: '7', pickupEtaMinutes: 20 }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('returns invalid_action for unsupported action values', async () => {
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
      body: JSON.stringify({ action: 'bad_action', orderId: '472', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'invalid_action',
  });
});

test('preserves riders upstream failure semantics instead of masking as no_available_riders', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({ success: false, error: 'admin_auth_required' }), {
        status: 401,
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

  assert.equal(response.status, 401);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'admin_auth_required');
  assert.equal(payload.upstream_status, 401);
  assert.equal(payload.upstream_body, '{"success":false,"error":"admin_auth_required"}');
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
      body: JSON.stringify({ action: 'auto_assign', orderId: '473', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'no_available_riders',
  });
});

test('manual_assign resolves shopSlug from orders API when request body misses shopSlug', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/admin/orders/474/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/admin/orders') {
      return new Response(JSON.stringify([
        { id: 474, shopSlug: 'demo-shop' },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3000/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'manual_assign', orderId: '474', riderId: '9' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramBody?.shopSlug, 'demo-shop');
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 9,
      name: '骑手C',
      phone: '063',
    },
  });
});

test('keeps assignment successful when telegram notification fails', async () => {
  let telegramCalled = false;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/admin/orders/474/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3000/api/telegram/send') {
      telegramCalled = true;
      throw new Error('telegram unavailable');
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'manual_assign', orderId: '474', riderId: '9', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(telegramCalled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 9,
      name: '骑手C',
      phone: '063',
    },
    telegram_notification: {
      success: false,
      error: 'telegram unavailable',
    },
  });
});

test('manual_assign 调用本地 telegram send 时透传 cookie 与 authorization', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3030/api/admin/orders/475/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3000/api/telegram/send') {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('cookie'), 'master_token=master-cookie-1; admin_token=admin-cookie-1');
      assert.equal(headers.get('authorization'), 'Bearer inline-auth-token');
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'master_token=master-cookie-1; admin_token=admin-cookie-1',
        authorization: 'Bearer inline-auth-token',
      },
      body: JSON.stringify({ action: 'manual_assign', orderId: '475', riderId: '9', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});
