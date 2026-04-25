import assert from 'node:assert/strict';
import test from 'node:test';

import { handleTelegramRiderClaim } from '../pages/api/telegram/rider-claim.ts';
import {
  createCallback,
  createFetchHandler,
  createOrderRow,
  createRemarksJson,
  createRequest,
  findTelegramButton,
  jsonResponse,
  readDispatchMetaFromRemarks,
  readJson,
  readTelegramSendPayload,
  TEST_CHAT_ID,
  TEST_ORDER_ID,
  TEST_RIDER_ID,
  TEST_RIDER_NAME,
  TEST_RIDER_PHONE,
  useMockFetch,
  useTestEnv,
} from './telegram-rider-claim-test-helpers.ts';

test('accept 失败时走共享错误出口并且不补发阶段消息', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson(),
  }, {
    updateStatusOk: false,
    updateStatusStatus: 409,
    updateStatusBody: { success: false, error: 'order_status_updated' },
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  assert.equal(response.status, 409);
  assert.equal(body.error, 'order_status_updated');
  assert.ok(!calls.some((call) => call.url.endsWith('/api/telegram/send')));
});

test('accept 成功时即使 list_available 不再返回当前骑手，也必须编辑出取餐按钮', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') return jsonResponse({ riders: [] });
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({
          currentAssignedAt,
          currentExpiresAt,
          invalidatedRiderIds: ['303'],
          declinedRiderIds: ['404'],
          telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
        }),
      })]);
    }
    if (url.pathname === '/api/admin/orders/remarks') return jsonResponse({ success: true });
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });
  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(findTelegramButton(telegramPayload, '取餐'));
});

test('accept 成功时订单只有 restaurantId 也必须编辑出取餐按钮', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') return jsonResponse({ riders: [] });
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([{
        ...createOrderRow({
          status: 'awaiting_courier',
          remarksJson: createRemarksJson({ telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 } }),
          shopSlug: '',
        }),
        shopSlug: '',
        restaurantId: 103,
      }]);
    }
    if (url.pathname === '/api/admin/orders/remarks') return jsonResponse({ success: true });
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });
  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(telegramPayload.shopSlug, '103');
  assert.ok(findTelegramButton(telegramPayload, '取餐'));
});

test('accept 成功时写回 dispatch_meta 保留当前骑手位，并把 Telegram 原消息切到待取餐', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson({
      currentAssignedAt,
      currentExpiresAt,
      invalidatedRiderIds: ['303'],
      declinedRiderIds: ['404'],
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));
  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const remarksCall = calls.find((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(remarksCall);
  const remarksPayload = JSON.parse(remarksCall.body) as { remarks?: string[] };
  const nextMeta = readDispatchMetaFromRemarks(JSON.stringify(remarksPayload.remarks || []));
  assert.equal(nextMeta.currentRiderId, String(TEST_RIDER_ID));
  assert.ok(findTelegramButton(telegramPayload, '取餐'));
});

test('accept 成功时 admin orders 未授权且回退 rider orders 仍保留取餐导航', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') return jsonResponse({ riders: [] });
    if (url.pathname === '/api/admin/orders') return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    if (url.pathname === '/api/rider/orders') {
      return jsonResponse({
        success: true,
        orders: [{
          ...createOrderRow({
            status: 'awaiting_courier',
            remarksJson: createRemarksJson({ currentAssignedAt, currentExpiresAt, telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 } }),
          }),
          shopAddress: '',
          restaurantAddress: 'Bulevar 1',
          shopMapUrl: 'https://maps.example.com/shop-a',
        }],
      });
    }
    if (url.pathname === '/api/admin/orders/remarks') return jsonResponse({ success: true });
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });
  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(findTelegramButton(telegramPayload, '取餐导航')?.url, 'https://maps.example.com/shop-a');
});

test('accept update_status 调用会透传 cookie 和 authorization 头', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson({ telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 } }),
  }));

  const response = await handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'admin_session=abc123', authorization: 'Bearer test-token' },
    body: JSON.stringify({ callbackData: createCallback('accept', Date.now() + 60_000), chatId: TEST_CHAT_ID }),
  }));
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  assert.equal(response.status, 200);
  assert.ok(updateCall);
  assert.equal(updateCall.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(updateCall.headers.get('authorization'), 'Bearer test-token');
});
