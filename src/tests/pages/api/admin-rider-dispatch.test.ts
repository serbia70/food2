import assert from 'node:assert/strict';
import test from 'node:test';

process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/admin/rider-dispatch.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('POST rider-dispatch publish 支持 /api/admin/orders 直接返回数组', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith('/api/admin/orders')) {
      return new Response(JSON.stringify([
        {
          id: 447,
          shop_id: 21,
          shop_slug: 'demo-shop',
          status: 'pending',
          order_type: 'delivery',
          total_amount: 905,
          table_info: 'hui, 0613083888, ruma1',
          pickup_eta_minutes: 0,
          user_phone: '0613083888',
        },
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/api/admin/orders/447/status')) {
      assert.equal(init?.method, 'PUT');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/rider/status?action=list_available')) {
      return new Response(JSON.stringify({ riders: [
        { id: 7, name: '骑手A', phone: '0613083899', telegram_chat_id: 'chat-7' },
      ] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/api/telegram/send')) {
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, any>;
      assert.equal(body.shop_slug, 'demo-shop');
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
        pickup_eta_minutes: 15,
        pickup_ready_at: '2026-03-30T18:06:29.410Z',
        rider_broadcasted_at: '2026-03-30T17:51:29.410Z',
        rider_last_reminded_at: '',
        rider_remind_count: 0,
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
  assert.ok(calls.some((call) => call.url.endsWith('/api/telegram/send')));
});
