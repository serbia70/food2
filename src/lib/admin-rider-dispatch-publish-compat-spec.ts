import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as handleAdminRiderDispatch } from '../pages/api/admin/rider-dispatch.ts';
import {
  createCookies,
  jsonResponse,
  useMockFetch,
  useTestEnv,
} from './admin-rider-dispatch-integration-test-helpers.ts';

test('publish dispatch 兼容上游 data.order 包装的订单快照', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders/911/status') return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        data: {
          order: {
            id: '911',
            remarksJson: JSON.stringify(['note:keep-me']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        },
      });
    }
    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: true, riders: [{ id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' }] });
    }
    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: (JSON.parse(await request.text()) as { remarks: string[] }).remarks });
    }
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true, result: { message_id: 9993 } });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '911', action: 'publish' }),
    }),
    cookies: createCookies(),
  } as never);
  const body = JSON.parse(await response.text()) as { success: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/911/status'));
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch 成功时骑手列表为空返回 success:true 且不触发 telegram', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders/913/status') return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/riders') return jsonResponse({ success: true, riders: [] });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '913',
        action: 'publish',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
        pickupEtaMinutes: 12,
        status: 'awaiting_courier',
      }),
    }),
    cookies: createCookies(),
  } as never);

  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});
