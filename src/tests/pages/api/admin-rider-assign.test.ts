import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'https://api.test.local';
process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-callback-secret';

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

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/470/status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.status, 'delivering');
      assert.equal(body.courierName, '骑手A');
      assert.equal(body.courierPhone, '061');
      assert.equal(body.pickupEtaMinutes, 15);
      assert.equal(body.pickup_eta_minutes, 15);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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
  assert.ok(calls.includes('https://api.test.local/api/admin/orders/470/status'));
});

test('manual_assign sends telegram through backend API base url and forwards auth headers', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/470/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      const headers = new Headers(init?.headers);
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
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
      body: JSON.stringify({ action: 'manual_assign', orderId: '470', riderId: '7', shopSlug: 'demo-shop', pickupEtaMinutes: 15 }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(telegramBody?.chat_id, 'tg-7');
  assert.equal(telegramBody?.shop_slug, 'demo-shop');
});

test('auto_assign picks next available rider when cursor is present and excludes declined riders', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
          { id: 8, name: '骑手B', phone: '062', status: 'available', telegramChatId: 'tg-8' },
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders') {
      return new Response(JSON.stringify([
        { id: 471, shopSlug: 'demo-shop', remarksJson: JSON.stringify(['dispatch_meta:{"declinedRiderIds":["8"]}']) },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/471/status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.courierName, '骑手C');
      assert.equal(body.courierPhone, '063');
      assert.equal(body.pickupEtaMinutes, 20);
      assert.equal(body.pickup_eta_minutes, 20);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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


test('manual_assign rejects rider already declined for current order', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders') {
      return new Response(JSON.stringify([
        { id: 470, shopSlug: 'demo-shop', remarksJson: JSON.stringify(['dispatch_meta:{"declinedRiderIds":["7"]}']) },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'rider_already_declined_this_order',
  });
});

test('returns invalid_action for unsupported action values', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
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

    if (url === 'https://api.test.local/api/admin/riders') {
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

    if (url === 'https://api.test.local/api/admin/riders') {
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

test('manual_assign resolves shopSlug from orders API when request body misses shopSlug and hydrates order summary', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/474/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders') {
      return new Response(JSON.stringify([
        {
          id: 474,
          shopSlug: 'demo-shop',
          orderNo: 'A474',
          tableInfo: 'Cara Lazara 12',
          userPhone: '060123456',
          totalAmount: 2890,
          scheduledFor: '2026-04-04 12:30:00',
          items: [
            { name: '烤鸡腿', quantity: 2 },
            { name: '米饭', quantity: 1 },
          ],
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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
  assert.equal(telegramBody?.shop_slug, 'demo-shop');
  assert.equal(telegramBody?.chat_id, 'tg-9');
  assert.match(String(telegramBody?.text || ''), /A474/);
  assert.match(String(telegramBody?.text || ''), /Cara Lazara 12/);
  assert.match(String(telegramBody?.text || ''), /060123456/);
  assert.match(String(telegramBody?.text || ''), /2890 RSD/);
  assert.match(String(telegramBody?.text || ''), /预约送达：2026-04-04 12:30:00/);
  assert.match(String(telegramBody?.text || ''), /烤鸡腿 x2/);
  assert.match(String(telegramBody?.text || ''), /米饭 x1/);
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 9,
      name: '骑手C',
      phone: '063',
    },
  });
});

test('shopSlug fallback ignores non-json orders response and still succeeds', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/474/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders') {
      return new Response('<html>ok</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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
  assert.equal((await response.json()).success, true);
  assert.equal('shop_slug' in (telegramBody || {}), false);
});

test('manual_assign keeps numeric shop slug when request provides numeric admin slug', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/474/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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
      body: JSON.stringify({ action: 'manual_assign', orderId: '474', riderId: '9', shopSlug: '103' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(telegramBody?.shop_slug, '103');
  assert.equal(telegramBody?.chat_id, 'tg-9');
  assert.equal(telegramBody?.chatId, 'tg-9');
});

test('manual_assign hydrates telegram message from snake_case order fields and itemsJson', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/475/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders') {
      return new Response(JSON.stringify([
        {
          id: 475,
          shop_slug: 'demo-shop',
          order_no: 'A475',
          table_info: 'Cara Lazara 13',
          user_phone: '060999888',
          total_amount: 3120,
          scheduled_for: '2026-04-05 18:45:00',
          items_json: JSON.stringify([
            { name: '烤鱼', quantity: 1 },
            { name: '米饭', quantity: 2 },
          ]),
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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
      body: JSON.stringify({ action: 'manual_assign', orderId: '475', riderId: '9' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramBody?.shop_slug, 'demo-shop');
  assert.equal(telegramBody?.chat_id, 'tg-9');
  assert.match(String(telegramBody?.text || ''), /A475/);
  assert.match(String(telegramBody?.text || ''), /Cara Lazara 13/);
  assert.match(String(telegramBody?.text || ''), /060999888/);
  assert.match(String(telegramBody?.text || ''), /3120 RSD/);
  assert.match(String(telegramBody?.text || ''), /预约送达：2026-04-05 18:45:00/);
  assert.match(String(telegramBody?.text || ''), /烤鱼 x1/);
  assert.match(String(telegramBody?.text || ''), /米饭 x2/);
});

test('keeps assignment successful when telegram notification fails', async () => {
  let telegramCalled = false;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/474/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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
      chatId: 'tg-9',
      chatIdSource: 'rider',
      shopSlug: 'demo-shop',
    },
  });
});

test('manual_assign sends short callback token and rider-claim can consume it', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/476/status') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3000/api/rider/status?action=list_available') {
      return new Response(JSON.stringify({
        success: true,
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3000/api/admin/orders') {
      return new Response(JSON.stringify([{ id: 476, remarksJson: '' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3000/api/admin/orders/remarks') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3000/api/order/update_status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.id, 476);
      assert.equal(body.status, 'delivering');
      assert.equal(body.courier_name, '骑手C');
      assert.equal(body.courier_phone, '063');
      return new Response(JSON.stringify({ success: true }), {
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
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '476',
        riderId: '9',
        shopSlug: 'demo-shop',
        pickupEtaMinutes: 18,
        orderSummary: {
          orderNo: 'A476',
          tableInfo: 'Cara Lazara 12',
          userPhone: '060123',
          totalAmount: 2890,
          scheduledFor: '2026-04-03 18:30:00',
          items: [
            { name: '烤鸡腿', quantity: 2 },
            { name: '米饭', quantity: 1 },
          ],
        },
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramBody?.shop_slug, 'demo-shop');
  assert.equal(telegramBody?.chat_id, 'tg-9');
  assert.match(String(telegramBody?.text || ''), /A476/);
  assert.match(String(telegramBody?.text || ''), /Cara Lazara 12/);
  assert.match(String(telegramBody?.text || ''), /060123/);
  assert.match(String(telegramBody?.text || ''), /烤鸡腿 x2/);
  assert.match(String(telegramBody?.text || ''), /2890 RSD/);

  const replyMarkup = telegramBody?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined;
  const claimButton = replyMarkup?.inline_keyboard?.flat().find((button) => button?.text === '立即接单');
  assert.ok(claimButton?.callback_data);
  assert.match(String(claimButton?.callback_data || ''), /^rc2\./);
  assert.ok(Buffer.byteLength(String(claimButton?.callback_data || ''), 'utf8') <= 64);

  const { POST: riderClaimPost } = await import('../../../pages/api/telegram/rider-claim.ts');
  const claimResponse = await riderClaimPost({
    request: new Request('http://localhost:3000/api/telegram/rider-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        callbackData: String(claimButton?.callback_data || ''),
        chatId: 'tg-9',
      }),
    }),
  } as any);

  assert.equal(claimResponse.status, 200);
  assert.deepEqual(await claimResponse.json(), { success: true });
});

test('manual_assign uses safe numeric fallback in telegram text to avoid NaN copy', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/477/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '477',
        riderId: '9',
        shopSlug: 'demo-shop',
        pickupEtaMinutes: 'abc',
        orderSummary: {
          orderNo: 'A477',
          tableInfo: 'Cara Lazara 12',
          userPhone: '060123',
          totalAmount: 'bad',
          items: [{ name: '米饭', quantity: 1 }],
        },
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  const text = String(telegramBody?.text || '');
  assert.doesNotMatch(text, /NaN/);
  assert.match(text, /金额：0 RSD/);
  assert.match(text, /预计 0 分钟后可取/);
});

test('manual_assign short callback keeps original rider full name when rider/status is available', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手超长完整姓名A', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/478/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'http://localhost:3000/api/rider/status?action=list_available') {
      return new Response(JSON.stringify({
        success: true,
        riders: [
          { id: 9, name: '骑手超长完整姓名A', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3000/api/admin/orders') {
      return new Response(JSON.stringify([{ id: 478, remarksJson: '' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3000/api/admin/orders/remarks') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3000/api/order/update_status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.courier_name, '骑手超长完整姓名A');
      assert.equal(body.courier_phone, '063');
      return new Response(JSON.stringify({ success: true }), {
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
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '478',
        riderId: '9',
        shopSlug: 'demo-shop',
        pickupEtaMinutes: 18,
        orderSummary: {
          orderNo: 'A478',
          tableInfo: 'Cara Lazara 12',
          userPhone: '060123',
          totalAmount: 2890,
          items: [{ name: '烤鸡腿', quantity: 2 }],
        },
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  const replyMarkup = telegramBody?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined;
  const claimButton = replyMarkup?.inline_keyboard?.flat().find((button) => button?.text === '立即接单');
  const { POST: riderClaimPost } = await import('../../../pages/api/telegram/rider-claim.ts');
  const claimResponse = await riderClaimPost({
    request: new Request('http://localhost:3000/api/telegram/rider-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        callbackData: String(claimButton?.callback_data || ''),
        chatId: 'tg-9',
      }),
    }),
  } as any);

  assert.equal(claimResponse.status, 200);
  assert.deepEqual(await claimResponse.json(), { success: true });
});

test('manual_assign 在 admin riders 仅返回 telegram_chat_id 时仍发送通知', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegram_chat_id: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/479/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), {
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
      body: JSON.stringify({ action: 'manual_assign', orderId: '479', riderId: '9', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramBody?.chat_id, 'tg-9');
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 9,
      name: '骑手C',
      phone: '063',
    },
  });
});

test('manual_assign 在 admin riders 回包嵌套于 data.rows 时仍能找到骑手并发通知', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        data: {
          rows: [
            { id: 10, name: '骑手D', phone: '064', status: 'available', telegramChatId: 'tg-10' },
          ],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/480/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), {
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
      body: JSON.stringify({ action: 'manual_assign', orderId: '480', riderId: '10', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramBody?.chat_id, 'tg-10');
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 10,
      name: '骑手D',
      phone: '064',
    },
  });
});

test('manual_assign 在 admin riders 缺少 chat_id 时回退使用前端传入的 riderTelegramChatId', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 11, name: '骑手E', phone: '065', status: 'available' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/481/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), {
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
      body: JSON.stringify({ action: 'manual_assign', orderId: '481', riderId: '11', shopSlug: 'demo-shop', riderTelegramChatId: 'tg-11' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramBody?.chat_id, 'tg-11');
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 11,
      name: '骑手E',
      phone: '065',
    },
  });
});

test('manual_assign 在本地 telegram send 返回失败时继续透出真实错误', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/479/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      return new Response(JSON.stringify({ success: false, error: 'telegram_bot_token_not_configured' }), {
        status: 400,
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
      body: JSON.stringify({ action: 'manual_assign', orderId: '479', riderId: '9', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

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
      error: '{"success":false,"error":"telegram_bot_token_not_configured"}',
      chatId: 'tg-9',
      chatIdSource: 'rider',
      shopSlug: 'demo-shop',
    },
  });
});

test('manual_assign 在请求体已带 telegramBotToken 时透传给本地 telegram send', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 12, name: '骑手F', phone: '066', status: 'available', telegramChatId: 'tg-12' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/482/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true, ok: true }), {
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
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '482',
        riderId: '12',
        shopSlug: 'demo-shop',
        riderTelegramChatId: 'tg-12',
        telegramBotToken: 'inline-bot-token',
        debugTelegram: true,
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramBody?.telegramBotToken, 'inline-bot-token');
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 12,
      name: '骑手F',
      phone: '066',
    },
    telegram_notification: {
      success: true,
      chatId: 'tg-12',
      chatIdSource: 'rider',
      shopSlug: 'demo-shop',
    },
  });
});

test('manual_assign 在仅有 TELEGRAM_WEBHOOK_SECRET 时仍可发送带接单按钮的通知', async () => {
  const previousCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  const previousWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  let telegramBody: Record<string, unknown> | null = null;
  delete process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-callback-secret';

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === 'https://api.test.local/api/admin/riders') {
        return new Response(JSON.stringify({
          riders: [
            { id: 12, name: '骑手F', phone: '066', status: 'available', telegramChatId: 'tg-12' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders/482/status') {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/telegram/send') {
        telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ success: true, ok: true }), {
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
        body: JSON.stringify({
          action: 'manual_assign',
          orderId: '482',
          riderId: '12',
          shopSlug: 'demo-shop',
          riderTelegramChatId: 'tg-12',
          debugTelegram: true,
        }),
      }),
      cookies: createCookies(),
    } as any);

    assert.equal(response.status, 200);
    const replyMarkup = telegramBody?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined;
    const claimButton = replyMarkup?.inline_keyboard?.flat().find((button) => button?.text === '立即接单');
    assert.ok(claimButton?.callback_data);
    assert.deepEqual(await response.json(), {
      success: true,
      rider: {
        id: 12,
        name: '骑手F',
        phone: '066',
      },
      telegram_notification: {
        success: true,
        chatId: 'tg-12',
        chatIdSource: 'rider',
        shopSlug: 'demo-shop',
      },
    });
  } finally {
    if (previousCallbackSecret == null) delete process.env.TELEGRAM_CALLBACK_SECRET;
    else process.env.TELEGRAM_CALLBACK_SECRET = previousCallbackSecret;
    if (previousWebhookSecret == null) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previousWebhookSecret;
  }
});

test('manual_assign 在缺少 callback/webhook secret 时降级发送无按钮通知', async () => {
  const previousCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  const previousWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  let telegramBody: Record<string, unknown> | null = null;
  delete process.env.TELEGRAM_CALLBACK_SECRET;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === 'https://api.test.local/api/admin/riders') {
        return new Response(JSON.stringify({
          riders: [
            { id: 13, name: '骑手G', phone: '067', status: 'available', telegramChatId: 'tg-13' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders/483/status') {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/telegram/send') {
        telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ success: true, ok: true }), {
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
        body: JSON.stringify({
          action: 'manual_assign',
          orderId: '483',
          riderId: '13',
          shopSlug: 'demo-shop',
          riderTelegramChatId: 'tg-13',
          debugTelegram: true,
        }),
      }),
      cookies: createCookies(),
    } as any);

    assert.equal(response.status, 200);
    const replyMarkup = telegramBody?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined;
    assert.equal(replyMarkup?.inline_keyboard?.flat().some((button) => button?.text === '立即接单'), false);
    assert.deepEqual(await response.json(), {
      success: true,
      rider: {
        id: 13,
        name: '骑手G',
        phone: '067',
      },
      telegram_notification: {
        success: true,
        chatId: 'tg-13',
        chatIdSource: 'rider',
        shopSlug: 'demo-shop',
      },
    });
  } finally {
    if (previousCallbackSecret == null) delete process.env.TELEGRAM_CALLBACK_SECRET;
    else process.env.TELEGRAM_CALLBACK_SECRET = previousCallbackSecret;
    if (previousWebhookSecret == null) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previousWebhookSecret;
  }
});

test('manual_assign 在 orderSummary.phone 缺失时不生成无效 tel 按钮', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 14, name: '骑手H', phone: '068', status: 'available', telegramChatId: 'tg-14' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/484/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
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
      },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '484',
        riderId: '14',
        shopSlug: 'demo-shop',
        orderSummary: {
          orderNo: 'A484',
          tableInfo: 'Cara Lazara 12',
          userPhone: '',
          totalAmount: 1500,
          items: [{ name: '米饭', quantity: 1 }],
        },
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  const replyMarkup = telegramBody?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; url?: string }>> } | undefined;
  assert.equal(replyMarkup?.inline_keyboard?.flat().some((button) => button?.url === 'tel:-'), false);
  assert.equal((await response.json()).success, true);
});

test('manual_assign 在 orderSummary.phone 存在时生成合法 tel 按钮', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 14, name: '骑手H', phone: '068', status: 'available', telegramChatId: 'tg-14' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/484/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
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
      },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '484',
        riderId: '14',
        shopSlug: 'demo-shop',
        orderSummary: {
          orderNo: 'A484',
          tableInfo: 'Cara Lazara 12',
          userPhone: '0613083888',
          totalAmount: 1500,
          items: [{ name: '米饭', quantity: 1 }],
        },
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  const replyMarkup = telegramBody?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; url?: string }>> } | undefined;
  assert.equal(replyMarkup?.inline_keyboard?.flat().some((button) => button?.url === 'tel:0613083888'), true);
  assert.equal((await response.json()).success, true);
});

test('manual_assign 调用后端 telegram send 时透传 cookie 与 authorization', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 9, name: '骑手C', phone: '063', status: 'available', telegramChatId: 'tg-9' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/475/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
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

test('manual_assign 在后端 telegram send 返回超时诊断时继续透出真实错误', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 15, name: '骑手I', phone: '069', status: 'available', telegramChatId: 'tg-15' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/485/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      return new Response(JSON.stringify({
        success: false,
        error: 'telegram_send_failed',
        message: 'fetch aborted',
        cause: 'Telegram request timed out after 8000ms',
        code: 'TELEGRAM_REQUEST_TIMEOUT',
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
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
      },
      body: JSON.stringify({ action: 'manual_assign', orderId: '485', riderId: '15', shopSlug: 'demo-shop', debugTelegram: true }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.telegram_notification, {
    success: false,
    error: '{"success":false,"error":"telegram_send_failed","message":"fetch aborted","cause":"Telegram request timed out after 8000ms","code":"TELEGRAM_REQUEST_TIMEOUT"}',
    chatId: 'tg-15',
    chatIdSource: 'rider',
    shopSlug: 'demo-shop',
  });
});

test('manual_assign 在 riders 上游请求直接抛错时返回 json 错误而不是让前端 Failed to fetch', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/admin/riders') {
      throw new Error('upstream network down');
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({ action: 'manual_assign', orderId: '486', riderId: '7', shopSlug: 'demo-shop', debugTelegram: true }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'riders_upstream_failed',
    upstream_status: 503,
    upstream_body: '{"ok":false,"error":{"code":"backend_unavailable","message":"Backend unavailable"}}',
  });
});

test('manual_assign 在 debugTelegram 时打印后端 telegram send 响应诊断', async () => {
  const consoleCalls: unknown[][] = [];
  const originalConsoleError = console.error;

  try {
    console.error = (...args: unknown[]) => {
      consoleCalls.push(args);
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === 'https://api.test.local/api/admin/riders') {
        return new Response(JSON.stringify({
          riders: [
            { id: 16, name: '骑手J', phone: '0616', status: 'available', telegramChatId: 'tg-16' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders/487/status') {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/telegram/send') {
        return new Response(JSON.stringify({
          success: false,
          error: 'telegram_send_failed',
          message: 'chat not found',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const mod = await loadRoute();
    await mod.POST({
      request: new Request('http://localhost:3000/api/admin/rider-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
        body: JSON.stringify({
          action: 'manual_assign',
          orderId: '487',
          riderId: '16',
          shopSlug: 'demo-shop',
          debugTelegram: true,
        }),
      }),
      cookies: createCookies(),
    } as any);

    assert.ok(consoleCalls.some((args) => String(args[0]).includes('[admin/rider-assign:telegram]')));
    assert.ok(consoleCalls.some((args) => typeof args[1] === 'string' && args[1].includes('"status":200')));
    assert.ok(consoleCalls.some((args) => typeof args[1] === 'string' && args[1].includes('"parsedSuccess":false')));
    assert.ok(consoleCalls.some((args) => typeof args[1] === 'string' && args[1].includes('chat not found')));
    assert.ok(consoleCalls.some((args) => typeof args[1] === 'string' && args[1].includes('"textLength":')));
    assert.ok(consoleCalls.some((args) => typeof args[1] === 'string' && args[1].includes('"callbackDataLength":')));
    assert.ok(consoleCalls.some((args) => typeof args[1] === 'string' && args[1].includes('"callbackDataPreview":')));
  } finally {
    console.error = originalConsoleError;
  }
});

test('manual_assign 在后端 telegram send 返回 200 但 success=false 时仍透出失败诊断', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 16, name: '骑手J', phone: '0616', status: 'available', telegramChatId: 'tg-16' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/487/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      return new Response(JSON.stringify({
        success: false,
        error: 'telegram_send_failed',
        message: 'chat not found',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '487',
        riderId: '16',
        shopSlug: 'demo-shop',
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 16,
      name: '骑手J',
      phone: '0616',
    },
    telegram_notification: {
      success: false,
      error: '{"success":false,"error":"telegram_send_failed","message":"chat not found"}',
      chatId: 'tg-16',
      chatIdSource: 'rider',
      shopSlug: 'demo-shop',
    },
  });
});

test('manual_assign 在后端 telegram send 返回 html 502 时回退纯文本重试一次', async () => {
  let telegramCalls = 0;
  const telegramBodies: Record<string, unknown>[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 17, name: '骑手K', phone: '0617', status: 'available', telegramChatId: 'tg-17' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/488/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      telegramCalls += 1;
      telegramBodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
      if (telegramCalls === 1) {
        return new Response('<html><title>502: Bad gateway</title></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response(JSON.stringify({ success: true, ok: true }), {
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
      body: JSON.stringify({ action: 'manual_assign', orderId: '488', riderId: '17', shopSlug: 'demo-shop' }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.equal(telegramCalls, 2);
  assert.ok(telegramBodies[0]?.reply_markup);
  assert.equal('reply_markup' in (telegramBodies[1] || {}), false);
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 17,
      name: '骑手K',
      phone: '0617',
    },
  });
});

test('manual_assign 在内部 telegram send 抛错时仍保持派单成功并透出 telegram_notification 诊断', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 16, name: '骑手J', phone: '0616', status: 'available', telegramChatId: 'tg-16' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/487/status') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/telegram/send') {
      throw new Error('local telegram send crashed');
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=test-token' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '487',
        riderId: '16',
        shopSlug: 'demo-shop',
      }),
    }),
    cookies: createCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    rider: {
      id: 16,
      name: '骑手J',
      phone: '0616',
    },
    telegram_notification: {
      success: false,
      error: 'local telegram send crashed',
      chatId: 'tg-16',
      chatIdSource: 'rider',
      shopSlug: 'demo-shop',
    },
  });
});
