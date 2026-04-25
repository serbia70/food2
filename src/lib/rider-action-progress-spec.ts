import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as riderActionPost } from '../pages/api/rider/action.ts';
import {
  createActionRequest,
  createFetchHandler,
  createRemarksJson,
  findTelegramButton,
  flattenTelegramButtonTexts,
  readDispatchMetaFromRemarks,
  readJson,
  readTelegramSendPayload,
  TEST_ORDER_ID,
  TEST_RIDER_ID,
  TEST_RIDER_NAME,
  TEST_RIDER_PHONE,
  useMockFetch,
  useMockNowIso,
  useTestEnv,
} from './rider-action-test-helpers.ts';

test('accept 主链路先写 admin remarks 再 update_status，并把 Telegram 原消息切到待取餐', async (t) => {
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
      telegramMessageRef: { chatId: '123456789', messageId: 7788 },
    }),
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'accept',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
      shopSlug: 'real-shop',
    }),
  } as never);
  const body = await readJson(response);
  const remarksCall = calls.find((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'accept');
  assert.ok(remarksCall);
  const remarksPayload = JSON.parse(remarksCall.body) as { remarks?: string[] };
  const nextMeta = readDispatchMetaFromRemarks(JSON.stringify(remarksPayload.remarks || []));
  assert.equal(nextMeta.currentRiderId, String(TEST_RIDER_ID));
  assert.ok(findTelegramButton(telegramPayload, '取餐'));
  assert.ok(!flattenTelegramButtonTexts(telegramPayload).includes('送达'));
});

test('picked_up 复用单次 nowIso 并同步编辑 telegram 原消息为送达按钮', async (t) => {
  useTestEnv(t);
  const fixedNowIso = '2026-04-14T10:25:30.000Z';
  useMockNowIso(t, fixedNowIso);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt: '2026-04-14T10:03:00.000Z',
      telegramMessageRef: { chatId: '123456789', messageId: 7788 },
    }),
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'picked_up',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(updatePayload.remarksJson || '');
  assert.equal(nextMeta.pickedUpAt, fixedNowIso);
  assert.ok(findTelegramButton(telegramPayload, '送达'));
});

test('picked_up 缺少订单 shopSlug 时使用请求体回退 shop slug 保留送达按钮', async (t) => {
  useTestEnv(t);
  useMockNowIso(t, '2026-04-14T10:40:00.000Z');
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt: '2026-04-14T10:03:00.000Z',
      telegramMessageRef: { chatId: '123456789', messageId: 7788 },
    }),
    shopSlug: '',
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'picked_up',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
      shopSlug: 'dashboard-shop',
    }),
  } as never);
  const body = await readJson(response);
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'picked_up');
  assert.equal(telegramPayload.shopSlug, 'dashboard-shop');
  assert.ok(findTelegramButton(telegramPayload, '送达'));
});

test('complete 写入 completedAt 并同步编辑 telegram 原消息为只读送达态', async (t) => {
  useTestEnv(t);
  const fixedNowIso = '2026-04-14T10:55:00.000Z';
  useMockNowIso(t, fixedNowIso);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson: createRemarksJson({
      acceptedAt: '2026-04-14T10:03:00.000Z',
      pickedUpAt: '2026-04-14T10:19:00.000Z',
      telegramMessageRef: { chatId: '123456789', messageId: 7788 },
    }),
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'complete',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramPayload = readTelegramSendPayload(calls.find((call) => call.url.endsWith('/api/telegram/send')));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'complete');
  assert.ok(updateCall);
  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(updatePayload.remarksJson || '');
  assert.equal(nextMeta.completedAt, fixedNowIso);
  assert.ok(!findTelegramButton(telegramPayload, '送达'));
  assert.ok(flattenTelegramButtonTexts(telegramPayload).includes('送餐导航'));
});
