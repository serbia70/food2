import assert from 'node:assert/strict';
import test from 'node:test';

import { handleTelegramRiderClaim } from '../pages/api/telegram/rider-claim.ts';
import {
  createDeclineCallback,
  createOrderRow,
  createRemarksJson,
  createRequest,
  jsonResponse,
  readDispatchMetaFromRemarks,
  readJson,
  TEST_CHAT_ID,
  TEST_ORDER_ID,
  TEST_RIDER_ID,
  TEST_RIDER_NAME,
  TEST_RIDER_PHONE,
  useMockFetch,
  useTestEnv,
} from './telegram-rider-claim-test-helpers.ts';

test('decline 通过共享 actionDecision 的单一路径写回 update_status remarks 且不走 admin remarks', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [{ id: TEST_RIDER_ID, name: TEST_RIDER_NAME, phone: TEST_RIDER_PHONE, telegramChatId: TEST_CHAT_ID, status: 'available' }] });
    }
    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({ status: 'awaiting_courier', remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }) })]);
    }
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/rider-dispatch') return jsonResponse({ success: false }, 500);
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createDeclineCallback(Date.now() + 60_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  assert.equal(response.status, 200);
  assert.equal(body.action, 'decline');
  assert.ok(updateCall);
  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(updatePayload.remarksJson || '');
  assert.equal(nextMeta.lastRiderDecision?.action, 'declined');
  assert.ok(!calls.some((call) => call.url.endsWith('/api/admin/orders/remarks')));
});

test('decline 自动续派在 rider-dispatch 返回 success true 且 telegram_dispatch delivered 时必须返回 reassigned true', async (t) => {
  useTestEnv(t);
  const nextRiderId = '303';
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          { id: TEST_RIDER_ID, name: TEST_RIDER_NAME, phone: TEST_RIDER_PHONE, telegramChatId: TEST_CHAT_ID, status: 'available' },
          { id: nextRiderId, name: 'Rider 2', phone: '381641111111', telegramChatId: '987654321', status: 'available' },
        ],
      });
    }
    if (url.pathname === '/api/admin/orders') return jsonResponse([createOrderRow({ status: 'awaiting_courier', remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }) })]);
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({ success: true, telegram_dispatch: { failedCount: 0, skippedReason: '', attempts: [{ riderId: nextRiderId, delivered: true }] } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });
  const response = await handleTelegramRiderClaim(createRequest(createDeclineCallback(Date.now() + 60_000)));
  const body = await readJson(response);
  const redispatchCall = calls.find((call) => call.url.endsWith('/api/admin/rider-dispatch'));
  assert.equal(response.status, 200);
  assert.ok(body.reassigned);
  assert.ok(redispatchCall);
});

test('decline 自动续派不得再把 deliveredCount 当作 reassigned 成功判据', async (t) => {
  useTestEnv(t);
  const nextRiderId = '303';
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          { id: TEST_RIDER_ID, name: TEST_RIDER_NAME, phone: TEST_RIDER_PHONE, telegramChatId: TEST_CHAT_ID, status: 'available' },
          { id: nextRiderId, name: 'Rider 2', phone: '381641111111', telegramChatId: '987654321', status: 'available' },
        ],
      });
    }
    if (url.pathname === '/api/admin/orders') return jsonResponse([createOrderRow({ status: 'awaiting_courier', remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }) })]);
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({ success: true, telegram_dispatch: { deliveredCount: 1, failedCount: 0, skippedReason: '', attempts: [{ riderId: nextRiderId, delivered: false }] } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });
  const response = await handleTelegramRiderClaim(createRequest(createDeclineCallback(Date.now() + 60_000)));
  const body = await readJson(response);
  assert.equal(response.status, 200);
  assert.ok(!body.reassigned);
});

test('decline 自动续派在 rider-dispatch 返回 success true 但 telegram_dispatch 失败时必须保持 reassigned false', async (t) => {
  useTestEnv(t);
  const nextRiderId = '303';
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          { id: TEST_RIDER_ID, name: TEST_RIDER_NAME, phone: TEST_RIDER_PHONE, telegramChatId: TEST_CHAT_ID, status: 'available' },
          { id: nextRiderId, name: 'Rider 2', phone: '381641111111', telegramChatId: '987654321', status: 'available' },
        ],
      });
    }
    if (url.pathname === '/api/admin/orders') return jsonResponse([createOrderRow({ status: 'awaiting_courier', remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }) })]);
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/rider-dispatch') return jsonResponse({ success: true, telegram_dispatch: { failedCount: 1, skippedReason: 'no_telegram_bound_riders' } });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });
  const response = await handleTelegramRiderClaim(createRequest(createDeclineCallback(Date.now() + 60_000)));
  const body = await readJson(response);
  assert.equal(response.status, 200);
  assert.ok(!body.reassigned);
});

test('decline update_status 调用会透传 cookie 和 authorization 头', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [{ id: TEST_RIDER_ID, name: TEST_RIDER_NAME, phone: TEST_RIDER_PHONE, telegramChatId: TEST_CHAT_ID, status: 'available' }] });
    }
    if (url.pathname === '/api/admin/orders') return jsonResponse([createOrderRow({ status: 'awaiting_courier', remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }) })]);
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/admin/rider-dispatch') return jsonResponse({ success: false }, 500);
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'admin_session=abc123', authorization: 'Bearer test-token' },
    body: JSON.stringify({ callbackData: createDeclineCallback(Date.now() + 60_000), chatId: TEST_CHAT_ID }),
  }));
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  assert.equal(response.status, 200);
  assert.ok(updateCall);
  assert.equal(updateCall.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(updateCall.headers.get('authorization'), 'Bearer test-token');
});
