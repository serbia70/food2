import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as handleAdminRiderDispatch } from '../pages/api/admin/rider-dispatch.ts';
import {
  createCookies,
  jsonResponse,
  useMockFetch,
  useTestEnv,
} from './admin-rider-dispatch-integration-test-helpers.ts';

test('publish dispatch 订单快照缺失时返回 order_snapshot_unavailable 且不发 telegram', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders' && request.method === 'GET') return jsonResponse({ success: true, orders: [] });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '697', action: 'publish' }),
    }),
    cookies: createCookies(),
  } as never);
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 502);
  assert.equal(body.error, 'order_snapshot_unavailable');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch 指定的 forced rider 不存在时返回 forced_rider_not_found 且不发 telegram', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders/921/status') return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ riders: [{ id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' }] });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '921',
        action: 'publish',
        forceRiderId: '999',
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
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(body.error, 'forced_rider_not_found');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});
