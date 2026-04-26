import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as handleAdminRiderDispatch } from '../../../src/pages/api/admin/rider-dispatch.ts';
import {
  createCookies,
  findTelegramButton,
  jsonResponse,
  useMockFetch,
  useTestEnv,
} from './admin-rider-dispatch-integration-test-helpers.ts';

test('publish dispatch 成功时向正确 Telegram 目标发送一次店铺信息', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders/902/status') return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ riders: [{ id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' }] });
    }
    if (url.pathname === '/api/admin/settings/master') {
      return jsonResponse({ success: true, settings: { server: { telegramWebhookSecret: 'remote-secret' } } });
    }
    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true, result: { message_id: 7788 } });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer admin-token', cookie: 'admin_token=admin-cookie' },
      body: JSON.stringify({
        orderId: '902',
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
  const body = JSON.parse(await response.text()) as { success: boolean; telegram_dispatch?: { failedCount: number; attempts: Array<{ delivered: boolean }> } };
  const telegramCall = calls.find((call) => new URL(call.url).pathname === '/api/telegram/send');
  const telegramBody = JSON.parse(telegramCall?.body || '{}') as { text?: string; chat_id?: string; reply_markup?: unknown };

  assert.ok(telegramCall);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.telegram_dispatch?.failedCount, 0);
  assert.deepEqual(body.telegram_dispatch?.attempts, [{ delivered: true }]);
  assert.equal(telegramBody.chat_id, 'chat-1');
  assert.ok(findTelegramButton(telegramBody.reply_markup, '接单'));
});

