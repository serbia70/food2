import assert from 'node:assert/strict';
import test from 'node:test';

import { handleTelegramRiderClaim } from '../../../src/pages/api/telegram/rider-claim.ts';
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
} from '../rider/rider-progress-test-helpers.ts';

test('stale picked_up callback 在 delivering 且当前骑手匹配时可成功推进', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({ status: 'delivering', remarksJson: createRemarksJson() }));
  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.strictEqual(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  assert.match(updateCall.body, /"expectedCurrentStatus":"delivering"/);
  assert.match(updateCall.body, /"status":"picked_up"/);
});

test('stale accept callback 仍返回 expired_callback', async (t) => {
  useTestEnv(t);
  useMockFetch(t, async () => {
    throw new Error('fetch should not be called');
  });
  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() - 1_000)));
  const body = await readJson(response);
  assert.equal(response.status, 400);
  assert.equal(body.error, 'expired_callback');
});

test('stale complete callback 在订单已完成时返回 order_completed', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({ status: 'completed', remarksJson: createRemarksJson() }));
  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);
  assert.equal(response.status, 409);
  assert.equal(body.error, 'order_completed');
  assert.ok(!calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('配送阶段状态已变化时优先返回 order_status_updated', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({ status: 'awaiting_courier', remarksJson: createRemarksJson() }));
  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  assert.equal(response.status, 409);
  assert.equal(body.error, 'order_status_updated');
  assert.ok(!calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('配送阶段当前骑手不匹配时优先返回 dispatch_invalidated', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({ status: 'delivering', remarksJson: createRemarksJson({ currentRiderId: '303' }) }));
  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  assert.equal(response.status, 409);
  assert.equal(body.error, 'dispatch_invalidated');
  assert.equal(body.reason, '已改派');
  assert.ok(!calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('配送阶段 admin orders 未授权时回退 rider orders 仍能推进 picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [{ id: TEST_RIDER_ID, name: TEST_RIDER_NAME, phone: TEST_RIDER_PHONE, telegramChatId: TEST_CHAT_ID, status: 'available' }] });
    }
    if (url.pathname === '/api/admin/orders') return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    if (url.pathname === '/api/rider/orders') return jsonResponse({ success: true, orders: [createOrderRow({ status: 'delivering', remarksJson: createRemarksJson() })] });
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  assert.strictEqual(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.ok(calls.some((call) => call.url.includes('/api/rider/orders?phone=')));
});

test('配送阶段 remarksJson 为空但订单仍属于当前骑手时可推进 picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({ status: 'delivering', remarksJson: '', courierPhone: TEST_RIDER_PHONE }));
  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  assert.strictEqual(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.ok(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)));
});

test('picked_up writes pickedUpAt and edits original telegram message instead of sending new one', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({ acceptedAt, telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 } }),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  const updatePayload = JSON.parse(updateCall.body) as { id?: unknown; remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(updatePayload.remarksJson || '');
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.match(nextMeta.pickedUpAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(telegramCalls.length, 1);
  assert.match(telegramCalls[0].body, /"message_id":7788/);
});

test('picked_up 更新成功后即使二次读取订单失败也必须编辑原消息', async (t) => {
  useTestEnv(t);
  let adminOrdersReads = 0;
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [{ id: TEST_RIDER_ID, name: TEST_RIDER_NAME, phone: TEST_RIDER_PHONE, telegramChatId: TEST_CHAT_ID, status: 'available' }] });
    }
    if (url.pathname === '/api/admin/orders') {
      adminOrdersReads += 1;
      if (adminOrdersReads === 1) {
        return jsonResponse([createOrderRow({
          status: 'delivering',
          remarksJson: createRemarksJson({ acceptedAt: '2026-04-14T10:03:00.000Z', telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 } }),
          shopSlug: 'real-shop',
        })]);
      }
      return jsonResponse([], 200);
    }
    if (url.pathname === '/api/rider/orders') return jsonResponse({ success: true, orders: [] });
    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) return jsonResponse({ success: true });
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });
  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));
  assert.equal(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.ok(findTelegramButton(telegramPayload, '送达'));
});

test('picked_up 编辑消息时使用订单真实 shopSlug 且 complete callback 不回退 admin', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({ acceptedAt: '2026-04-14T10:03:00.000Z', telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 } }),
    shopSlug: 'real-shop',
  }));
  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));
  assert.equal(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.ok(telegramCall);
  assert.match(telegramCall.body, /"shopSlug":"real-shop"/);
});

test('complete edits original telegram message to readonly delivered state without action buttons', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson: createRemarksJson({
      acceptedAt: '2026-04-14T10:03:00.000Z',
      pickedUpAt: '2026-04-14T10:19:00.000Z',
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));
  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));
  assert.equal(response.status, 200);
  assert.equal(body.action, 'complete');
  assert.match(telegramPayload.text || '', /状态：已送达/);
  assert.ok(!findTelegramButton(telegramPayload, '送达'));
});

