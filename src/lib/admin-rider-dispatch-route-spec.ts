import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import * as riderRouteShared from './rider-route-shared.ts';
import { buildAdminAssignedOrderTelegramMessage, parseTelegramClaimCallback } from './telegram-dispatch.ts';
import { POST as handleAdminRiderDispatch } from '../pages/api/admin/rider-dispatch.ts';
import { POST as handleAdminRiderAssign } from '../pages/api/admin/rider-assign.ts';
import { readDispatchMetaFromRemarks } from './rider-dispatch.ts';
import { buildAdminForcedRiderNotFoundResponse, buildAdminInvalidActionResponse, buildAdminNoAvailableRidersResponse, buildAdminOrderFetchFailedSimpleResponse, buildAdminOrderIdRequiredResponse, buildAdminOrderSnapshotRequiredResponse, buildAdminOrderSnapshotUnavailableResponse, buildAdminRiderAlreadyDeclinedResponse, buildAdminTelegramCompletionResponse, finalizeAdminTelegramCompletionResponse, maybePersistAdminTelegramMessageRefWarning, readAdminAssignableRidersOrResponse, readAdminTelegramSendOutcome, readOptionalTelegramCallbackData, readProtectedTelegramCallbackSecret, readResolvedTelegramChatId, readTelegramRiderChatId, readTelegramSendResult, sendAdminTelegramWithReplyMarkupRetry, updateAdminOrderStatusOrResponse } from './rider-route-shared.ts';

const TEST_API_BASE = 'https://api.example.com';

type FetchHandler = (request: Request) => Promise<Response>;

type MockCall = {
  url: string;
  method: string;
  body: string;
  headers: Headers;
};

function useTestEnv(t: TestContext): void {
  const originalApiUrl = process.env.PUBLIC_API_URL;
  const originalCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.PUBLIC_API_URL = TEST_API_BASE;
  process.env.TELEGRAM_CALLBACK_SECRET = 'test-secret';
  t.after(() => {
    if (typeof originalApiUrl === 'string') {
      process.env.PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.PUBLIC_API_URL;
    }
    if (typeof originalCallbackSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalCallbackSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  });
}

function useMockFetch(t: TestContext, handler: FetchHandler): MockCall[] {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      body: await request.clone().text(),
      headers: request.headers,
    });
    return handler(request);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createCookies(): { get: () => undefined } {
  return {
    get: () => undefined,
  };
}

function findTelegramButton(markup: unknown, text: string): { text: string; url?: string; callback_data?: string } | undefined {
  if (Array.isArray(markup)) {
    for (const item of markup) {
      const button = findTelegramButton(item, text);
      if (button) {
        return button;
      }
    }
    return undefined;
  }

  if (!markup || typeof markup !== 'object') {
    return undefined;
  }

  const candidate = markup as { text?: unknown; url?: unknown; callback_data?: unknown };
  if (typeof candidate.text === 'string' && candidate.text === text) {
    return {
      text,
      url: typeof candidate.url === 'string' ? candidate.url : undefined,
      callback_data: typeof candidate.callback_data === 'string' ? candidate.callback_data : undefined,
    };
  }

  for (const value of Object.values(markup)) {
    const button = findTelegramButton(value, text);
    if (button) {
      return button;
    }
  }

  return undefined;
}

function readRemarksPayload(call: MockCall): { orderId: string; remarks: string[] } {
  const parsed = JSON.parse(call.body) as { orderId?: unknown; remarks?: unknown };
  return {
    orderId: typeof parsed.orderId === 'string' || typeof parsed.orderId === 'number' ? String(parsed.orderId).trim() : '',
    remarks: Array.isArray(parsed.remarks) ? parsed.remarks.map((item) => String(item ?? '')) : [],
  };
}

function readDispatchMetaFromRemarksPayload(call: MockCall): DispatchMeta {
  return readDispatchMetaFromRemarks(JSON.stringify(readRemarksPayload(call).remarks));
}

test('readProtectedTelegramCallbackSecret forwards auth to master settings and reads remote callback secret', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/settings/master') {
      return jsonResponse({ success: true, settings: { server: { telegramWebhookSecret: 'remote-secret' } } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const secret = await readProtectedTelegramCallbackSecret(new Request('https://example.com/api/admin/rider-assign', {
    headers: {
      authorization: 'Bearer admin-token',
      cookie: 'admin_token=admin-cookie',
    },
  }));

  assert.equal(secret, 'remote-secret');
  const masterSettingsCall = calls.find((call) => new URL(call.url).pathname === '/api/admin/settings/master');
  assert.ok(masterSettingsCall);
  assert.equal(masterSettingsCall.headers.get('authorization'), 'Bearer admin-token');
  assert.equal(masterSettingsCall.headers.get('cookie'), 'admin_token=admin-cookie');
});

test('readTelegramSendResult reads nested and top-level message_id and keeps upstream error text', () => {
  assert.deepEqual(
    readTelegramSendResult(new Response(JSON.stringify({ success: true, result: { message_id: 7788 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }), JSON.stringify({ success: true, result: { message_id: 7788 } })),
    { ok: true, messageId: 7788 },
  );

  assert.deepEqual(
    readTelegramSendResult(new Response(JSON.stringify({ success: true, message_id: 7790 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }), JSON.stringify({ success: true, message_id: 7790 })),
    { ok: true, messageId: 7790 },
  );

  assert.deepEqual(
    readTelegramSendResult(new Response(JSON.stringify({ success: false, error: 'telegram_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    }), JSON.stringify({ success: false, error: 'telegram_failed' })),
    { ok: false, error: '{"success":false,"error":"telegram_failed"}' },
  );
});

test('readAdminTelegramSendOutcome keeps telegram send error contract', () => {
  assert.deepEqual(
    readAdminTelegramSendOutcome({
      response: new Response(JSON.stringify({ success: false, error: 'telegram_failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
      responseText: JSON.stringify({ success: false, error: 'telegram_failed' }),
      chatId: 'chat-1',
    }),
    { success: false, error: '{"success":false,"error":"telegram_failed"}' },
  );
});

test('readAdminTelegramSendOutcome returns messageRef when telegram send succeeds with message id', () => {
  assert.deepEqual(
    readAdminTelegramSendOutcome({
      response: new Response(JSON.stringify({ success: true, result: { message_id: 7788 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      responseText: JSON.stringify({ success: true, result: { message_id: 7788 } }),
      chatId: 'chat-1',
    }),
    { success: true, messageRef: { chatId: 'chat-1', messageId: 7788 } },
  );
});

test('sendAdminTelegramWithReplyMarkupRetry retries without reply_markup after html 502', async (t) => {
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

  const firstPayload = JSON.parse(telegramCalls[0].body) as { reply_markup?: unknown };
  const secondPayload = JSON.parse(telegramCalls[1].body) as { reply_markup?: unknown };
  assert.ok(firstPayload.reply_markup);
  assert.equal(secondPayload.reply_markup, undefined);
  assert.equal(telegramCalls[0].headers.get('cookie'), 'admin_token=admin-cookie');
  assert.equal(telegramCalls[0].headers.get('authorization'), 'Bearer admin-token');
});

test('readAdminTelegramSendOutcome does not force messageRef when telegram send succeeds without message id', () => {
  assert.deepEqual(
    readAdminTelegramSendOutcome({
      response: new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      responseText: JSON.stringify({ success: true }),
      chatId: 'chat-1',
    }),
    { success: true },
  );
});

test('readOptionalTelegramCallbackData returns empty string for missing callback secret', () => {
  assert.equal(
    readOptionalTelegramCallbackData(() => {
      throw new Error('missing_telegram_callback_secret');
    }),
    '',
  );
});

test('readOptionalTelegramCallbackData rethrows non-secret callback errors', () => {
  assert.throws(
    () => readOptionalTelegramCallbackData(() => {
      throw new Error('boom');
    }),
    /boom/,
  );
});

test('readResolvedTelegramChatId prefers rider chat id and falls back to request chat id', () => {
  assert.equal(readResolvedTelegramChatId({ telegramChatId: 'chat-camel' }, ''), 'chat-camel');
  assert.equal(readResolvedTelegramChatId({ telegram_chat_id: 'chat-snake' }, 'fallback-chat'), 'chat-snake');
  assert.equal(readResolvedTelegramChatId({ telegramChatId: '   ' }, ' fallback-chat '), 'fallback-chat');
  assert.equal(readResolvedTelegramChatId({}, '   '), '');
});

test('normalizeTelegramSendError keeps string errors and falls back for non-message values', () => {
  assert.equal(riderRouteShared.normalizeTelegramSendError('send_failed'), 'send_failed');
  assert.equal(riderRouteShared.normalizeTelegramSendError({ code: 502 }), 'telegram_send_failed');
});

test('buildAdminTelegramCallbackBase normalizes rider and order fields for assign/publish flows', () => {
  assert.deepEqual(
    riderRouteShared.buildAdminTelegramCallbackBase({
      orderId: '908',
      rider: {
        id: '202',
        name: ' Rider 1 ',
        phone: ' 381641234567 ',
      },
      restaurantId: '',
      telegramChatId: ' chat-1 ',
      secretOverride: 'remote-secret',
    }),
    {
      orderId: 908,
      riderId: 202,
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      restaurantId: 'admin',
      telegramChatId: 'chat-1',
      secretOverride: 'remote-secret',
    },
  );
});

test('buildOptionalAdminTelegramClaimCallbackData returns callback when base is complete', () => {
  const callbackBase = riderRouteShared.buildAdminTelegramCallbackBase({
    orderId: '908',
    rider: {
      id: '202',
      name: ' Rider 1 ',
      phone: ' 381641234567 ',
    },
    restaurantId: 'shop-a',
    telegramChatId: ' chat-1 ',
    secretOverride: 'remote-secret',
  });

  assert.equal(
    riderRouteShared.buildOptionalAdminTelegramClaimCallbackData({
      callbackBase,
      buildCallback: (input) => {
        assert.deepEqual(input, callbackBase);
        return 'claim-data';
      },
    }),
    'claim-data',
  );
});

test('buildOptionalAdminTelegramClaimCallbackData returns undefined when callback base is incomplete', () => {
  const completeBase = riderRouteShared.buildAdminTelegramCallbackBase({
    orderId: '908',
    rider: {
      id: '202',
      name: 'Rider 1',
      phone: '381641234567',
    },
    restaurantId: 'shop-a',
    telegramChatId: 'chat-1',
    secretOverride: 'remote-secret',
  });

  assert.equal(
    riderRouteShared.buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: { ...completeBase, riderId: 0 },
      buildCallback: () => 'claim-data',
    }),
    undefined,
  );
  assert.equal(
    riderRouteShared.buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: { ...completeBase, riderName: '' },
      buildCallback: () => 'claim-data',
    }),
    undefined,
  );
  assert.equal(
    riderRouteShared.buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: { ...completeBase, riderPhone: '' },
      buildCallback: () => 'claim-data',
    }),
    undefined,
  );
  assert.equal(
    riderRouteShared.buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: { ...completeBase, telegramChatId: '' },
      buildCallback: () => 'claim-data',
    }),
    undefined,
  );
});

test('buildOptionalAdminTelegramClaimCallbackData returns undefined when callback secret is missing', () => {
  const callbackBase = riderRouteShared.buildAdminTelegramCallbackBase({
    orderId: '908',
    rider: {
      id: '202',
      name: 'Rider 1',
      phone: '381641234567',
    },
    restaurantId: 'shop-a',
    telegramChatId: 'chat-1',
  });

  assert.equal(
    riderRouteShared.buildOptionalAdminTelegramClaimCallbackData({
      callbackBase,
      buildCallback: () => {
        throw new Error('missing_telegram_callback_secret');
      },
    }),
    undefined,
  );
});

test('buildAdminTelegramPayloadBaseExtras normalizes shop slug and inline token for admin telegram sends', () => {
  assert.deepEqual(
    riderRouteShared.buildAdminTelegramPayloadBaseExtras({
      shopSlug: ' shop-a ',
      telegramBotToken: ' inline-token ',
    }),
    {
      shop_slug: 'shop-a',
      telegramBotToken: 'inline-token',
    },
  );

  assert.deepEqual(
    riderRouteShared.buildAdminTelegramPayloadBaseExtras({
      shop_slug: ' shop-b ',
      telegramBotToken: '   ',
    }),
    {
      shop_slug: 'shop-b',
    },
  );

  assert.deepEqual(
    riderRouteShared.buildAdminTelegramPayloadBaseExtras({
      shopSlug: '   ',
      telegramBotToken: '',
    }),
    {},
  );
});

test('buildAdminTelegramSendPreparation normalizes chatId payload extras and callback base for assign/publish flows', () => {
  assert.deepEqual(
    riderRouteShared.buildAdminTelegramSendPreparation({
      orderId: '908',
      rider: {
        id: '202',
        name: ' Rider 1 ',
        phone: ' 381641234567 ',
        telegram_chat_id: ' chat-1 ',
      },
      fallbackChatId: ' fallback-chat ',
      shopSlug: ' shop-a ',
      telegramBotToken: ' inline-token ',
      restaurantId: '',
      secretOverride: ' remote-secret ',
    }),
    {
      chatId: 'chat-1',
      payloadBaseExtras: {
        shop_slug: 'shop-a',
        telegramBotToken: 'inline-token',
      },
      callbackBase: {
        orderId: 908,
        riderId: 202,
        riderName: 'Rider 1',
        riderPhone: '381641234567',
        restaurantId: 'admin',
        telegramChatId: 'chat-1',
        secretOverride: 'remote-secret',
      },
    },
  );

  assert.deepEqual(
    riderRouteShared.buildAdminTelegramSendPreparation({
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

test('readAdminOrderShopSlug and readAdminAssignOrderSummary normalize assign order snapshot fields', () => {
  assert.equal(
    riderRouteShared.readAdminOrderShopSlug({
      restaurant_slug: ' Shop-103 ',
    }),
    'Shop-103',
  );

  assert.deepEqual(
    riderRouteShared.readAdminAssignOrderSummary({
      order_no: ' 260415016 ',
      shop_name: ' Ruma Sushi ',
      restaurant_name: ' Backup Name ',
      shop_address: ' Kralja Petra 1 ',
      restaurant_address: ' Ignored Address ',
      shop_map_url: '',
      delivery_address: ' Bulevar 1 ',
      delivery_map_url: '',
      user_phone: ' 381600000000 ',
      total_amount: '1234',
      scheduled_for: '18:30',
      items_json: JSON.stringify([
        { name: ' 寿司 ', quantity: 2 },
        { name: ' ', quantity: 1 },
        { name: '汤', quantity: 0 },
      ]),
    }),
    {
      orderNo: '260415016',
      shopName: 'Ruma Sushi',
      shopMapUrl: 'https://www.google.com/maps/search/?api=1&query=Kralja%20Petra%201',
      address: 'Bulevar 1',
      deliveryMapUrl: 'https://www.google.com/maps/search/?api=1&query=Bulevar%201',
      phone: '381600000000',
      totalAmount: 1234,
      scheduledFor: '18:30',
      itemSummary: ['寿司 x2'],
    },
  );
});


test('sendPreparedAdminTelegramToRider sends prepared payload with resolved chat id', async (t) => {
  const sentCalls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/api/telegram/send') {
      throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
    }
    return jsonResponse({ success: true, result: { message_id: 4455 } });
  });

  const outcome = await riderRouteShared.sendPreparedAdminTelegramToRider({
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
  const sent = sentCalls[0];
  const sentPayload = JSON.parse(sent.body) as { [key: string]: unknown };
  assert.equal(sent.headers.get('authorization'), 'Bearer admin-token');
  assert.equal(sent.headers.get('cookie'), 'admin_token=admin-cookie');
  assert.equal(sentPayload.shop_slug, 'shop-a');
  assert.equal(sentPayload.telegramBotToken, 'inline-token');
  assert.equal(sentPayload.chat_id, 'chat-1');
  assert.equal(sentPayload.chatId, 'chat-1');
  assert.equal(sentPayload.text, 'prepared message');
  assert.deepEqual(sentPayload.reply_markup, { inline_keyboard: [[{ text: '接单', callback_data: 'claim' }]] });
});

test('buildAdminTelegramSendCallbacks injects resolved chat id into claim callback builders', () => {
  const callbackBase = {
    orderId: 908,
    riderId: 202,
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    restaurantId: 'shop-a',
    telegramChatId: '',
    secretOverride: 'remote-secret',
  };
  let claimCallbackInput: Record<string, unknown> | undefined;
  let declineCallbackInput: Record<string, unknown> | undefined;

  const callbacks = riderRouteShared.buildAdminTelegramSendCallbacks({
    rider: { telegramChatId: '   ' },
    fallbackChatId: 'chat-1',
    callbackBase,
    builders: {
      claimCallbackData: (input) => {
        claimCallbackInput = input;
        return 'claim-data';
      },
      declineCallbackData: (input) => {
        declineCallbackInput = input;
        return 'decline-data';
      },
    },
  });

  assert.deepEqual(callbacks, {
    chatId: 'chat-1',
    claimCallbackData: 'claim-data',
    declineCallbackData: 'decline-data',
  });
  assert.deepEqual(claimCallbackInput, { ...callbackBase, telegramChatId: 'chat-1' });
  assert.deepEqual(declineCallbackInput, { ...callbackBase, telegramChatId: 'chat-1' });
});

test('sendAdminTelegramToRider builds assign payload with claim and decline callbacks', async (t) => {
  useTestEnv(t);
  const sentCalls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/api/telegram/send') {
      throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
    }
    return jsonResponse({ success: true, result: { message_id: 9911 } });
  });

  const outcome = await riderRouteShared.sendAdminTelegramToRider({
    request: new Request('https://example.com/api/admin/rider-assign', {
      headers: {
        authorization: 'Bearer admin-token',
        cookie: 'admin_token=admin-cookie',
      },
    }),
    rider: { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1' },
    fallbackChatId: '',
    payloadBaseExtras: { shop_slug: 'shop-a', telegramBotToken: 'inline-token' },
    callbackBase: {
      orderId: 908,
      riderId: 202,
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      restaurantId: 'shop-a',
      telegramChatId: 'chat-1',
      secretOverride: 'remote-secret',
    },
    buildMessage: ({ claimCallbackData, declineCallbackData }) => buildAdminAssignedOrderTelegramMessage({
      orderNo: '260415016',
      shopName: 'Ruma Sushi',
      address: 'Bulevar 1',
      totalAmount: 100,
      phone: '381600000000',
      pickupEtaMinutes: 12,
      scheduledFor: '',
      itemSummary: ['寿司 x1'],
      shopMapUrl: 'https://maps.example.com/shop',
      deliveryMapUrl: 'https://maps.example.com/delivery',
      claimCallbackData,
      declineCallbackData,
    }),
  });

  assert.deepEqual(outcome, { success: true, messageRef: { chatId: 'chat-1', messageId: 9911 } });
  assert.equal(sentCalls.length, 1);
  const sent = sentCalls[0];
  const sentPayload = JSON.parse(sent.body) as { [key: string]: unknown };
  assert.equal(sent.headers.get('authorization'), 'Bearer admin-token');
  assert.equal(sent.headers.get('cookie'), 'admin_token=admin-cookie');
  assert.equal(sentPayload.shop_slug, 'shop-a');
  assert.equal(sentPayload.telegramBotToken, 'inline-token');
  assert.equal(sentPayload.chat_id, 'chat-1');
  assert.equal(sentPayload.chatId, 'chat-1');
  assert.match(String(sentPayload.text || ''), /你有新的指派订单/);
  const acceptButton = findTelegramButton(sentPayload.reply_markup, '接单');
  const declineButton = findTelegramButton(sentPayload.reply_markup, '暂不接单');
  assert.ok(acceptButton?.callback_data);
  assert.ok(declineButton?.callback_data);

  const originalSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'remote-secret';
  try {
    const accept = parseTelegramClaimCallback(String(acceptButton?.callback_data || ''), { chatId: 'chat-1' });
    const decline = parseTelegramClaimCallback(String(declineButton?.callback_data || ''), { chatId: 'chat-1' });
    assert.equal(accept.orderId, 908);
    assert.equal(accept.riderId, 202);
    assert.equal(decline.action, 'decline');
  } finally {
    if (typeof originalSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  }
});

test('readAdminPublishOrderMessageInput normalizes publish order snapshot fields', () => {
  assert.deepEqual(
    riderRouteShared.readAdminPublishOrderMessageInput({
      shop_name: ' Ruma Sushi ',
      restaurant_name: ' Backup Name ',
      shop_address: ' Kralja Petra 1 ',
      restaurant_address: ' Ignored Address ',
      shop_map_url: '',
      table_info: ' Table 8 ',
      delivery_address: ' Bulevar 1 ',
      delivery_map_url: '',
      user_phone: ' 381600000000 ',
      total_amount: '1234',
      pickup_eta_minutes: '12',
      shop_slug: ' shop-103 ',
      shop_id: ' 103 ',
      id: ' 902 ',
    }, 'https://food2.serbia70.com'),
    {
      shopName: 'Ruma Sushi',
      address: 'Table 8',
      totalAmount: 1234,
      pickupEtaMinutes: 12,
      phone: '381600000000',
      dashboardLink: 'https://food2.serbia70.com/rider/dashboard?orderId=902&restaurantId=shop-103',
      shopMapUrl: 'https://www.google.com/maps/search/?api=1&query=Kralja%20Petra%201',
      deliveryMapUrl: 'https://www.google.com/maps/search/?api=1&query=Table%208',
    },
  );
});

test('sendAdminDispatchTelegramToRider builds publish payload with optional claim callback', async (t) => {
  useTestEnv(t);
  const sentCalls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/api/telegram/send') {
      throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
    }
    return jsonResponse({ success: true, result: { message_id: 7711 } });
  });

  const outcome = await riderRouteShared.sendAdminDispatchTelegramToRider({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      headers: {
        authorization: 'Bearer admin-token',
        cookie: 'admin_token=admin-cookie',
      },
    }),
    rider: { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1' },
    fallbackChatId: 'chat-1',
    payloadBaseExtras: { shop_slug: 'shop-a' },
    callbackBase: {
      orderId: 902,
      riderId: 202,
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      restaurantId: 'shop-a',
      telegramChatId: 'chat-1',
      secretOverride: 'remote-secret',
    },
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

  assert.deepEqual(outcome, { success: true, messageRef: { chatId: 'chat-1', messageId: 7711 } });
  assert.equal(sentCalls.length, 1);
  const sent = sentCalls[0];
  const sentPayload = JSON.parse(sent.body) as { [key: string]: unknown };
  assert.equal(sent.headers.get('authorization'), 'Bearer admin-token');
  assert.equal(sent.headers.get('cookie'), 'admin_token=admin-cookie');
  assert.equal(sentPayload.shop_slug, 'shop-a');
  assert.equal(sentPayload.chat_id, 'chat-1');
  assert.equal(sentPayload.chatId, 'chat-1');
  assert.match(String(sentPayload.text || ''), /Ruma Sushi有新单/);
  const acceptButton = findTelegramButton(sentPayload.reply_markup, '接单');
  assert.ok(acceptButton?.callback_data);

  const originalSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'remote-secret';
  try {
    const accept = parseTelegramClaimCallback(String(acceptButton?.callback_data || ''), { chatId: 'chat-1' });
    assert.equal(accept.orderId, 902);
    assert.equal(accept.riderId, 202);
    assert.equal(accept.restaurantId, 'shop-a');
  } finally {
    if (typeof originalSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  }
});

test('sendPreparedAdminTelegramToRider returns telegram_chat_id_missing when rider and fallback chat ids are both empty', async () => {
  const outcome = await riderRouteShared.sendPreparedAdminTelegramToRider({
    request: new Request('https://example.com/api/admin/rider-dispatch'),
    rider: { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: '   ' },
    fallbackChatId: '   ',
    payloadBaseExtras: { shop_slug: 'shop-a' },
    message: {
      text: 'prepared message',
      replyMarkup: undefined,
    },
  });

  assert.deepEqual(outcome, { success: false, error: 'telegram_chat_id_missing' });
});

test('sendAdminTelegramToRider returns telegram_chat_id_missing when rider and fallback chat ids are both empty', async () => {
  const outcome = await riderRouteShared.sendAdminTelegramToRider({
    request: new Request('https://example.com/api/admin/rider-assign'),
    rider: { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: '   ' },
    fallbackChatId: '   ',
    payloadBaseExtras: { shop_slug: 'shop-a' },
    callbackBase: {
      orderId: 908,
      riderId: 202,
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      restaurantId: 'shop-a',
      telegramChatId: '',
    },
    buildMessage: ({ claimCallbackData }) => ({
      text: claimCallbackData || 'hello',
      replyMarkup: undefined,
    }),
  });

  assert.deepEqual(outcome, { success: false, error: 'telegram_chat_id_missing' });
});

test('buildAdminOrderSnapshotUnavailableResponse keeps 502 and raw_response_text contract', async () => {
  const response = buildAdminOrderSnapshotUnavailableResponse('{"success":false,"error":"upstream_boom"}');
  const body = JSON.parse(await response.text()) as { success: boolean; error: string; raw_response_text: string };

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_snapshot_unavailable');
  assert.equal(body.raw_response_text, '{"success":false,"error":"upstream_boom"}');
});

test('buildAdminOrderFetchFailedSimpleResponse keeps 502 and simple order_fetch_failed contract', async () => {
  const response = buildAdminOrderFetchFailedSimpleResponse();
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_fetch_failed');
});

test('buildAdminForcedRiderNotFoundResponse keeps 400 and forced_rider_not_found contract', async () => {
  const response = buildAdminForcedRiderNotFoundResponse('999');
  const body = JSON.parse(await response.text()) as { success: boolean; error: string; forcedRiderId: string };

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'forced_rider_not_found');
  assert.equal(body.forcedRiderId, '999');
});

test('pickAdminSingleRiderById returns the matched rider by normalized riderId', () => {
  const pickAdminSingleRiderById = (
    riderRouteShared as typeof riderRouteShared & {
      pickAdminSingleRiderById: (args: {
        riders: Array<{ id?: unknown; name?: unknown }>;
        riderId: string;
      }) => { id?: unknown; name?: unknown } | null;
    }
  ).pickAdminSingleRiderById;

  const rider = pickAdminSingleRiderById({
    riders: [
      { id: '101', name: 'Rider A' },
      { id: '202', name: 'Rider B' },
    ],
    riderId: ' 202 ',
  });

  assert.deepEqual(rider, { id: '202', name: 'Rider B' });
});

test('pickAdminSingleRiderById returns null when the riderId is missing from the list', () => {
  const pickAdminSingleRiderById = (
    riderRouteShared as typeof riderRouteShared & {
      pickAdminSingleRiderById: (args: {
        riders: Array<{ id?: unknown; name?: unknown }>;
        riderId: string;
      }) => { id?: unknown; name?: unknown } | null;
    }
  ).pickAdminSingleRiderById;

  const rider = pickAdminSingleRiderById({
    riders: [
      { id: '101', name: 'Rider A' },
      { id: '202', name: 'Rider B' },
    ],
    riderId: '999',
  });

  assert.equal(rider, null);
});

test('pickAdminSingleRiderById returns null when riderId is blank', () => {
  const pickAdminSingleRiderById = (
    riderRouteShared as typeof riderRouteShared & {
      pickAdminSingleRiderById: (args: {
        riders: Array<{ id?: unknown; name?: unknown }>;
        riderId: string;
      }) => { id?: unknown; name?: unknown } | null;
    }
  ).pickAdminSingleRiderById;

  const rider = pickAdminSingleRiderById({
    riders: [
      { id: '101', name: 'Rider A' },
      { id: '202', name: 'Rider B' },
    ],
    riderId: '   ',
  });

  assert.equal(rider, null);
});

test('buildAdminOrderIdRequiredResponse keeps 400 and order_id_required contract', async () => {
  const response = buildAdminOrderIdRequiredResponse();
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_id_required');
});

test('buildAdminOrderSnapshotRequiredResponse keeps 409 and order_snapshot_required contract', async () => {
  const response = buildAdminOrderSnapshotRequiredResponse();
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_snapshot_required');
});

test('buildAdminInvalidActionResponse keeps 400 and preserves action error contract', async () => {
  const invalidActionResponse = buildAdminInvalidActionResponse('invalid_action');
  const invalidActionBody = JSON.parse(await invalidActionResponse.text()) as { success: boolean; error: string };

  assert.equal(invalidActionResponse.status, 400);
  assert.equal(invalidActionBody.success, false);
  assert.equal(invalidActionBody.error, 'invalid_action');

  const unsupportedActionResponse = buildAdminInvalidActionResponse('unsupported_action');
  const unsupportedActionBody = JSON.parse(await unsupportedActionResponse.text()) as { success: boolean; error: string };

  assert.equal(unsupportedActionResponse.status, 400);
  assert.equal(unsupportedActionBody.success, false);
  assert.equal(unsupportedActionBody.error, 'unsupported_action');
});

test('buildAdminRiderAlreadyDeclinedResponse keeps 409 rider_already_declined_this_order contract', async () => {
  const response = buildAdminRiderAlreadyDeclinedResponse();
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'rider_already_declined_this_order');
});

test('buildAdminNoAvailableRidersResponse keeps 409 no_available_riders contract', async () => {
  const response = buildAdminNoAvailableRidersResponse();
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'no_available_riders');
});

test('finalizeAdminTelegramCompletionResponse persists warning and keeps telegram_notification contract', async (t) => {
  useTestEnv(t);
  useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({ success: true, orders: [] }, 404);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await finalizeAdminTelegramCompletionResponse({
    request: new Request('https://example.com/api/admin/rider-assign', { method: 'POST' }),
    cookies: createCookies() as never,
    apiBaseUrl: TEST_API_BASE,
    orderId: '901',
    messageRef: { chatId: 'chat-1', messageId: 7788 },
    successPayload: {
      telegram_notification: { success: false, error: 'telegram_down' },
    },
    warningOptions: { remarksWriteFailedOnly: true },
  });
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    warning?: { code: string };
    telegram_notification?: { success: boolean; error: string };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.warning, { code: 'telegram_message_ref_persist_failed' });
  assert.deepEqual(body.telegram_notification, { success: false, error: 'telegram_down' });
});

test('buildAdminTelegramCompletionResponse keeps assign warning and telegram_notification contract', async () => {
  const response = buildAdminTelegramCompletionResponse({
    successPayload: {
      warning: { code: 'telegram_message_ref_persist_failed' },
      telegram_notification: { success: false, error: 'telegram_down' },
    },
  });
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    warning?: { code: string };
    telegram_notification?: { success: boolean; error: string };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.warning, { code: 'telegram_message_ref_persist_failed' });
  assert.deepEqual(body.telegram_notification, { success: false, error: 'telegram_down' });
});

test('buildAdminTelegramCompletionResponse applies summary transform for publish response contract', async () => {
  const response = buildAdminTelegramCompletionResponse({
    successPayload: {
      telegram_dispatch: {
        availableRiderCount: 3,
        telegramBoundCount: 2,
        deliveredCount: 1,
        failedCount: 1,
        attempts: [{ riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', telegramChatIdBound: true, delivered: true }],
        telegramMessageRef: { chatId: 'chat-1', messageId: 7788 },
      },
      warning: { code: 'telegram_message_ref_persist_failed' },
    },
    transformTelegramDispatch: (summary) => {
      const normalized = { ...summary } as Record<string, unknown>;
      delete normalized.availableRiderCount;
      delete normalized.telegramBoundCount;
      delete normalized.deliveredCount;
      delete normalized.telegramMessageRef;
      return normalized;
    },
  });
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    warning?: { code: string };
    telegram_dispatch: Record<string, unknown>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.warning, { code: 'telegram_message_ref_persist_failed' });
  assert.equal(body.telegram_dispatch.failedCount, 1);
  assert.deepEqual(body.telegram_dispatch.attempts, [{ riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', telegramChatIdBound: true, delivered: true }]);
  assert.equal(body.telegram_dispatch.availableRiderCount, undefined);
  assert.equal(body.telegram_dispatch.telegramBoundCount, undefined);
  assert.equal(body.telegram_dispatch.deliveredCount, undefined);
  assert.equal(body.telegram_dispatch.telegramMessageRef, undefined);
});

test('updateAdminOrderStatusOrResponse keeps failed update contract', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders/901/status') {
      return jsonResponse({ success: false, error: 'status_failed' }, 409);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await updateAdminOrderStatusOrResponse({
    request: new Request('https://example.com/api/admin/rider-dispatch', { method: 'POST' }),
    cookies: createCookies() as never,
    apiBaseUrl: TEST_API_BASE,
    orderId: '901',
    payload: { status: 'awaiting_courier' },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 409);
  assert.deepEqual(JSON.parse(await result.response.text()), {
    success: false,
    error: 'order_update_failed',
    upstream_status: 409,
    upstream_body: '{"success":false,"error":"status_failed"}',
  });
  assert.equal(calls.length, 1);
});

test('readAdminAssignableRidersOrResponse keeps coerce2xxTo502 rider failure contract', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: false, error: 'riders_upstream_failed' }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminAssignableRidersOrResponse({
    request: new Request('https://example.com/api/admin/rider-dispatch', { method: 'POST' }),
    cookies: createCookies() as never,
    apiBaseUrl: TEST_API_BASE,
    coerce2xxTo502: true,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 502);
  assert.deepEqual(JSON.parse(await result.response.text()), {
    success: false,
    error: 'riders_upstream_failed',
    upstream_status: 200,
    upstream_body: '{"success":false,"error":"riders_upstream_failed"}',
  });
  assert.equal(calls.length, 1);
});

test('publish dispatch 成功时向正确 Telegram 目标发送一次店铺信息', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/902/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/settings/master') {
      return jsonResponse({ success: true, settings: { server: { telegramWebhookSecret: 'remote-secret' } } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7788 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer admin-token',
        cookie: 'admin_token=admin-cookie',
      },
      body: JSON.stringify({
        orderId: '902',
        action: 'publish',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        shopMapUrl: 'https://maps.example.com/shop-a',
        pickupEtaMinutes: 12,
        status: 'awaiting_courier',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const telegramCalls = calls.filter((call) => new URL(call.url).pathname === '/api/telegram/send');
  const masterSettingsCall = calls.find((call) => new URL(call.url).pathname === '/api/admin/settings/master');

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    telegram_dispatch: {
      failedCount: number;
      attempts: Array<{
        riderId: string;
        riderName: string;
        riderPhone: string;
        telegramChatIdBound: boolean;
        delivered: boolean;
      }>;
      availableRiderCount?: unknown;
      telegramBoundCount?: unknown;
      deliveredCount?: unknown;
      telegramMessageRef?: unknown;
    };
  };
  assert.equal(body.success, true);
  assert.equal(body.telegram_dispatch.failedCount, 0);
  assert.deepEqual(body.telegram_dispatch.attempts, [{
    riderId: '202',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    telegramChatIdBound: true,
    delivered: true,
  }]);
  assert.equal(body.telegram_dispatch.availableRiderCount, undefined);
  assert.equal(body.telegram_dispatch.telegramBoundCount, undefined);
  assert.equal(body.telegram_dispatch.deliveredCount, undefined);
  assert.equal(body.telegram_dispatch.telegramMessageRef, undefined);
  assert.equal(telegramCalls.length, 1);
  assert.ok(masterSettingsCall);
  assert.equal(masterSettingsCall.headers.get('authorization'), 'Bearer admin-token');
  assert.equal(masterSettingsCall.headers.get('cookie'), 'admin_token=admin-cookie');

  const telegramCall = telegramCalls[0];
  assert.ok(telegramCall);
  assert.equal(telegramCall.headers.get('authorization'), 'Bearer admin-token');
  assert.equal(telegramCall.headers.get('cookie'), 'admin_token=admin-cookie');
  assert.equal(telegramCall.method, 'POST');

  const telegramBody = JSON.parse(telegramCall.body) as {
    text: string;
    chat_id: string;
    replyMarkup?: { inline_keyboard?: unknown };
    reply_markup?: { inline_keyboard?: unknown };
  };
  assert.match(telegramBody.text, /Shop A/);
  assert.match(telegramBody.text, /https:\/\/maps\.example\.com\/shop-a/);
  assert.equal(telegramBody.chat_id, 'chat-1');
  const acceptButton = findTelegramButton(telegramBody.replyMarkup || telegramBody.reply_markup, '接单');
  assert.ok(acceptButton);
  assert.ok(acceptButton.callback_data);
  assert.throws(
    () => parseTelegramClaimCallback(acceptButton.callback_data),
    /invalid_signature/,
  );

  const originalSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'remote-secret';
  try {
    const parsed = parseTelegramClaimCallback(acceptButton.callback_data);
    assert.equal(parsed.orderId, 902);
    assert.equal(parsed.riderId, 202);
  } finally {
    if (typeof originalSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  }
});

test('publish dispatch telegram 502 html 时会去掉 reply markup 重试一次', async (t) => {
  useTestEnv(t);
  let telegramSendCount = 0;
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/912/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/settings/master') {
      return jsonResponse({ success: true, settings: { server: { telegramWebhookSecret: 'remote-secret' } } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      telegramSendCount += 1;
      if (telegramSendCount === 1) {
        return new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return jsonResponse({ success: true, result: { message_id: 7799 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer admin-token',
        cookie: 'admin_token=admin-cookie',
      },
      body: JSON.stringify({
        orderId: '912',
        action: 'publish',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        shopMapUrl: 'https://maps.example.com/shop-a',
        pickupEtaMinutes: 12,
        status: 'awaiting_courier',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    telegram_dispatch: {
      failedCount: number;
      attempts: Array<{
        riderId: string;
        delivered: boolean;
      }>;
    };
  };
  assert.equal(body.success, true);
  assert.equal(body.telegram_dispatch.failedCount, 0);
  assert.equal(body.telegram_dispatch.attempts.length, 1);
  assert.equal(body.telegram_dispatch.attempts[0]?.riderId, '202');
  assert.equal(body.telegram_dispatch.attempts[0]?.delivered, true);

  const telegramCalls = calls.filter((call) => new URL(call.url).pathname === '/api/telegram/send');
  assert.equal(telegramCalls.length, 2);

  const firstTelegramBody = JSON.parse(telegramCalls[0].body) as { replyMarkup?: unknown; reply_markup?: unknown };
  assert.ok(firstTelegramBody.replyMarkup || firstTelegramBody.reply_markup);

  const secondTelegramBody = JSON.parse(telegramCalls[1].body) as { replyMarkup?: unknown; reply_markup?: unknown };
  assert.equal(secondTelegramBody.replyMarkup, undefined);
  assert.equal(secondTelegramBody.reply_markup, undefined);
});

test('publish dispatch telegram throw string 时 attempts error 保留原字符串', async (t) => {
  useTestEnv(t);
  useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/913/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/settings/master') {
      return jsonResponse({ success: true, settings: { server: { telegramWebhookSecret: 'remote-secret' } } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      throw 'send_failed';
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer admin-token',
        cookie: 'admin_token=admin-cookie',
      },
      body: JSON.stringify({
        orderId: '913',
        action: 'publish',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        shopMapUrl: 'https://maps.example.com/shop-a',
        pickupEtaMinutes: 12,
        status: 'awaiting_courier',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    telegram_dispatch: {
      failedCount: number;
      attempts: Array<{
        riderId: string;
        delivered: boolean;
        error?: string;
      }>;
    };
  };
  assert.equal(body.success, true);
  assert.equal(body.telegram_dispatch.failedCount, 1);
  assert.equal(body.telegram_dispatch.attempts.length, 1);
  assert.equal(body.telegram_dispatch.attempts[0]?.riderId, '202');
  assert.equal(body.telegram_dispatch.attempts[0]?.delivered, false);
  assert.equal(body.telegram_dispatch.attempts[0]?.error, 'send_failed');
});

test('publish dispatch accepts snake_case telegram_chat_id rider field', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/922/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegram_chat_id: 'chat-snake', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7788 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '922',
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
  const telegramCall = calls.find((call) => new URL(call.url).pathname === '/api/telegram/send');
  assert.ok(telegramCall);

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.equal((JSON.parse(telegramCall.body) as { chat_id: string }).chat_id, 'chat-snake');
});

test('publish dispatch stores telegram message ref into remarks write payload', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/903/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '903',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7788 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '903',
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
  const finalRemarksCall = calls.filter((call) => new URL(call.url).pathname === '/api/admin/orders/remarks').pop();

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.ok(finalRemarksCall);
  assert.equal(readRemarksPayload(finalRemarksCall).orderId, '903');
  assert.deepEqual(readDispatchMetaFromRemarksPayload(finalRemarksCall).telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7788,
  });
});

test('publish dispatch accepts top-level telegram message_id when writing telegramMessageRef remarks payload', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/907/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '907',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, message_id: 7789 });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '907',
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
  const finalRemarksCall = calls.filter((call) => new URL(call.url).pathname === '/api/admin/orders/remarks').pop();

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.ok(finalRemarksCall);
  assert.equal(readRemarksPayload(finalRemarksCall).orderId, '907');
  assert.deepEqual(readDispatchMetaFromRemarksPayload(finalRemarksCall).telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7789,
  });
});

test('manual assign accepts top-level telegram message_id when writing telegramMessageRef remarks payload', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '908',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/908/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/settings/master') {
      return jsonResponse({ success: true, settings: { server: { telegramWebhookSecret: 'remote-secret' } } });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, message_id: 7790 });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer admin-token',
        cookie: 'admin_token=admin-cookie',
      },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '908',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const finalRemarksCall = calls.filter((call) => new URL(call.url).pathname === '/api/admin/orders/remarks').pop();
  const masterSettingsCall = calls.find((call) => new URL(call.url).pathname === '/api/admin/settings/master');
  const telegramCall = calls.find((call) => new URL(call.url).pathname === '/api/telegram/send');

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.ok(finalRemarksCall);
  assert.ok(masterSettingsCall);
  assert.equal(masterSettingsCall.headers.get('authorization'), 'Bearer admin-token');
  assert.equal(masterSettingsCall.headers.get('cookie'), 'admin_token=admin-cookie');
  assert.equal(readRemarksPayload(finalRemarksCall).orderId, '908');
  assert.deepEqual(readDispatchMetaFromRemarksPayload(finalRemarksCall).telegramMessageRef, {
    chatId: 'chat-1',
    messageId: 7790,
  });
  assert.ok(telegramCall);
  const acceptButton = findTelegramButton((JSON.parse(telegramCall.body) as { reply_markup: { inline_keyboard?: unknown } }).reply_markup, '接单');
  assert.ok(acceptButton);
  assert.ok(acceptButton.callback_data);
  assert.throws(
    () => parseTelegramClaimCallback(acceptButton.callback_data, {
      chatId: 'chat-1',
      riderPhone: '381641234567',
      restaurantId: 'shop-a',
    }),
    /invalid_signature/,
  );

  const originalSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'remote-secret';
  try {
    const parsed = parseTelegramClaimCallback(acceptButton.callback_data, {
      chatId: 'chat-1',
      riderPhone: '381641234567',
      restaurantId: 'shop-a',
    });
    assert.equal(parsed.orderId, 908);
    assert.equal(parsed.riderId, 202);
  } finally {
    if (typeof originalSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  }
});

test('manual assign telegram uses restaurantName from fetched order row when shopName is missing', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '909',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            restaurantName: 'Ruma Sushi',
            restaurantAddress: 'Bulevar 1',
            tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/909/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, message_id: 7791 });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '909',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const telegramCall = calls.find((call) => new URL(call.url).pathname === '/api/telegram/send');
  assert.ok(telegramCall);
  const telegramBody = JSON.parse(telegramCall.body) as { text: string; reply_markup: { inline_keyboard?: unknown } };
  const pickupButton = findTelegramButton(telegramBody.reply_markup, '取餐导航');
  const deliveryButton = findTelegramButton(telegramBody.reply_markup, '送餐导航');

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.match(telegramBody.text, /店铺：Ruma Sushi/);
  assert.ok(pickupButton);
  assert.ok(pickupButton.url);
  assert.match(pickupButton.url, /Bulevar/);
  assert.ok(deliveryButton);
  assert.ok(deliveryButton.url);
});

test('manual assign still uses fetched shop data when orderNo differs from internal orderId', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '916',
            orderNo: '260415016',
            remarksJson: JSON.stringify(['dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}']),
            shopSlug: 'shop-a',
            restaurantName: 'Ruma Sushi',
            restaurantAddress: 'Bulevar 1',
            tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
            totalAmount: 611,
            userPhone: '0613083888',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/916/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, message_id: 7792 });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '916',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 10,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const telegramCall = calls.find((call) => new URL(call.url).pathname === '/api/telegram/send');
  assert.ok(telegramCall);
  const telegramBody = JSON.parse(telegramCall.body) as { text: string; reply_markup: { inline_keyboard?: unknown } };

  const pickupButton = findTelegramButton(telegramBody.reply_markup, '取餐导航');

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.match(telegramBody.text, /订单号：260415016/);
  assert.match(telegramBody.text, /店铺：Ruma Sushi/);
  assert.ok(pickupButton);
  assert.ok(pickupButton.url);
  assert.match(pickupButton.url, /Bulevar/);
});

test('manual assign 订单读取失败时直接返回 order_fetch_failed 且不更新订单不发 telegram', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return new Response('upstream boom', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '697',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 10,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'order_fetch_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/697/status'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
});

test('manual assign 缺少可用订单快照时直接失败且不发送 telegram', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [],
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '697',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 10,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 409);
  assert.equal(success, false);
  assert.equal(error, 'order_snapshot_required');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/697/status'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch telegramMessageRef 回写前会重读最新 remarks 并保留并发新增内容', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/904/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '904',
            remarksJson: JSON.stringify([
              'note:keep-me',
              'dispatch_meta:{"currentRiderId":"202","telegramMessageRef":null}',
            ]),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: (JSON.parse(await request.text()) as { remarks: string[] }).remarks });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 7788 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '904',
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
  JSON.parse(await response.text()) as { success: boolean };
  const finalRemarksCall = calls.filter((call) => new URL(call.url).pathname === '/api/admin/orders/remarks').pop();

  assert.ok(finalRemarksCall);
  assert.equal(readRemarksPayload(finalRemarksCall).orderId, '904');
  assert.match(JSON.stringify(readRemarksPayload(finalRemarksCall).remarks), /note:keep-me/);
  assert.deepEqual(readDispatchMetaFromRemarksPayload(finalRemarksCall).telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
});

test('manual assign 仅 remarks 回写失败时仍不阻断主流程', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '905',
            remarksJson: JSON.stringify(['note:keep-me']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/905/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9988 } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: false, error: 'db_busy' }, 500);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '905',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/905/status'));
});

test('manual assign telegram 失败时仅返回最小错误字段', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '906',
            remarksJson: JSON.stringify(['note:keep-me']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/906/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: false, error: 'telegram_down' }, 500);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '906',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, telegram_notification, telegram_dispatch } = JSON.parse(await response.text()) as {
    success: boolean;
    telegram_notification: { success: boolean; error: string };
    telegram_dispatch?: unknown;
  };

  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
  assert.equal(response.status, 200);
  assert.equal(success, true);
  assert.equal(telegram_dispatch, undefined);
  assert.equal(telegram_notification.success, false);
  assert.ok(telegram_notification.error.length > 0);
});

test('manual assign 页面数字 slug 不得覆盖订单真实 shopSlug', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '908',
            remarksJson: JSON.stringify(['note:keep-me']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/908/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9990 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '908',
        riderId: '202',
        shopSlug: '103',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const body = JSON.parse(await response.text()) as { success: boolean };

  const telegramCall = calls.find((call) => new URL(call.url).pathname === '/api/telegram/send');

  assert.ok(telegramCall);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);

  const telegramBody = JSON.parse(telegramCall.body) as { shopSlug?: string; shop_slug?: string };
  assert.equal(telegramBody.shopSlug || telegramBody.shop_slug, 'shop-a');
});

test('manual assign 仅依赖 admin_token cookie 时仍会读取 master settings 并发送 telegram', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      assert.equal(request.headers.get('authorization'), 'Bearer test-admin-cookie-token');
      assert.equal(request.headers.get('cookie'), null);
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      assert.equal(request.headers.get('authorization'), 'Bearer test-admin-cookie-token');
      assert.equal(request.headers.get('cookie'), null);
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '909',
            remarksJson: JSON.stringify(['note:keep-me']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/909/status') {
      assert.equal(request.headers.get('authorization'), 'Bearer test-admin-cookie-token');
      assert.equal(request.headers.get('cookie'), null);
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/settings/master') {
      assert.equal(request.headers.get('authorization'), 'Bearer test-admin-cookie-token');
      assert.equal(request.headers.get('cookie'), 'admin_token=test-admin-cookie-token');
      return jsonResponse({ success: true, settings: { server: { telegramWebhookSecret: 'remote-secret' } } });
    }

    if (url.pathname === '/api/telegram/send') {
      assert.equal(request.headers.get('authorization'), null);
      assert.equal(request.headers.get('cookie'), 'admin_token=test-admin-cookie-token');
      return jsonResponse({ success: true, result: { message_id: 9991 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_token=test-admin-cookie-token',
      },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '909',
        riderId: '202',
        shopSlug: '103',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    telegram_notification?: { success: boolean; error: string };
    telegram_dispatch?: unknown;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.telegram_notification, undefined);
  assert.equal(body.telegram_dispatch, undefined);
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/settings/master'));
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('manual assign 缺少 callback secret 时仍发送无接单按钮 telegram', async (t) => {
  useTestEnv(t);
  delete process.env.TELEGRAM_CALLBACK_SECRET;

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        orders: [
          {
            id: '907',
            remarksJson: JSON.stringify(['note:keep-me']),
            shopSlug: 'shop-a',
            shopName: 'Shop A',
            tableInfo: 'Address',
            totalAmount: 100,
            userPhone: '381600000000',
            status: 'awaiting_courier',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders/907/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9989 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '907',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    telegram_notification?: { success: boolean; error: string };
    telegram_dispatch?: unknown;
  };

  const telegramCall = calls.find((call) => new URL(call.url).pathname === '/api/telegram/send');

  assert.ok(telegramCall);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.telegram_notification, undefined);
  assert.equal(body.telegram_dispatch, undefined);

  const telegramBody = JSON.parse(telegramCall.body) as { reply_markup?: unknown };
  assert.equal(findTelegramButton(telegramBody.reply_markup, '接单'), undefined);
  assert.equal(findTelegramButton(telegramBody.reply_markup, '暂不接单'), undefined);
});

test('manual assign latest remarks 重读失败时不得覆盖 remarks 且不阻断主流程', async (t) => {
  useTestEnv(t);
  let orderReadCount = 0;

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      orderReadCount += 1;
      if (orderReadCount === 1) {
        return jsonResponse({
          success: true,
          orders: [
            {
              id: '906',
              remarksJson: JSON.stringify(['note:keep-me']),
              shopSlug: 'shop-a',
              shopName: 'Shop A',
              tableInfo: 'Address',
              totalAmount: 100,
              userPhone: '381600000000',
              status: 'awaiting_courier',
            },
          ],
        });
      }
      return new Response('{', {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/admin/orders/906/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9988 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderAssign({
    request: new Request('https://example.com/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId: '906',
        riderId: '202',
        shopSlug: 'shop-a',
        pickupEtaMinutes: 12,
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(orderReadCount, 2);
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/906/status'));
});

test('publish dispatch 订单快照缺失时返回 order_snapshot_unavailable 且不发 telegram', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({ success: true, orders: [] });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '697',
        action: 'publish',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'order_snapshot_unavailable');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch 骑手读取 HTTP 非 2xx 失败时直接返回上游错误而不是 no_available_riders', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/910/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: false, error: 'riders_upstream_failed' }, 503);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '910',
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
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 503);
  assert.equal(success, false);
  assert.equal(error, 'riders_upstream_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch 骑手读取 HTTP 200 success:false 时直接返回上游错误而不是 no_available_riders', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/912/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: false, error: 'riders_payload_failed' }, 200);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '912',
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
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_payload_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch /api/admin/riders 返回空响应时直接返回读取失败而不是 no_available_riders', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/917/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return new Response('', {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '917',
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
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_upstream_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch /api/admin/riders 返回坏 JSON 时直接返回读取失败而不是 no_available_riders', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/918/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return new Response('{', {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '918',
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
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_upstream_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch /api/admin/riders 返回空对象时直接返回读取失败而不是 no_available_riders', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/920/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({}, 200);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '920',
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
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_upstream_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch 指定的 forced rider 不存在时返回 forced_rider_not_found 且不发 telegram', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/921/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({
        riders: [
          { id: '202', name: 'Rider 1', phone: '381641234567', telegramChatId: 'chat-1', status: 'available' },
        ],
      });
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
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(success, false);
  assert.equal(error, 'forced_rider_not_found');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('publish dispatch 成功时骑手列表为空返回 success:true 且不触发 telegram', async (t) => {
  useTestEnv(t);

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/913/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: true, riders: [] });
    }

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

  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { success: boolean };
  assert.equal(body.success, true);
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

/* 负例 1: 骑手读取 HTTP 非 2xx 失败 */
test('republish_on_timeout 骑手读取 HTTP 非 2xx 失败时直接返回上游错误而不是 no_next_rider', async (t) => {
  useTestEnv(t);
  const originalMeta = {
    lastRiderDecision: {
      action: 'accepted' as const,
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-10T10:00:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-10T10:00:00.000Z',
    currentExpiresAt: '2026-04-10T10:05:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
  };

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/911/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: false, error: 'riders_backend_unavailable' }, 502);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '911',
        action: 'republish_on_timeout',
        remarksJson: JSON.stringify([`dispatch_meta:${JSON.stringify(originalMeta)}`]),
        status: 'awaiting_courier',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_backend_unavailable');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

/* 负例 2: 骑手读取 HTTP 200 success:false */
test('republish_on_timeout 骑手读取 HTTP 200 success:false 时直接返回上游错误而不是 no_next_rider', async (t) => {
  useTestEnv(t);
  const originalMeta = {
    lastRiderDecision: {
      action: 'accepted' as const,
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-10T10:00:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-10T10:00:00.000Z',
    currentExpiresAt: '2026-04-10T10:05:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
  };

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/914/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: false, error: 'riders_payload_failed' }, 200);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '914',
        action: 'republish_on_timeout',
        remarksJson: JSON.stringify([`dispatch_meta:${JSON.stringify(originalMeta)}`]),
        status: 'awaiting_courier',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_payload_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

/* 负例 3: 骑手返回非对象 payload */
test('republish_on_timeout /api/admin/riders 返回非对象 payload 时直接返回读取失败而不是 no_next_rider', async (t) => {
  useTestEnv(t);
  const originalMeta = {
    lastRiderDecision: {
      action: 'accepted' as const,
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-10T10:00:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-10T10:00:00.000Z',
    currentExpiresAt: '2026-04-10T10:05:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
  };

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/919/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse([], 200);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '919',
        action: 'republish_on_timeout',
        remarksJson: JSON.stringify([`dispatch_meta:${JSON.stringify(originalMeta)}`]),
        status: 'awaiting_courier',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_upstream_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

/* 负例 4: 骑手返回空对象 */
test('republish_on_timeout /api/admin/riders 返回空对象时直接返回读取失败而不是 no_next_rider', async (t) => {
  useTestEnv(t);
  const originalMeta = {
    lastRiderDecision: {
      action: 'accepted' as const,
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-10T10:00:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-10T10:00:00.000Z',
    currentExpiresAt: '2026-04-10T10:05:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
  };

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/921/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({}, 200);
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '921',
        action: 'republish_on_timeout',
        remarksJson: JSON.stringify([`dispatch_meta:${JSON.stringify(originalMeta)}`]),
        status: 'awaiting_courier',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, error } = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.ok(!response.ok);
  assert.equal(response.status, 502);
  assert.equal(success, false);
  assert.equal(error, 'riders_upstream_failed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('republish_on_timeout 真正空骑手列表时保持 no_next_rider 语义', async (t) => {
  useTestEnv(t);
  const originalMeta = {
    lastRiderDecision: {
      action: 'accepted' as const,
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-10T10:00:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-10T10:00:00.000Z',
    currentExpiresAt: '2026-04-10T10:05:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
  };

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/915/status') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: true, riders: [] });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true, remarks: JSON.parse(await request.text()).remarks });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '915',
        action: 'republish_on_timeout',
        remarksJson: JSON.stringify([`dispatch_meta:${JSON.stringify(originalMeta)}`]),
        status: 'awaiting_courier',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, telegram_dispatch } = JSON.parse(await response.text()) as { success: boolean; telegram_dispatch: { skippedReason: 'no_next_rider' } };

  assert.equal(response.status, 200);
  assert.equal(success, true);
  assert.equal(telegram_dispatch.skippedReason, 'no_next_rider');
  assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});

test('republish_on_timeout 非 awaiting_courier 时也要通过 telegram_dispatch.skippedReason 暴露跳过原因', async (t) => {
  useTestEnv(t);
  const originalMeta = {
    lastRiderDecision: {
      action: 'accepted' as const,
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-10T10:00:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-10T10:00:00.000Z',
    currentExpiresAt: '2026-04-10T10:05:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
  };

  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/admin/orders/901/status') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '901',
        action: 'republish_on_timeout',
        remarksJson: JSON.stringify([`dispatch_meta:${JSON.stringify(originalMeta)}`]),
        status: 'delivering',
        shopSlug: 'shop-a',
        shopName: 'Shop A',
        tableInfo: 'Address',
        totalAmount: 100,
        userPhone: '381600000000',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const { success, telegram_dispatch } = JSON.parse(await response.text()) as { success: boolean; telegram_dispatch: { skippedReason: 'order_status_changed' } };

  assert.equal(response.status, 200);
  assert.equal(success, true);
  assert.equal(telegram_dispatch.skippedReason, 'order_status_changed');
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/admin/orders/remarks'));
  assert.ok(!calls.some((call) => new URL(call.url).pathname === '/api/telegram/send'));
});
