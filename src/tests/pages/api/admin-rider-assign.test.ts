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
  assert.ok(calls.includes('https://api.test.local/api/admin/orders/470/status'));
});

test('auto_assign picks next available rider when cursor is present', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/admin/riders') {
      return new Response(JSON.stringify({
        riders: [
          { id: 7, name: '骑手A', phone: '061', status: 'available', telegramChatId: 'tg-7' },
          { id: 8, name: '骑手B', phone: '062', status: 'available', telegramChatId: 'tg-8' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url === 'https://api.test.local/api/admin/orders/471/status') {
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

test('manual_assign resolves shopSlug from orders API when request body misses shopSlug', async () => {
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
  assert.equal(telegramBody?.shop_slug, 'demo-shop');
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
  assert.equal((await response.json()).success, true);
  assert.equal(telegramBody?.shop_slug, '');
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

    if (url === 'http://localhost:3000/api/telegram/send') {
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

    if (url === 'http://localhost:3000/api/telegram/send') {
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

    if (url === 'http://localhost:3000/api/telegram/send') {
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

    if (url === 'http://localhost:3000/api/telegram/send') {
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

    if (url === 'http://localhost:3000/api/telegram/send') {
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
    },
  });
});

test('manual_assign 调用本地 telegram send 时只透传 cookie 不透传 authorization', async () => {
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

    if (url === 'http://localhost:3000/api/telegram/send') {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('cookie'), 'master_token=master-cookie-1; admin_token=admin-cookie-1');
      assert.equal(headers.get('authorization'), null);
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
