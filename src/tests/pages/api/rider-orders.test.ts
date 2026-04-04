import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'https://api.test.local';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/rider/orders.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('GET rider orders 透传后端失败响应', async () => {
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    assert.equal(url, 'https://api.test.local/api/rider/orders?phone=0613083899&view=active');
    return new Response(JSON.stringify({ success: false, error: 'rider_session_required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const { GET } = await loadRoute();
  const response = await GET({
    url: new URL('http://localhost/api/rider/orders?phone=0613083899&view=active'),
  } as any);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'rider_session_required',
  });
});

test('GET rider orders 过滤当前骑手 active 订单', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    rider: { id: 7, phone: '0613083899', telegram_chat_id: 'chat-7' },
    orders: [
      { id: 1, status: 'awaiting_courier', courierPhone: '', userPhone: '1' },
      { id: 2, status: 'delivering', courierPhone: '0613083899', userPhone: '2' },
      { id: 3, status: 'delivering', courierPhone: '000', userPhone: '3' },
      { id: 4, status: 'completed', courierPhone: '0613083899', userPhone: '4' },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const { GET } = await loadRoute();
  const response = await GET({
    url: new URL('http://localhost/api/rider/orders?phone=0613083899&view=active'),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    rider: { id: 7, phone: '0613083899', telegram_chat_id: 'chat-7', telegramChatId: 'chat-7' },
    orders: [
      { id: 1, status: 'awaiting_courier', courierPhone: '', userPhone: '1' },
      { id: 2, status: 'delivering', courierPhone: '0613083899', userPhone: '2' },
    ],
  });
});

test('GET rider orders 归一化后端 snake_case 字段供 dashboard 使用', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    orders: [
      {
        id: 490,
        order_no: '260403003',
        shop_name: '103',
        table_info: 'hui, 0613083888, ruma1',
        user_phone: '0613083888',
        created_at: '2026-04-02T22:27:11Z',
        total_amount: 556,
        items_json: '[{"name":"Turbot na pari","quantity":1}]',
        courier_phone: '0613083899',
        pickup_eta_minutes: 15,
        status: 'delivering',
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const { GET } = await loadRoute();
  const response = await GET({
    url: new URL('http://localhost/api/rider/orders?phone=0613083899&view=active'),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    orders: [
      {
        id: 490,
        orderNo: '260403003',
        shopName: '103',
        tableInfo: 'hui, 0613083888, ruma1',
        userPhone: '0613083888',
        createdAt: '2026-04-02T22:27:11Z',
        totalAmount: 556,
        itemsJson: '[{"name":"Turbot na pari","quantity":1}]',
        courierPhone: '0613083899',
        pickupEtaMinutes: 15,
        status: 'delivering',
      },
    ],
  });
});
