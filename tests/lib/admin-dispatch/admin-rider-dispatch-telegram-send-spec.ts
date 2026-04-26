import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sendAdminAssignedOrderTelegramToRider,
  sendAdminPublishedOrderTelegramToRider,
  sendPreparedAdminTelegramToRider,
} from '../../../src/lib/rider-route-admin-telegram.ts';
import {
  findTelegramButton,
  jsonResponse,
  useMockFetch,
  useTestEnv,
} from './admin-rider-dispatch-telegram-test-helpers.ts';

test('sendPreparedAdminTelegramToRider 在 chat id 正常时发送，在 chat id 缺失时返回 telegram_chat_id_missing', async (t) => {
  const sentCalls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/api/telegram/send') {
      throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
    }
    return jsonResponse({ success: true, result: { message_id: 4455 } });
  });

  const outcome = await sendPreparedAdminTelegramToRider({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      headers: {
        authorization: 'Bearer admin-token',
        cookie: 'admin_token=admin-cookie',
      },
    }),
    rider: { id: '202', name: 'Rider 1', phone: '381641234567', telegram_chat_id: 'chat-1' },
    fallbackChatId: '',
    payloadBaseExtras: { shop_slug: 'shop-a', telegramBotToken: 'inline-token' },
    message: {
      text: 'prepared message',
      replyMarkup: { inline_keyboard: [[{ text: '接单', callback_data: 'claim' }]] },
    },
  });

  assert.deepEqual(outcome, { success: true, messageRef: { chatId: 'chat-1', messageId: 4455 } });
  assert.equal(sentCalls.length, 1);

  const missingChatOutcome = await sendPreparedAdminTelegramToRider({
    request: new Request('https://example.com/api/admin/rider-dispatch'),
    rider: { id: '202', telegramChatId: '   ' },
    fallbackChatId: '   ',
    payloadBaseExtras: { shop_slug: 'shop-a' },
    message: { text: 'prepared message' },
  });
  assert.deepEqual(missingChatOutcome, { success: false, error: 'telegram_chat_id_missing' });
});

test('sendAdminAssignedOrderTelegramToRider 在缺少 callback secret 时仍发送无接单按钮消息', async (t) => {
  useTestEnv(t);
  delete process.env.TELEGRAM_CALLBACK_SECRET;

  const sentCalls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/api/telegram/send') {
      throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
    }
    return jsonResponse({ success: true, result: { message_id: 5511 } });
  });

  const outcome = await sendAdminAssignedOrderTelegramToRider({
    request: new Request('https://example.com/api/admin/rider-assign'),
    rider: { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1' },
    orderId: '907',
    shopSlug: 'shop-a',
    pickupEtaMinutes: 12,
    orderSummary: {
      orderNo: '260415016',
      shopName: 'Ruma Sushi',
      shopMapUrl: 'https://maps.example.com/shop',
      address: 'Bulevar 1',
      deliveryMapUrl: 'https://maps.example.com/delivery',
      phone: '381600000000',
      totalAmount: 100,
      scheduledFor: '',
      itemSummary: ['寿司 x1'],
    },
  });

  assert.deepEqual(outcome, { success: true, messageRef: { chatId: 'chat-1', messageId: 5511 } });
  const payload = JSON.parse(sentCalls[0].body) as { reply_markup?: unknown };
  assert.equal(findTelegramButton(payload.reply_markup, '接单'), undefined);
  assert.equal(findTelegramButton(payload.reply_markup, '暂不接单'), undefined);
});

test('sendAdminPublishedOrderTelegramToRider 兼容 snake_case chat id 并接受顶层 message_id', async (t) => {
  useTestEnv(t);
  const sentCalls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/api/telegram/send') {
      throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
    }
    return jsonResponse({ success: true, message_id: 7712 });
  });

  const outcome = await sendAdminPublishedOrderTelegramToRider({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      headers: {
        authorization: 'Bearer admin-token',
        cookie: 'admin_token=admin-cookie',
      },
    }),
    rider: { id: '202', name: 'Rider 1', phone: '381641234567', telegram_chat_id: 'chat-1' },
    orderId: '902',
    shopSlug: 'shop-a',
    restaurantId: 'shop-a',
    callbackSecretOverride: 'remote-secret',
    messageInput: {
      shopName: 'Ruma Sushi',
      address: 'Bulevar 1',
      totalAmount: 100,
      pickupEtaMinutes: 12,
      phone: '381600000000',
      dashboardLink: 'https://food2.serbia70.com/rider/shop-a?orderId=902',
      shopMapUrl: 'https://maps.example.com/shop',
      deliveryMapUrl: 'https://maps.example.com/delivery',
    },
  });

  assert.deepEqual(outcome, { success: true, messageRef: { chatId: 'chat-1', messageId: 7712 } });
  const payload = JSON.parse(sentCalls[0].body) as { reply_markup?: unknown };
  assert.ok(findTelegramButton(payload.reply_markup, '接单'));
});

