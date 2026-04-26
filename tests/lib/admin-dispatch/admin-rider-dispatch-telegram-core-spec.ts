import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminTelegramCallbackBase,
  buildAdminTelegramPayloadBaseExtras,
  buildAdminTelegramSendPreparation,
  buildOptionalAdminTelegramClaimCallbackData,
} from '../../../src/lib/rider-route-admin-telegram-prep.ts';
import {
  normalizeTelegramSendError,
  readOptionalTelegramCallbackData,
  readResolvedTelegramChatId,
  sendAdminTelegramWithReplyMarkupRetry,
} from '../../../src/lib/rider-route-admin-telegram-transport.ts';
import {
  findTelegramButton,
  jsonResponse,
  useMockFetch,
} from './admin-rider-dispatch-telegram-test-helpers.ts';

test('sendAdminTelegramWithReplyMarkupRetry 在 html 502 时去掉 reply_markup 再重试', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/api/telegram/send') {
      throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
    }

    const payload = JSON.parse(await request.clone().text()) as { reply_markup?: unknown };
    if (payload.reply_markup) {
      return new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return jsonResponse({ success: true, result: { message_id: 9911 } });
  });

  const outcome = await sendAdminTelegramWithReplyMarkupRetry({
    request: new Request('https://example.com/api/admin/rider-assign', {
      headers: {
        cookie: 'admin_token=admin-cookie',
        authorization: 'Bearer admin-token',
      },
    }),
    payloadBase: {
      shop_slug: 'shop-a',
      chat_id: 'chat-1',
      chatId: 'chat-1',
      text: 'hello',
    },
    replyMarkup: { inline_keyboard: [[{ text: '接单', callback_data: 'claim' }]] },
    chatId: 'chat-1',
  });

  assert.deepEqual(outcome, { success: true, messageRef: { chatId: 'chat-1', messageId: 9911 } });
  const telegramCalls = calls.filter((call) => new URL(call.url).pathname === '/api/telegram/send');
  assert.equal(telegramCalls.length, 2);
  const secondPayload = JSON.parse(telegramCalls[1].body) as { reply_markup?: unknown };
  assert.equal(findTelegramButton(secondPayload.reply_markup, '接单'), undefined);
});

test('readResolvedTelegramChatId / readOptionalTelegramCallbackData / normalizeTelegramSendError 维持当前 helper 契约', () => {
  assert.equal(readResolvedTelegramChatId({ telegramChatId: 'chat-camel' }, ''), 'chat-camel');
  assert.equal(readResolvedTelegramChatId({ telegram_chat_id: 'chat-snake' }, 'fallback-chat'), 'chat-snake');
  assert.equal(readResolvedTelegramChatId({ telegramChatId: '   ' }, ' fallback-chat '), 'fallback-chat');

  assert.equal(
    readOptionalTelegramCallbackData(() => {
      throw new Error('missing_telegram_callback_secret');
    }),
    '',
  );

  assert.throws(
    () => readOptionalTelegramCallbackData(() => {
      throw new Error('boom');
    }),
    /boom/,
  );

  assert.equal(normalizeTelegramSendError('send_failed'), 'send_failed');
  assert.equal(normalizeTelegramSendError({ code: 502 }), 'telegram_send_failed');
});

test('buildAdminTelegramCallbackBase / buildOptionalAdminTelegramClaimCallbackData / buildAdminTelegramPayloadBaseExtras / buildAdminTelegramSendPreparation 保持规范化行为', () => {
  const callbackBase = buildAdminTelegramCallbackBase({
    orderId: '908',
    rider: {
      id: '202',
      name: ' Rider 1 ',
      phone: ' 381641234567 ',
    },
    restaurantId: '',
    telegramChatId: ' chat-1 ',
    secretOverride: 'remote-secret',
  });

  assert.deepEqual(callbackBase, {
    orderId: 908,
    riderId: 202,
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    restaurantId: 'admin',
    telegramChatId: 'chat-1',
    secretOverride: 'remote-secret',
  });

  assert.equal(
    buildOptionalAdminTelegramClaimCallbackData({
      callbackBase,
      buildCallback: () => 'claim-data',
    }),
    'claim-data',
  );

  assert.equal(
    buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: { ...callbackBase, riderId: 0 },
      buildCallback: () => 'claim-data',
    }),
    undefined,
  );

  assert.deepEqual(
    buildAdminTelegramPayloadBaseExtras({
      shopSlug: ' shop-a ',
      telegramBotToken: ' inline-token ',
    }),
    {
      shop_slug: 'shop-a',
      telegramBotToken: 'inline-token',
    },
  );

  assert.deepEqual(
    buildAdminTelegramSendPreparation({
      orderId: '909',
      rider: {
        id: '303',
        name: ' Rider 2 ',
        phone: ' 381641234568 ',
      },
      fallbackChatId: ' fallback-chat ',
      shopSlug: '   ',
      restaurantId: ' shop-b ',
    }),
    {
      chatId: 'fallback-chat',
      payloadBaseExtras: {},
      callbackBase: {
        orderId: 909,
        riderId: 303,
        riderName: 'Rider 2',
        riderPhone: '381641234568',
        restaurantId: 'shop-b',
        telegramChatId: 'fallback-chat',
      },
    },
  );
});

