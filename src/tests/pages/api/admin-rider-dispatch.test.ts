import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PUBLIC_API_URL = 'http://localhost:3030';
process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/admin/rider-dispatch.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('POST rider-dispatch publish 兼容 admin riders 返回 telegram_chat_id', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/orders/470/status') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({ riders: [
        { id: 8, name: '骑手B', phone: '0613000000', status: 'available', telegram_chat_id: 'chat-snake-8' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/telegram/send') {
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
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_token=test-token',
      },
      body: JSON.stringify({
        orderId: '470',
        action: 'publish',
        status: 'awaiting_courier',
        pickupEtaMinutes: 15,
        pickupReadyAt: '2026-03-30T22:00:53.290Z',
        riderBroadcastedAt: '2026-03-30T21:45:53.290Z',
        riderLastRemindedAt: '',
        riderRemindCount: 0,
        shopSlug: 'demo-shop',
        shopId: 21,
        shopName: 'Demo Shop',
        tableInfo: 'hui, 0613083888, ruma1',
        totalAmount: 905,
        userPhone: '0613083888',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'test-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.telegram_dispatch.deliveredCount, 1);
  assert.equal(telegramBody?.chat_id, 'chat-snake-8');
});

test('POST rider-dispatch publish 调用本地 telegram send 时透传 cookie 与 authorization', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/orders/476/status') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({ riders: [
        { id: 8, name: '骑手B', phone: '0613000000', status: 'available', telegram_chat_id: 'chat-snake-8' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/telegram/send') {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('cookie'), 'master_token=master-cookie-1; admin_token=admin-cookie-1');
      assert.equal(headers.get('authorization'), 'Bearer inline-auth-token');
      return new Response(JSON.stringify({ success: true, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'master_token=master-cookie-1; admin_token=admin-cookie-1',
        authorization: 'Bearer inline-auth-token',
      },
      body: JSON.stringify({
        orderId: '476',
        action: 'publish',
        status: 'awaiting_courier',
        pickupEtaMinutes: 15,
        pickupReadyAt: '2026-03-30T22:00:53.290Z',
        riderBroadcastedAt: '2026-03-30T21:45:53.290Z',
        riderLastRemindedAt: '',
        riderRemindCount: 0,
        shopSlug: 'demo-shop',
        shopId: 21,
        shopName: 'Demo Shop',
        tableInfo: 'hui, 0613083888, ruma1',
        totalAmount: 905,
        userPhone: '0613083888',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'test-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('POST rider-dispatch publish 支持 /api/admin/orders 直接返回数组', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url === 'http://localhost:3030/api/admin/orders') {
      return new Response(JSON.stringify([
        {
          id: 447,
          shopId: 21,
          shopSlug: 'demo-shop',
          status: 'pending',
          order_type: 'delivery',
          totalAmount: 905,
          tableInfo: 'hui, 0613083888, ruma1',
          pickupEtaMinutes: 0,
          userPhone: '0613083888',
        },
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/orders/447/status') {
      assert.equal(init?.method, 'PUT');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/riders') {
      assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer test-token');
      return new Response(JSON.stringify({ riders: [
        { id: 7, name: '骑手A', phone: '0613083899', status: 'available', telegramChatId: 'chat-7' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/telegram/send') {
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, any>;
      assert.equal(body.shopSlug, 'demo-shop');
      assert.equal(body.chat_id, 'chat-7');
      assert.equal(body.text, '店铺有新单\n约 15 分钟后可取\n地址：hui, 0613083888, ruma1\n金额：905 RSD\n联系电话：0613083888');
      assert.equal(body.reply_markup?.inline_keyboard?.[0]?.[1]?.url, 'https://food2.serbia70.com/rider/dashboard?orderId=447&restaurantId=demo-shop');
      assert.equal(body.reply_markup?.inline_keyboard?.[0]?.[2]?.url, 'tel:0613083888');
      assert.equal(typeof body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data, 'string');
      assert.ok(body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data.length > 10);
      return new Response(JSON.stringify({ success: true, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_token=test-token',
      },
      body: JSON.stringify({
        orderId: '447',
        action: 'publish',
        status: 'awaiting_courier',
        pickupEtaMinutes: 15,
        pickupReadyAt: '2026-03-30T18:06:29.410Z',
        riderBroadcastedAt: '2026-03-30T17:51:29.410Z',
        riderLastRemindedAt: '',
        riderRemindCount: 0,
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'test-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.order.id, 447);
  assert.equal(body.order.status, 'awaiting_courier');
  assert.ok(calls.some((call) => call.url.includes('/api/admin/orders/447/status')));
  assert.ok(calls.some((call) => call.url === 'https://food2.serbia70.com/api/telegram/send'));
});

test('POST rider-dispatch publish 在请求体已带订单快照时不再依赖 /api/admin/orders', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url === 'http://localhost:3030/api/admin/orders/463/status') {
      assert.equal(init?.method, 'PUT');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/riders') {
      assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer test-token');
      return new Response(JSON.stringify({ riders: [
        { id: 7, name: '骑手A', phone: '0613083899', status: 'available', telegramChatId: 'chat-7' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/telegram/send') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(body.shopSlug, 'demo-shop');
      assert.equal(body.chat_id, 'chat-7');
      return new Response(JSON.stringify({ success: true, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/orders') {
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_token=test-token',
      },
      body: JSON.stringify({
        orderId: '463',
        action: 'publish',
        status: 'awaiting_courier',
        pickupEtaMinutes: 15,
        pickupReadyAt: '2026-03-30T22:00:53.290Z',
        riderBroadcastedAt: '2026-03-30T21:45:53.290Z',
        riderLastRemindedAt: '',
        riderRemindCount: 0,
        shopSlug: 'demo-shop',
        shopId: 21,
        shopName: 'Demo Shop',
        tableInfo: 'hui, 0613083888, ruma1',
        totalAmount: 905,
        userPhone: '0613083888',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'test-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.order.id, '463');
  assert.ok(calls.some((call) => call.url === 'http://localhost:3030/api/admin/orders/463/status'));
  assert.ok(calls.some((call) => call.url === 'https://food2.serbia70.com/api/telegram/send'));
  assert.equal(calls.some((call) => call.url === 'http://localhost:3030/api/admin/orders'), false);
});

test('POST rider-dispatch remind 会再次广播并返回 telegram_dispatch', async () => {
  let statusUpdateBody: Record<string, unknown> | null = null;
  let telegramSendCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/orders/472/status') {
      statusUpdateBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/riders') {
      return new Response(JSON.stringify({ riders: [
        { id: 9, name: '骑手C', phone: '0613000011', status: 'available', telegramChatId: 'chat-9' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/telegram/send') {
      telegramSendCount += 1;
      return new Response(JSON.stringify({ success: true, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_token=test-token',
      },
      body: JSON.stringify({
        orderId: '472',
        action: 'remind',
        riderLastRemindedAt: '2026-04-02T08:51:00.000Z',
        riderRemindCount: 2,
        shopSlug: 'demo-shop',
        shopId: 21,
        shopName: 'Demo Shop',
        status: 'awaiting_courier',
        tableInfo: 'hui, 0613083888, ruma1',
        totalAmount: 905,
        userPhone: '0613083888',
        pickupEtaMinutes: 15,
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'test-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.telegram_dispatch.deliveredCount, 1);
  assert.equal(telegramSendCount, 1);
  assert.equal(statusUpdateBody?.status, 'awaiting_courier');
  assert.equal('courier_name' in (statusUpdateBody || {}), false);
  assert.equal('courier_phone' in (statusUpdateBody || {}), false);
});

test('POST rider-dispatch publish 在未提供 status 时会推进到 awaiting_courier', async () => {
  let statusUpdateBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/orders/473/status') {
      statusUpdateBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_token=test-token',
      },
      body: JSON.stringify({
        orderId: '473',
        action: 'publish',
        pickupEtaMinutes: 15,
        pickupReadyAt: '2026-04-02T08:45:00.000Z',
        riderBroadcastedAt: '2026-04-02T08:30:00.000Z',
        riderLastRemindedAt: '',
        riderRemindCount: 0,
        shopSlug: 'demo-shop',
        shopId: 21,
        shopName: 'Demo Shop',
        tableInfo: 'hui, 0613083888, ruma1',
        totalAmount: 905,
        userPhone: '0613083888',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'test-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.order.status, 'awaiting_courier');
  assert.equal(statusUpdateBody?.status, 'awaiting_courier');
  assert.equal('courier_name' in (statusUpdateBody || {}), false);
  assert.equal('courier_phone' in (statusUpdateBody || {}), false);
});

test('POST rider-dispatch 在上游订单更新 404 时返回明确阶段错误', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/orders') {
      return new Response(JSON.stringify([
        {
          id: 460,
          shopId: 21,
          shopSlug: 'demo-shop',
          status: 'pending',
          order_type: 'delivery',
          totalAmount: 905,
          tableInfo: 'hui, 0613083888, ruma1',
          pickupEtaMinutes: 0,
          userPhone: '0613083888',
        },
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/orders/460/status') {
      assert.equal(init?.method, 'PUT');
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_token=test-token',
      },
      body: JSON.stringify({
        orderId: '460',
        action: 'publish',
        status: 'awaiting_courier',
        pickupEtaMinutes: 15,
        pickupReadyAt: '2026-03-30T21:31:49.189Z',
        riderBroadcastedAt: '2026-03-30T21:16:49.189Z',
        riderLastRemindedAt: '',
        riderRemindCount: 0,
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'test-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'order_update_failed',
    upstream_status: 404,
    upstream_body: 'Not Found',
  });
});

test('POST rider-dispatch 在 Astro cookies 缺失时仍会用原始 cookie 头透传 Authorization 到订单更新接口', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'http://localhost:3030/api/admin/orders/461/status') {
      const headers = new Headers(init?.headers);
      assert.equal(init?.method, 'PUT');
      assert.equal(headers.get('authorization'), 'Bearer raw-cookie-token');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3030/api/admin/riders') {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer raw-cookie-token');
      return new Response(JSON.stringify({ riders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'foo=1; admin_token=raw-cookie-token; bar=2',
      },
      body: JSON.stringify({
        orderId: '461',
        action: 'publish',
        status: 'awaiting_courier',
        pickupEtaMinutes: 15,
        pickupReadyAt: '2026-03-30T21:31:49.189Z',
        riderBroadcastedAt: '2026-03-30T21:16:49.189Z',
        riderLastRemindedAt: '',
        riderRemindCount: 0,
        shopSlug: 'demo-shop',
        shopId: 21,
        shopName: 'Demo Shop',
        tableInfo: 'hui, 0613083888, ruma1',
        totalAmount: 905,
        userPhone: '0613083888',
      }),
    }),
    cookies: {
      get() {
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('POST rider-dispatch 在缺少 TELEGRAM_CALLBACK_SECRET 时降级为无 callback 派单而不是抛异常', async () => {
  const previousSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  const previousJwtSecret = process.env.JWT_SECRET;
  let telegramSendBody: Record<string, any> | null = null;
  delete process.env.TELEGRAM_CALLBACK_SECRET;
  delete process.env.JWT_SECRET;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === 'http://localhost:3030/api/admin/orders/462/status') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://localhost:3030/api/admin/riders') {
        return new Response(JSON.stringify({ riders: [
          { id: 7, name: '骑手A', phone: '0613083899', status: 'available', telegramChatId: 'chat-7' },
        ] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://localhost:3000/api/telegram/send') {
        telegramSendBody = JSON.parse(String(init?.body || '{}')) as Record<string, any>;
        return new Response(JSON.stringify({ success: true, ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const mod = await loadRoute();
    const response = await mod.POST({
      request: new Request('http://localhost:3000/api/admin/rider-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'admin_token=test-token',
        },
        body: JSON.stringify({
          orderId: '462',
          action: 'publish',
          status: 'awaiting_courier',
          pickupEtaMinutes: 15,
          pickupReadyAt: '2026-03-30T21:31:49.189Z',
          riderBroadcastedAt: '2026-03-30T21:16:49.189Z',
          riderLastRemindedAt: '',
          riderRemindCount: 0,
          shopSlug: 'demo-shop',
          shopId: 21,
          shopName: 'Demo Shop',
          tableInfo: 'hui, 0613083888, ruma1',
          totalAmount: 905,
          userPhone: '0613083888',
        }),
      }),
      cookies: {
        get(name: string) {
          if (name === 'admin_token') return { value: 'test-token' };
          return undefined;
        },
      },
    } as any);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.telegram_dispatch.deliveredCount, 1);
    assert.equal(body.telegram_dispatch.failedCount, 0);
    assert.equal(telegramSendBody?.replyMarkup?.inline_keyboard?.[0]?.[0]?.text, '查看并接单');
    assert.equal(telegramSendBody?.replyMarkup?.inline_keyboard?.[0]?.[0]?.url, 'https://food2.serbia70.com/rider/dashboard?orderId=462&restaurantId=demo-shop');
    assert.equal(telegramSendBody?.replyMarkup?.inline_keyboard?.[0]?.[1]?.text, '联系门店');
    assert.equal(telegramSendBody?.replyMarkup?.inline_keyboard?.[0]?.some((item: Record<string, unknown>) => typeof item.callback_data === 'string'), false);
  } finally {
    if (previousSecret == null) delete process.env.TELEGRAM_CALLBACK_SECRET;
    else process.env.TELEGRAM_CALLBACK_SECRET = previousSecret;

    if (previousJwtSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});
