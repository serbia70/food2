import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import {
  buildRiderAwaitingPickupTelegramMessage,
  buildRiderDeliveringTelegramMessage,
  buildRiderDeliveryCompleteTelegramMessage,
  buildRiderPickedUpTelegramMessage,
  buildRiderSingleMessageTelegram,
  buildTelegramClaimCallback,
  buildTelegramEditMessagePayload,
  buildTelegramShortClaimCallback,
  parseTelegramClaimCallback,
} from './telegram-dispatch.ts';
import { POST as sendTelegramRoute } from '../pages/api/telegram/send.ts';

type TelegramClaimAction = 'accept' | 'decline' | 'picked_up' | 'complete';

const TEST_SECRET = 'telegram-dispatch-test-secret';
const TEST_CHAT_ID = '123456789';

type FetchHandler = (request: Request) => Promise<Response>;

interface MockFetchCall {
  url: string;
  method: string;
  body: string;
}

function useTelegramCallbackSecret(t: TestContext): void {
  const original = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = TEST_SECRET;
  t.after(() => {
    if (typeof original === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = original;
      return;
    }
    delete process.env.TELEGRAM_CALLBACK_SECRET;
  });
}

function createSignedCallback(action: TelegramClaimAction, expiresAt: number): string {
  const payload = {
    orderId: 101,
    riderId: 202,
    riderName: 'Rider 1',
    restaurantId: 'shop-1',
    riderPhone: '381641234567',
    telegramChatId: TEST_CHAT_ID,
    expiresAt,
    action,
  };
  const sig = createHmac('sha256', TEST_SECRET)
    .update(JSON.stringify(payload))
    .digest('base64url');
  return Buffer.from(JSON.stringify({ ...payload, sig }), 'utf8').toString('base64url');
}

function toShortAction(action: TelegramClaimAction): 'a' | 'd' | 'p' | 'c' {
  if (action === 'decline') return 'd';
  if (action === 'picked_up') return 'p';
  if (action === 'complete') return 'c';
  return 'a';
}

function signShortCallbackParts(parts: string[]): string {
  return createHmac('sha256', TEST_SECRET)
    .update(['rc2', ...parts].join('.'))
    .digest('base64url')
    .slice(0, 8);
}

function hashChatId(chatId: string): string {
  return createHmac('sha256', TEST_SECRET)
    .update(`chat:${chatId}`)
    .digest('base64url')
    .slice(0, 6);
}

function createShortCallback(action: TelegramClaimAction, expiresAt: number): string {
  const parts = [
    toShortAction(action),
    (101).toString(36),
    (202).toString(36),
    Math.floor(expiresAt / 1000).toString(36),
    hashChatId(TEST_CHAT_ID),
    '381641234567',
    'Rider_1',
  ];
  return `rc2.${parts.join('.')}.${signShortCallbackParts(parts)}`;
}

function useMockFetch(t: TestContext, handler: FetchHandler): MockFetchCall[] {
  const calls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const cloned = request.clone();
    calls.push({
      url: request.url,
      method: request.method,
      body: await cloned.text(),
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

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

test('buildTelegramClaimCallback round-trip parses signed callback', (t) => {
  useTelegramCallbackSecret(t);

  const expiresAt = Date.now() + 60_000;
  const callback = buildTelegramClaimCallback({
    orderId: 101,
    riderId: 202,
    riderName: 'Rider 1',
    restaurantId: 'shop-1',
    riderPhone: '381641234567',
    telegramChatId: TEST_CHAT_ID,
    expiresAt,
    action: 'accept',
  });
  const parsed = parseTelegramClaimCallback(callback);

  assert.equal(parsed.action, 'accept');
  assert.equal(parsed.orderId, 101);
  assert.equal(parsed.riderId, 202);
  assert.equal(parsed.telegramChatId, TEST_CHAT_ID);
  assert.equal(parsed.riderPhone, '381641234567');
  assert.equal(parsed.restaurantId, 'shop-1');
});

test('accept callback 超时后仍报 expired_callback', (t) => {
  useTelegramCallbackSecret(t);

  const callback = createSignedCallback('accept', Date.now() - 1_000);

  assert.throws(
    () => parseTelegramClaimCallback(callback),
    /expired_callback/,
  );
});

test('buildTelegramShortClaimCallback round-trip parses short callback', (t) => {
  useTelegramCallbackSecret(t);

  const expiresAt = Date.now() + 60_000;
  const callback = buildTelegramShortClaimCallback({
    orderId: 101,
    riderId: 202,
    riderName: 'Rider 1',
    restaurantId: 'shop-1',
    riderPhone: '381641234567',
    telegramChatId: TEST_CHAT_ID,
    expiresAt,
    action: 'picked_up',
  });
  const parsed = parseTelegramClaimCallback(callback, {
    chatId: TEST_CHAT_ID,
    riderPhone: '381641234567',
    restaurantId: 'shop-1',
  });

  assert.equal(parsed.action, 'picked_up');
  assert.equal(parsed.orderId, 101);
  assert.equal(parsed.riderId, 202);
  assert.equal(parsed.telegramChatId, TEST_CHAT_ID);
  assert.equal(parsed.riderName, 'Rider_1');
  assert.equal(parsed.riderPhone, '381641234567');
  assert.equal(parsed.restaurantId, 'shop-1');
});

test('短 accept callback 超时后仍报 expired_callback', (t) => {
  useTelegramCallbackSecret(t);

  const callback = createShortCallback('accept', Date.now() - 1_000);

  assert.throws(
    () => parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID }),
    /expired_callback/,
  );
});

test('picked_up callback 超过原窗口后仍可 parse 成功', (t) => {
  useTelegramCallbackSecret(t);

  const expiresAt = Date.now() - 1_000;
  const callback = createShortCallback('picked_up', expiresAt);
  const parsed = parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID });

  assert.equal(parsed.action, 'picked_up');
  assert.equal(parsed.orderId, 101);
  assert.equal(parsed.riderId, 202);
  assert.equal(parsed.expiresAt, Math.floor(expiresAt / 1000) * 1000);
});

test('complete callback 超过原窗口后仍可 parse 成功', (t) => {
  useTelegramCallbackSecret(t);

  const expiresAt = Date.now() - 1_000;
  const callback = createShortCallback('complete', expiresAt);
  const parsed = parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID });

  assert.equal(parsed.action, 'complete');
  assert.equal(parsed.orderId, 101);
  assert.equal(parsed.riderId, 202);
  assert.equal(parsed.expiresAt, Math.floor(expiresAt / 1000) * 1000);
});

test('decline callback 超时后仍报 expired_callback', (t) => {
  useTelegramCallbackSecret(t);

  const callback = createShortCallback('decline', Date.now() - 1_000);

  assert.throws(
    () => parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID }),
    /expired_callback/,
  );
});

test('buildRiderSingleMessageTelegram 输出短动作文案与时间', () => {
  const message = buildRiderSingleMessageTelegram({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    statusLabel: '待取餐',
    acceptedAtLabel: '12:03',
    pickedUpAtLabel: '',
    completedAtLabel: '',
    shopMapUrl: 'https://maps.example.com/shop',
    deliveryMapUrl: 'https://maps.example.com/customer',
    primaryAction: { text: '取餐', callbackData: 'cb-pickup' },
    secondaryAction: null,
  });

  assert.match(message.text, /#A476 · 店铺A/);
  assert.match(message.text, /状态：待取餐/);
  assert.match(message.text, /接单时间：12:03/);
  assert.doesNotMatch(message.text, /已取餐/);
  assert.deepEqual(message.replyMarkup.inline_keyboard, [[
    { text: '取餐', callback_data: 'cb-pickup' },
  ]]);
});

test('buildTelegramEditMessagePayload 输出正确 payload', () => {
  const payload = buildTelegramEditMessagePayload({
    chatId: 'chat-1',
    messageId: 7788,
    text: '#A476 · 店铺A\n状态：已送达',
    replyMarkup: { inline_keyboard: [] },
  });

  assert.deepEqual(payload, {
    chat_id: 'chat-1',
    message_id: 7788,
    text: '#A476 · 店铺A\n状态：已送达',
    reply_markup: { inline_keyboard: [] },
  });
});

test('telegram send route 在带 message_id 时调用 editMessageText 并透传 upstream message_id', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'api.telegram.org') {
      return jsonResponse({
        ok: true,
        result: {
          message_id: 7788,
          chat: { id: TEST_CHAT_ID },
          text: 'edited text',
        },
      });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        replyMarkup: { inline_keyboard: [] },
        parseMode: 'HTML',
        disableWebPagePreview: true,
        telegram_bot_token: 'bot-token-1',
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  const body = await readJson(response);
  const telegramCall = calls.find((call) => call.url.includes('/editMessageText'));

  assert.equal(response.status, 200);
  assert.ok(telegramCall);
  assert.equal(telegramCall?.method, 'POST');
  assert.match(telegramCall?.url || '', /\/editMessageText$/);
  assert.match(telegramCall?.body || '', /"chat_id":"123456789"/);
  assert.match(telegramCall?.body || '', /"message_id":7788/);
  assert.match(telegramCall?.body || '', /"reply_markup":/);
  assert.match(telegramCall?.body || '', /"parse_mode":"HTML"/);
  assert.match(telegramCall?.body || '', /"disable_web_page_preview":true/);
  assert.equal((body.result as { message_id?: unknown })?.message_id, 7788);
});

test('telegram send route 忽略数组 replyMarkup 与空 parseMode', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'api.telegram.org') {
      return jsonResponse({ ok: true, result: { message_id: 9901 } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TEST_CHAT_ID,
        message_id: 9901,
        text: 'edited text',
        replyMarkup: [],
        parseMode: '   ',
        telegram_bot_token: 'bot-token-1',
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  const body = await readJson(response);
  const telegramCall = calls.find((call) => call.url.includes('/editMessageText'));

  assert.equal(response.status, 200);
  assert.ok(telegramCall);
  assert.doesNotMatch(telegramCall?.body || '', /"reply_markup":/);
  assert.doesNotMatch(telegramCall?.body || '', /"parse_mode":/);
  assert.equal((body.result as { message_id?: unknown })?.message_id, 9901);
});

test('buildRiderAwaitingPickupTelegramMessage uses awaiting-pickup semantics', () => {
  const message = buildRiderAwaitingPickupTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-pickup',
  });

  assert.match(message.text, /状态：待取餐/);
  assert.match(message.text, /金额：1200 RSD/);
  assert.match(message.text, /预计：15 分钟/);
  assert.equal(message.replyMarkup.inline_keyboard[0]?.[0]?.text, '取餐');
});

test('buildRiderDeliveringTelegramMessage uses delivering semantics', () => {
  const message = buildRiderDeliveringTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-complete',
  });

  assert.match(message.text, /状态：配送中/);
  assert.match(message.text, /金额：1200 RSD/);
  assert.match(message.text, /预计：15 分钟/);
  assert.equal(message.replyMarkup.inline_keyboard[0]?.[0]?.text, '送达');
});

test('legacy rider telegram builders delegate to renamed semantic builders', () => {
  const pickedUpLegacy = buildRiderPickedUpTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-pickup',
  });
  const awaitingPickup = buildRiderAwaitingPickupTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-pickup',
  });
  const completeLegacy = buildRiderDeliveryCompleteTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-complete',
  });
  const delivering = buildRiderDeliveringTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-complete',
  });

  assert.deepEqual(pickedUpLegacy, awaitingPickup);
  assert.deepEqual(completeLegacy, delivering);
});
