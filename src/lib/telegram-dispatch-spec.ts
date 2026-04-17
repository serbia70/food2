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
  assert.doesNotMatch(message.text, /店铺地图：|客户导航：|https:\/\/maps\.example\.com\/shop|https:\/\/maps\.example\.com\/customer/);
  assert.deepEqual(message.replyMarkup.inline_keyboard, [
    [
      { text: '取餐', callback_data: 'cb-pickup' },
    ],
    [
      { text: '取餐导航', url: 'https://maps.example.com/shop' },
      { text: '送餐导航', url: 'https://maps.example.com/customer' },
    ],
  ]);
});

test('buildRiderSingleMessageTelegram formats ISO timestamps as Belgrade HH:mm', () => {
  const message = buildRiderSingleMessageTelegram({
    orderNo: 'A477',
    shopName: '店铺B',
    address: 'Test Address',
    phone: '381600000001',
    statusLabel: '已送达',
    acceptedAtLabel: '2026-04-15T13:36:36.723Z',
    pickedUpAtLabel: '2026-04-15T13:46:36.723Z',
    completedAtLabel: '2026-04-15T13:50:40.560Z',
    shopMapUrl: '',
    deliveryMapUrl: '',
    primaryAction: null,
    secondaryAction: null,
  });

  assert.match(message.text, /接单时间：15:36/);
  assert.match(message.text, /取餐时间：15:46/);
  assert.match(message.text, /送达时间：15:50/);
  assert.doesNotMatch(message.text, /T13:36:36\.723Z|T13:46:36\.723Z|T13:50:40\.560Z/);
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

test('telegram send route 在前端取不到 token 时回退后端 telegram/send 并保留 message_id', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/shop-1/info') {
      return jsonResponse({ success: true, settings: {} });
    }

    if (url.pathname === '/api/master/init') {
      return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    }

    if (url.pathname === '/api/home') {
      return jsonResponse({ success: true, settings: {} });
    }

    if (url.pathname === '/api/telegram/send' && url.hostname === 'food2api.serbia70.com') {
      return jsonResponse({
        success: true,
        ok: true,
        result: { message_id: 7788 },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: 'shop-1',
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        reply_markup: { inline_keyboard: [] },
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  const body = await readJson(response);
  const backendCall = calls.find((call) => call.url === 'https://food2api.serbia70.com/api/telegram/send');

  assert.equal(response.status, 200);
  assert.ok(backendCall);
  assert.match(backendCall?.body || '', /"shopSlug":"shop-1"/);
  assert.match(backendCall?.body || '', /"chat_id":"123456789"/);
  assert.match(backendCall?.body || '', /"message_id":7788/);
  assert.match(backendCall?.body || '', /"reply_markup":\{"inline_keyboard":\[\]\}/);
  assert.equal((body.result as { message_id?: unknown })?.message_id, 7788);
  assert.equal(calls.some((call) => call.url.includes('api.telegram.org')), false);
});

test('telegram send route 在数字 shopSlug 场景跳过 /info 并继续走全局 token 解析', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/master/init') {
      return jsonResponse({ telegram_bot_token: 'bot-token-1' });
    }

    if (url.hostname === 'api.telegram.org') {
      return jsonResponse({ ok: true, result: { message_id: 9902 } });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: '103',
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        reply_markup: { inline_keyboard: [[{ text: '送达', callback_data: 'cb-complete' }]] },
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  const body = await readJson(response);
  const telegramCall = calls.find((call) => call.url.includes('/editMessageText'));

  assert.equal(response.status, 200);
  assert.ok(telegramCall);
  assert.match(telegramCall?.body || '', /"message_id":7788/);
  assert.match(telegramCall?.body || '', /"reply_markup":/);
  assert.equal((body.result as { message_id?: unknown })?.message_id, 9902);
  assert.equal(calls.some((call) => call.url === 'https://food2api.serbia70.com/103/info'), false);
});

test('telegram send route 在数字 shopSlug 且前端取不到 token 时回退后端但不透传数字 shopSlug', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/master/init') {
      return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    }

    if (url.pathname === '/api/home') {
      return jsonResponse({ success: true, settings: {} });
    }

    if (url.pathname === '/api/telegram/send' && url.hostname === 'food2api.serbia70.com') {
      return jsonResponse({
        success: true,
        ok: true,
        result: { message_id: 7788 },
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: '103',
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        reply_markup: { inline_keyboard: [[{ text: '送达', callback_data: 'cb-complete' }]] },
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  const body = await readJson(response);
  const backendCall = calls.find((call) => call.url === 'https://food2api.serbia70.com/api/telegram/send');

  assert.equal(response.status, 200);
  assert.ok(backendCall);
  assert.doesNotMatch(backendCall?.body || '', /"shopSlug":"103"/);
  assert.match(backendCall?.body || '', /"message_id":7788/);
  assert.equal((body.result as { message_id?: unknown })?.message_id, 7788);
});

test('buildAdminAssignedOrderTelegramMessage only keeps bilingual item lines and other labels stay Chinese', async () => {
  const { buildAdminAssignedOrderTelegramMessage } = await import('./telegram-dispatch.ts');

  const message = buildAdminAssignedOrderTelegramMessage({
    orderNo: '260415010',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    totalAmount: 1200,
    phone: '381600000000',
    pickupEtaMinutes: 15,
    scheduledFor: '',
    itemSummary: [
      '土豆牛肉饼 / Pljeskavica x2 · 600 RSD',
      '可乐 / Coca-Cola x1 · 200 RSD',
    ],
    shopMapUrl: 'https://maps.example.com/shop',
    deliveryMapUrl: 'https://maps.example.com/customer',
    claimCallbackData: 'cb-accept',
    declineCallbackData: 'cb-decline',
  });

  assert.match(message.text, /^你有新的指派订单/m);
  assert.match(message.text, /^订单号：260415010/m);
  assert.match(message.text, /^店铺：店铺A/m);
  assert.match(message.text, /^地址：Kralja Petra 10/m);
  assert.match(message.text, /^电话：381600000000/m);
  assert.match(message.text, /^金额：1200 RSD/m);
  assert.match(message.text, /^预计 15 分钟后可取/m);
  assert.match(message.text, /^菜品：/m);
  assert.match(message.text, /• 土豆牛肉饼 \/ Pljeskavica x2 · 600 RSD/);
  assert.match(message.text, /• 可乐 \/ Coca-Cola x1 · 200 RSD/);
  assert.doesNotMatch(message.text, /店铺地图：|客户导航：|https:\/\/maps\.example\.com\/shop|https:\/\/maps\.example\.com\/customer/);
  assert.doesNotMatch(message.text, /Nova dodeljena porudžbina|Broj porudžbine|Lokal|Adresa|Telefon|Iznos|Preuzimanje za|Stavke|Mapa lokala|Navigacija/);
  assert.deepEqual(message.replyMarkup.inline_keyboard, [
    [
      { text: '接单', callback_data: 'cb-accept' },
      { text: '暂不接单', callback_data: 'cb-decline' },
    ],
    [
      { text: '取餐导航', url: 'https://maps.example.com/shop' },
      { text: '送餐导航', url: 'https://maps.example.com/customer' },
    ],
  ]);
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
