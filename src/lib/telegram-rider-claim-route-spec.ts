import assert from 'node:assert/strict';
import test from 'node:test';

import { readDispatchMetaFromRemarks } from './rider-dispatch.ts';
import { buildTelegramShortClaimCallback } from './telegram-dispatch.ts';
import {
  createCallback,
  createFetchHandler,
  createOrderRow,
  createRemarksJson,
  createRequest,
  jsonResponse,
  readJson,
  TEST_CHAT_ID,
  TEST_ORDER_ID,
  TEST_RIDER_ID,
  TEST_RIDER_NAME,
  TEST_RIDER_PHONE,
  useMockFetch,
  useTestEnv,
} from './telegram-rider-claim-spec-helpers.ts';
import {
  handleTelegramDeclineAction,
  handleTelegramNonDeclineAction,
  handleTelegramProgressActionTransition,
  handleTelegramProgressSubmission,
  handleTelegramRiderClaim,
} from '../pages/api/telegram/rider-claim.ts';

function readCallJson(call: { body: string } | undefined): Record<string, unknown> {
  assert.ok(call, 'expected mocked fetch call');
  return JSON.parse(call.body) as Record<string, unknown>;
}

function readTelegramText(call: { body: string } | undefined): string {
  return String(readCallJson(call).text || '');
}

function readTelegramInlineKeyboard(call: { body: string } | undefined): unknown[][] {
  const replyMarkup = readCallJson(call).reply_markup as { inline_keyboard?: unknown[][] } | undefined;
  if (!Array.isArray(replyMarkup?.inline_keyboard)) return [];
  return replyMarkup.inline_keyboard
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.filter((button) => {
      if (!button || typeof button !== 'object') return false;
      const candidate = button as { text?: unknown; callback_data?: unknown; url?: unknown };
      return typeof candidate.text === 'string'
        && (typeof candidate.callback_data === 'string' || typeof candidate.url === 'string');
    }));
}

test('readTelegramInlineKeyboard 只保留合法按钮行', () => {
  const inlineKeyboard = readTelegramInlineKeyboard({
    body: JSON.stringify({
      reply_markup: {
        inline_keyboard: [
          [{ text: '取餐', callback_data: 'pickup' }],
          null,
          'invalid-row',
          [{ text: '送达', callback_data: 'complete' }],
        ],
      },
    }),
  });

  assert.deepEqual(inlineKeyboard, [
    [{ text: '取餐', callback_data: 'pickup' }],
    [{ text: '送达', callback_data: 'complete' }],
  ]);
});

test('readTelegramInlineKeyboard 过滤非法按钮项', () => {
  const inlineKeyboard = readTelegramInlineKeyboard({
    body: JSON.stringify({
      reply_markup: {
        inline_keyboard: [
          [
            { text: '取餐', callback_data: 'pickup' },
            null,
            'invalid-button',
            { callback_data: 'missing-text' },
          ],
        ],
      },
    }),
  });

  assert.deepEqual(inlineKeyboard, [
    [{ text: '取餐', callback_data: 'pickup' }],
  ]);
});

test('stale picked_up callback 在 delivering 且当前骑手匹配时可成功推进', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramSendCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  const updatePayload = readCallJson(updateCall);
  assert.equal(updatePayload.expectedCurrentStatus, 'delivering');
  assert.equal(updatePayload.status, 'picked_up');
  assert.equal(telegramSendCall, undefined);
});

test('stale accept callback 仍返回 expired_callback', async (t) => {
  useTestEnv(t);
  useMockFetch(t, async () => {
    throw new Error('fetch should not be called');
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'expired_callback');
});

test('stale complete callback 在订单已完成时返回 order_completed', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'completed',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_completed');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
});

test('配送阶段状态已变化时优先返回 order_status_updated', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_status_updated');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
});

test('配送阶段当前骑手不匹配时优先返回 dispatch_invalidated', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({ currentRiderId: '303' }),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'dispatch_invalidated');
  assert.equal(body.reason, '已改派');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
});

test('配送阶段 admin orders 未授权时回退 rider orders 仍能推进 picked_up', async (t) => {
  useTestEnv(t);
  const remarksJson = createRemarksJson();
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    }

    if (url.pathname === '/api/rider/orders') {
      return jsonResponse({
        success: true,
        orders: [
          createOrderRow({ status: 'delivering', remarksJson }),
        ],
      });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(calls.some((call) => call.url.includes('/api/rider/orders?phone=')), true);
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
});

test('配送阶段 remarksJson 为空但订单仍属于当前骑手时可推进 picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: '',
    courierPhone: TEST_RIDER_PHONE,
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
});

test('short callback chatId 不匹配时直接返回 rider_identity_mismatch 且不查询 rider 列表', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegram_chat_id: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callbackData: createCallback('picked_up', Date.now() - 1_000),
      chatId: '999999999',
    }),
  }));
  const body = await readJson(response);
  const riderStatusCalls = calls.filter((call) => call.url.includes('/api/rider/status?action=list_available'));

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'rider_identity_mismatch');
  assert.equal(riderStatusCalls.length, 0);
});

test('short callback 已携带骑手身份时可直接推进 picked_up 且不查询 rider 列表', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'delivering',
        remarksJson: createRemarksJson(),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const riderStatusCalls = calls.filter((call) => call.url.includes('/api/rider/status?action=list_available'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
  assert.equal(riderStatusCalls.length, 0);
});


test('short callback 不依赖 snake_case rider 列表身份也能推进 picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegram_chat_id: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'delivering',
        remarksJson: createRemarksJson(),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const riderStatusCalls = calls.filter((call) => call.url.includes('/api/rider/status?action=list_available'));
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(riderStatusCalls.length, 0);
  const updatePayload = readCallJson(updateCall);
  assert.equal(String(updatePayload.courierName || ''), 'Rider_1');
});

test('picked_up writes pickedUpAt and edits original telegram message instead of sending new one', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt,
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');

  const updatePayload = readCallJson(updateCall) as { id?: unknown; remarksJson?: string };
  assert.equal(updatePayload.id, TEST_ORDER_ID);
  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.match(nextMeta.pickedUpAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(nextMeta.completedAt, '');
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: TEST_CHAT_ID, messageId: 7788 });

  assert.equal(telegramCalls.length, 1);
  const telegramPayload = readCallJson(telegramCalls[0]);
  const telegramText = readTelegramText(telegramCalls[0]);
  const inlineKeyboard = readTelegramInlineKeyboard(telegramCalls[0]);
  assert.equal(telegramPayload.message_id, 7788);
  assert.equal(telegramPayload.chat_id, TEST_CHAT_ID);
  assert.match(telegramText, /状态：配送中/);
  assert.match(telegramText, /接单时间：12:03/);
  assert.match(telegramText, /取餐时间：\d{2}:\d{2}/);
  assert.doesNotMatch(telegramText, /取餐时间：\d{4}-\d{2}-\d{2}T/);
  assert.match(telegramText, /菜品：/);
  assert.match(telegramText, /土豆牛肉饼 \/ Pljeskavica x2 · 600 RSD/);
  assert.match(telegramText, /可乐 \/ Coca-Cola x1 · 200 RSD/);
  assert.doesNotMatch(telegramText, /已送达/);
  assert.doesNotMatch(telegramText, /Nova dodeljena porudžbina|Stavke/);
  assert.equal(telegramText.includes('Pizza One有新单'), false);
  assert.equal(JSON.stringify(inlineKeyboard).includes('送达'), true);
  assert.equal(inlineKeyboard.length > 0, true);
});

test('picked_up 更新成功后即使二次读取订单失败也必须编辑原消息', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  let adminOrdersReads = 0;
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      adminOrdersReads += 1;
      if (adminOrdersReads === 1) {
        return jsonResponse([createOrderRow({
          status: 'delivering',
          remarksJson: createRemarksJson({
            acceptedAt,
            telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
          }),
          shopSlug: 'real-shop',
        })]);
      }
      return jsonResponse([], 200);
    }

    if (url.pathname === '/api/rider/orders') {
      return jsonResponse({ success: true, orders: [] });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(telegramCalls.length, 1);
  const telegramText = readTelegramText(telegramCalls[0]);
  const inlineKeyboard = readTelegramInlineKeyboard(telegramCalls[0]);
  assert.match(telegramText, /状态：配送中/);
  assert.equal(JSON.stringify(inlineKeyboard).includes('送达'), true);
  assert.equal(JSON.stringify(inlineKeyboard).includes('callback_data'), true);
});

test('picked_up 编辑消息时使用订单真实 shopSlug 且 complete callback 不回退 admin', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt: '2026-04-14T10:03:00.000Z',
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
    shopSlug: 'real-shop',
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);
  const telegramCall = calls.find((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(telegramCall);
  const telegramPayload = readCallJson(telegramCall);
  assert.equal(telegramPayload.shopSlug, 'real-shop');
  assert.equal(JSON.stringify(telegramPayload).includes('real-shop'), true);
  assert.equal(JSON.stringify(telegramPayload).includes('admin'), false);
});

 test('complete edits original telegram message to readonly delivered state without action buttons', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const pickedUpAt = '2026-04-14T10:19:00.000Z';
  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson: createRemarksJson({
      acceptedAt,
      pickedUpAt,
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'complete');

  const updatePayload = readCallJson(updateCall) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.equal(nextMeta.pickedUpAt, pickedUpAt);
  assert.match(nextMeta.completedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: TEST_CHAT_ID, messageId: 7788 });

  assert.equal(telegramCalls.length, 1);
  const telegramPayload = readCallJson(telegramCalls[0]);
  const telegramText = readTelegramText(telegramCalls[0]);
  const inlineKeyboard = readTelegramInlineKeyboard(telegramCalls[0]);
  assert.equal(telegramPayload.message_id, 7788);
  assert.match(telegramText, /状态：已送达/);
  assert.match(telegramText, /接单时间：12:03/);
  assert.match(telegramText, /取餐时间：12:19/);
  assert.match(telegramText, /送达时间：\d{2}:\d{2}/);
  assert.doesNotMatch(telegramText, /送达时间：\d{4}-\d{2}-\d{2}T/);
  assert.match(telegramText, /菜品：/);
  assert.match(telegramText, /土豆牛肉饼 \/ Pljeskavica x2 · 600 RSD/);
  assert.match(telegramText, /可乐 \/ Coca-Cola x1 · 200 RSD/);
  assert.equal(telegramText.includes('Nova dodeljena porudžbina'), false);
  assert.equal(telegramText.includes('Stavke'), false);
  assert.equal(telegramText.includes('Pizza One有新单'), false);
  assert.equal(JSON.stringify(inlineKeyboard).includes('callback_data'), false);
  assert.equal(inlineKeyboard.length > 0, true);
});

test('配送阶段 admin orders 只返回 remarks_json 时仍能识别当前骑手并推进 picked_up', async (t) => {
  useTestEnv(t);
  const remarksJson = createRemarksJson();
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          ...createOrderRow({ status: 'delivering', remarksJson: '' }),
          remarksJson: '',
          remarks_json: remarksJson,
        },
      ]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
});

test('配送阶段 admin orders 返回对象包装时仍能识别当前骑手并推进 picked_up', async (t) => {
  useTestEnv(t);
  const remarksJson = createRemarksJson();
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({
        success: true,
        orders: [
          {
            ...createOrderRow({ status: 'delivering', remarksJson: '' }),
            remarksJson: '',
            remarks_json: remarksJson,
          },
        ],
      });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
});

test('picked_up 调用 update_status 返回 409 时透传业务错误', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }, {
    updateStatusOk: false,
    updateStatusStatus: 409,
    updateStatusBody: { success: false, error: 'order_status_updated' },
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('picked_up', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_status_updated');
  assert.equal(body.action, undefined);
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
});

test('complete 调用 update_status 返回 409 时透传业务错误', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson: createRemarksJson(),
  }, {
    updateStatusOk: false,
    updateStatusStatus: 409,
    updateStatusBody: { success: false, error: 'dispatch_invalidated', reason: '已改派' },
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'dispatch_invalidated');
  assert.equal(body.reason, '已改派');
  assert.equal(body.action, undefined);
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), true);
});

test('complete 在订单快照仍为 delivering 时返回 order_status_updated 且不调用 update_status', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('complete', Date.now() - 1_000)));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_status_updated');
  assert.equal(calls.some((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`)), false);
});

test('handleTelegramProgressActionTransition 统一处理 complete 分支的同步与回包', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const pickedUpAt = '2026-04-14T10:19:00.000Z';
  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson: createRemarksJson({
      acceptedAt,
      pickedUpAt,
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));

  const response = await handleTelegramProgressActionTransition({
    request: createRequest(createCallback('complete', Date.now() + 60_000)),
    callback: {
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      restaurantId: 'shop-1',
      action: 'complete',
    },
    actionDecision: {
      targetStatus: 'completed',
    },
    orderIdText: String(TEST_ORDER_ID),
    riderIdText: String(TEST_RIDER_ID),
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
    nextRemarksJson: createRemarksJson({
      acceptedAt,
      pickedUpAt,
      completedAt: '2026-04-14T10:55:00.000Z',
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
    orderDetailForProgress: createOrderRow({
      status: 'picked_up',
      remarksJson: createRemarksJson({
        acceptedAt,
        pickedUpAt,
        telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
      }),
    }),
    upstream: jsonResponse({ success: true }),
    text: JSON.stringify({ success: true }),
  });
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'complete');
  assert.equal(telegramCalls.length, 1);
  const telegramText = readTelegramText(telegramCalls[0]);
  assert.match(telegramText, /状态：已送达/);
});

test('handleTelegramProgressSubmission 统一处理 feedback 写入与 update_status 提交', async (t) => {
  useTestEnv(t);
  const baseRemarksJson = createRemarksJson();
  const nextRemarksJson = createRemarksJson();
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await handleTelegramProgressSubmission({
    request: createRequest(createCallback('accept', Date.now() + 60_000)),
    callback: {
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      action: 'accept',
    },
    orderIdText: String(TEST_ORDER_ID),
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
    chatId: TEST_CHAT_ID,
    nowIso: '2026-04-17T10:00:00.000Z',
    orderDetailForProgress: createOrderRow({
      status: 'awaiting_courier',
      remarksJson: baseRemarksJson,
    }),
    actionDecision: {
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: 'delivering',
      feedbackWriteMode: 'admin_remarks',
      nextRemarksJson,
    },
  });
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(result.feedbackWritten, true);
  assert.equal(result.nextRemarksJson, nextRemarksJson);
  assert.equal(result.text, JSON.stringify({ success: true }));
  assert.equal(result.upstream.status, 200);
  assert.ok(updateCall);
  const updatePayload = readCallJson(updateCall);
  assert.equal(updatePayload.id, TEST_ORDER_ID);
  assert.equal(updatePayload.status, 'delivering');
  assert.equal(updatePayload.courierName, TEST_RIDER_NAME);
  assert.equal(updatePayload.courierPhone, TEST_RIDER_PHONE);
});

test('handleTelegramNonDeclineAction 串联 submission 与 transition', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const response = await handleTelegramNonDeclineAction({
    request: createRequest(createCallback('picked_up', Date.now() + 60_000)),
    callback: {
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      restaurantId: 'shop-1',
      action: 'picked_up',
    },
    orderIdText: String(TEST_ORDER_ID),
    riderIdText: String(TEST_RIDER_ID),
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
    chatId: TEST_CHAT_ID,
    nowIso: '2026-04-17T10:00:00.000Z',
    orderDetailForProgress: createOrderRow({
      status: 'delivering',
      remarksJson: createRemarksJson({
        acceptedAt,
        telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
      }),
    }),
    actionDecision: {
      expectedCurrentStatus: 'delivering',
      targetStatus: 'picked_up',
      feedbackWriteMode: 'update_status_remarks',
      nextRemarksJson: createRemarksJson({
        acceptedAt,
        telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
      }),
    },
  });
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);
  assert.equal(telegramCalls.length, 1);
  const telegramText = readTelegramText(telegramCalls[0]);
  assert.match(telegramText, /状态：配送中/);
});

test('handleTelegramDeclineAction 通过共享 buildRiderProgressUpdate 生成 decline payload', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [] });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramDeclineAction({
    request: createRequest(createCallback('picked_up', Date.now() + 60_000)),
    callback: {
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    },
    actionDecision: {
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: 'awaiting_courier',
      feedbackWriteMode: 'update_status_remarks',
      nextRemarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
      excludedRiderIds: [String(TEST_RIDER_ID)],
    },
    orderIdText: String(TEST_ORDER_ID),
    riderIdText: String(TEST_RIDER_ID),
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
    chatId: TEST_CHAT_ID,
  });
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'decline');
  assert.ok(updateCall);
  const updatePayload = readCallJson(updateCall);
  assert.equal(updatePayload.id, TEST_ORDER_ID);
  assert.equal(Object.prototype.hasOwnProperty.call(updatePayload, 'courierName'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(updatePayload, 'courierPhone'), false);
});

test('decline 通过共享 actionDecision 的单一路径写回 update_status remarks 且不走 admin remarks', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({ success: false }, 500);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const declineCallback = createCallback('decline', Date.now() + 60_000);
  const response = await handleTelegramRiderClaim(createRequest(declineCallback));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'decline');
  assert.ok(updateCall);
  assert.equal(calls.some((call) => call.url.endsWith('/api/admin/orders/remarks')), false);

  const updatePayload = readCallJson(updateCall) as {
    expectedCurrentStatus?: string;
    status?: string;
    remarksJson?: string;
  };
  assert.equal(updatePayload.expectedCurrentStatus, 'awaiting_courier');
  assert.equal(updatePayload.status, 'awaiting_courier');
  assert.equal(typeof updatePayload.remarksJson, 'string');

  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
  assert.equal(nextMeta.lastRiderDecision?.action, 'declined');
  assert.equal(nextMeta.lastRiderDecision?.riderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.lastRiderDecision?.riderPhone, TEST_RIDER_PHONE);
  assert.equal(nextMeta.currentRiderId, '');
  assert.deepEqual(nextMeta.declinedRiderIds, ['404', String(TEST_RIDER_ID)]);
  assert.deepEqual(nextMeta.invalidatedRiderIds, [String(TEST_RIDER_ID)]);
  assert.equal(nextMeta.lastInvalidationReason, 'declined');
  assert.equal(Object.prototype.hasOwnProperty.call(updatePayload, 'courierName'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(updatePayload, 'courierPhone'), false);
});

test('decline update_status 调用会透传 cookie 和 authorization 头', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
      })]);
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/rider-dispatch') {
      return jsonResponse({ success: false }, 500);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const declineCallback = createCallback('decline', Date.now() + 60_000);
  const response = await handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify({ callbackData: declineCallback, chatId: TEST_CHAT_ID }),
  }));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(updateCall);
  assert.equal(updateCall.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(updateCall.headers.get('authorization'), 'Bearer test-token');
});

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
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_status_updated');
  assert.equal(calls.some((call) => call.url.endsWith('/api/telegram/send')), false);
});

test('accept 成功时即使 list_available 不再返回当前骑手，也必须编辑出取餐按钮', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const existingRemarksJson = createRemarksJson({
    currentAssignedAt,
    currentExpiresAt,
    invalidatedRiderIds: ['303'],
    declinedRiderIds: ['404'],
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  });
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [] });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: existingRemarksJson,
      })]);
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(telegramCalls.length, 1);
  const inlineKeyboard = readTelegramInlineKeyboard(telegramCalls[0]);
  assert.equal(JSON.stringify(inlineKeyboard).includes('取餐'), true);
  assert.equal(JSON.stringify(inlineKeyboard).includes('callback_data'), true);
  assert.notDeepEqual(inlineKeyboard, []);
});

test('accept 成功时订单只有 restaurantId 也必须编辑出取餐按钮', async (t) => {
  useTestEnv(t);
  const existingRemarksJson = createRemarksJson({
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  });
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [] });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          ...createOrderRow({
            status: 'awaiting_courier',
            remarksJson: existingRemarksJson,
            shopSlug: '',
          }),
          shopSlug: '',
          restaurantId: 103,
        },
      ]);
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(telegramCalls.length, 1);
  const telegramPayload = readCallJson(telegramCalls[0]);
  const inlineKeyboard = readTelegramInlineKeyboard(telegramCalls[0]);
  assert.equal(telegramPayload.shopSlug, '103');
  assert.equal(JSON.stringify(inlineKeyboard).includes('取餐'), true);
  assert.equal(JSON.stringify(inlineKeyboard).includes('callback_data'), true);
  assert.notDeepEqual(inlineKeyboard, []);
});

test('accept 成功时写回 dispatch_meta 保留当前骑手位，并把 Telegram 原消息切到待取餐', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const existingRemarksJson = createRemarksJson({
    currentAssignedAt,
    currentExpiresAt,
    invalidatedRiderIds: ['303'],
    declinedRiderIds: ['404'],
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  });
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: existingRemarksJson,
  }));

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const remarksCall = calls.find((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(remarksCall);
  assert.ok(updateCall);

  const remarksPayload = JSON.parse(remarksCall.body) as { remarks?: string[] };
  assert.ok(Array.isArray(remarksPayload.remarks), 'remarks must be a string array');
  const nextMeta = readDispatchMetaFromRemarks(JSON.stringify(remarksPayload.remarks));

  assert.equal(nextMeta.lastRiderDecision?.action, 'accepted');
  assert.equal(nextMeta.lastRiderDecision?.riderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.currentRiderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.currentAssignedAt, currentAssignedAt);
  assert.equal(nextMeta.currentExpiresAt, currentExpiresAt);
  assert.deepEqual(nextMeta.invalidatedRiderIds, ['303']);
  assert.equal(nextMeta.lastInvalidationReason, null);
  assert.deepEqual(nextMeta.declinedRiderIds, []);
  assert.equal(updateCall.headers.get('cookie'), null);
  assert.equal(updateCall.headers.get('authorization'), null);
  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0]?.url, 'https://example.com/api/telegram/send');
  const telegramPayload = readCallJson(telegramCalls[0]);
  const telegramText = readTelegramText(telegramCalls[0]);
  const inlineKeyboard = readTelegramInlineKeyboard(telegramCalls[0]);
  assert.equal(telegramPayload.message_id, 7788);
  assert.match(telegramText, /状态：待取餐/);
  assert.equal(JSON.stringify(inlineKeyboard).includes('取餐'), true);
  assert.equal(JSON.stringify(inlineKeyboard).includes('callback_data'), true);
  assert.notDeepEqual(inlineKeyboard, []);
  assert.equal(JSON.stringify(inlineKeyboard).includes('送达'), false);
});

test('accept 成功时 admin orders 未授权且回退 rider orders 仍保留取餐导航', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const existingRemarksJson = createRemarksJson({
    currentAssignedAt,
    currentExpiresAt,
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  });
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ riders: [] });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    }

    if (url.pathname === '/api/rider/orders') {
      return jsonResponse({
        success: true,
        orders: [
          {
            ...createOrderRow({
              status: 'awaiting_courier',
              remarksJson: existingRemarksJson,
            }),
            shopAddress: '',
            restaurantAddress: 'Bulevar 1',
            shopMapUrl: 'https://maps.example.com/shop-a',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(calls.some((call) => call.url.includes('/api/rider/orders?phone=')), true);
  assert.equal(telegramCalls.length, 1);
  const telegramText = readTelegramText(telegramCalls[0]);
  const inlineKeyboard = readTelegramInlineKeyboard(telegramCalls[0]);
  assert.match(telegramText, /状态：待取餐/);
  assert.equal(JSON.stringify(inlineKeyboard).includes('取餐导航'), true);
  assert.equal(JSON.stringify(inlineKeyboard).includes('送餐导航'), true);
  assert.equal(JSON.stringify(inlineKeyboard).includes('https://maps.example.com/shop-a'), true);
  assert.equal(JSON.stringify(inlineKeyboard).includes('取餐'), true);
});

test('accept with admin restaurantId still keeps pickup action by resolving real shop slug from order detail', async (t) => {
  useTestEnv(t);
  const existingRemarksJson = createRemarksJson({
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  });
  const adminCallback = buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'admin',
    telegramChatId: TEST_CHAT_ID,
    action: 'accept',
    expiresAt: Date.now() + 60_000,
  });
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: existingRemarksJson,
    shopSlug: 'real-shop',
  }));

  const response = await handleTelegramRiderClaim(createRequest(adminCallback));
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(telegramCalls.length, 1);
  const telegramPayload = readCallJson(telegramCalls[0]);
  const buttons = readTelegramInlineKeyboard(telegramCalls[0]).flat();
  const pickupButton = buttons.find((button) => {
    const candidate = button as { text?: unknown; callback_data?: unknown };
    return candidate.text === '取餐' && typeof candidate.callback_data === 'string';
  });
  const completeButton = buttons.find((button) => {
    const candidate = button as { text?: unknown };
    return candidate.text === '送达';
  });
  assert.equal(telegramPayload.shopSlug, 'real-shop');
  assert.equal(typeof pickupButton, 'object');
  assert.equal(completeButton, undefined);
});

test('picked_up with admin restaurantId still keeps complete action by resolving real shop slug from order detail', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const adminCallback = buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'admin',
    telegramChatId: TEST_CHAT_ID,
    action: 'picked_up',
    expiresAt: Date.now() - 1_000,
  });
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt,
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
    shopSlug: 'real-shop',
  }));

  const response = await handleTelegramRiderClaim(createRequest(adminCallback));
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(telegramCalls.length, 1);
  const telegramPayload = readCallJson(telegramCalls[0]);
  const buttons = readTelegramInlineKeyboard(telegramCalls[0]).flat();
  const completeButton = buttons.find((button) => {
    const candidate = button as { text?: unknown; callback_data?: unknown };
    return candidate.text === '送达' && typeof candidate.callback_data === 'string';
  });
  assert.equal(telegramPayload.shopSlug, 'real-shop');
  assert.equal(typeof completeButton, 'object');
});

test('accept update_status 调用会透传 cookie 和 authorization 头', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson({
      telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
    }),
  }));

  const response = await handleTelegramRiderClaim(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify({
      callbackData: createCallback('accept', Date.now() + 60_000),
      chatId: TEST_CHAT_ID,
    }),
  }));
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(updateCall);
  assert.equal(updateCall.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(updateCall.headers.get('authorization'), 'Bearer test-token');
});

test('accept 编辑原消息遇到 telegram 502 html 时会去掉 reply_markup 重试一次', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const existingRemarksJson = createRemarksJson({
    currentAssignedAt,
    currentExpiresAt,
    telegramMessageRef: { chatId: TEST_CHAT_ID, messageId: 7788 },
  });
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow({
        status: 'awaiting_courier',
        remarksJson: existingRemarksJson,
      })]);
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      const body = await request.clone().text();
      if (body.includes('reply_markup')) {
        return new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleTelegramRiderClaim(createRequest(createCallback('accept', Date.now() + 60_000)));
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(telegramCalls.length, 2);
  const firstTelegramPayload = readCallJson(telegramCalls[0]);
  const secondTelegramPayload = readCallJson(telegramCalls[1]);
  assert.equal(Object.prototype.hasOwnProperty.call(firstTelegramPayload, 'reply_markup'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(secondTelegramPayload, 'reply_markup'), false);
});

