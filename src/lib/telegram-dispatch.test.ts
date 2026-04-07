process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdminAssignedOrderTelegramMessage,
  buildRiderDeliveryCompleteTelegramMessage,
  buildTelegramClaimCallback,
  buildTelegramDispatchMessage,
  buildTelegramDeepLink,
  buildTelegramShortClaimCallback,
  parseTelegramClaimCallback,
} from './telegram-dispatch.ts';

test('buildTelegramDeepLink points rider back to dashboard order with absolute url', () => {
  assert.equal(
    buildTelegramDeepLink({ baseUrl: 'https://food.example.com', restaurantId: '101', orderId: 88 }),
    'https://food.example.com/rider/dashboard?orderId=88&restaurantId=101',
  );
});

test('buildTelegramDispatchMessage includes eta and action labels', () => {
  const message = buildTelegramDispatchMessage({
    shopName: '101 店',
    address: 'Main St 1',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    phone: '0601',
    dashboardLink: 'https://food.example.com/rider/dashboard?orderId=88&restaurantId=101',
  });

  assert.match(message.text, /101 店有新单/);
  assert.match(message.text, /约 15 分钟后送达/);
  assert.equal(message.replyMarkup.inline_keyboard[0]?.[0]?.text, '查看订单');
});

test('telegram short claim callback fits Telegram callback_data limit and can be parsed', () => {
  const callbackData = buildTelegramShortClaimCallback({
    orderId: 88,
    riderId: 3,
    riderName: '陈工',
    restaurantId: '101',
    riderPhone: '0601',
    telegramChatId: 'chat-3',
    expiresAt: Date.now() + 60_000,
  });

  assert.match(callbackData, /^rc2\./);
  assert.ok(Buffer.byteLength(callbackData, 'utf8') <= 64);

  const parsed = parseTelegramClaimCallback(callbackData, { chatId: 'chat-3', riderPhone: '0601' });
  assert.equal(parsed.orderId, 88);
  assert.equal(parsed.riderId, 3);
  assert.equal(parsed.telegramChatId, 'chat-3');
  assert.equal(parsed.action, 'accept');
});

 test('telegram short decline callback fits Telegram callback_data limit and can be parsed', () => {
  const callbackData = buildTelegramShortClaimCallback({
    orderId: 89,
    riderId: 4,
    riderName: '拒单骑手',
    restaurantId: '101',
    riderPhone: '0602',
    telegramChatId: 'chat-4',
    expiresAt: Date.now() + 60_000,
    action: 'decline',
  });

  assert.match(callbackData, /^rc2\./);
  assert.ok(Buffer.byteLength(callbackData, 'utf8') <= 64);

  const parsed = parseTelegramClaimCallback(callbackData, { chatId: 'chat-4', riderPhone: '0602' });
  assert.equal(parsed.orderId, 89);
  assert.equal(parsed.riderId, 4);
  assert.equal(parsed.telegramChatId, 'chat-4');
  assert.equal(parsed.action, 'decline');
});

test('telegram short claim callback remains parseable across module instances', async () => {
  const callbackData = buildTelegramShortClaimCallback({
    orderId: 108,
    riderId: 6,
    riderName: '骑手888',
    restaurantId: '101',
    riderPhone: '0613888',
    telegramChatId: 'chat-888',
    expiresAt: Date.now() + 60_000,
  });

  const reloaded = await import(new URL(`./telegram-dispatch.ts?reload=${Date.now()}`, import.meta.url).href);
  const parsed = reloaded.parseTelegramClaimCallback(callbackData, { chatId: 'chat-888', riderPhone: '0613888' });

  assert.equal(parsed.orderId, 108);
  assert.equal(parsed.riderId, 6);
  assert.equal(parsed.telegramChatId, 'chat-888');
});

test('telegram claim callback round-trips order and rider identity', () => {
  const encoded = buildTelegramClaimCallback({
    orderId: 88,
    riderId: 3,
    riderName: '陈工',
    restaurantId: '101',
    riderPhone: '0601',
    telegramChatId: 'chat-3',
    expiresAt: Date.now() + 60_000,
  });
  const parsed = parseTelegramClaimCallback(encoded);
  assert.equal(parsed.orderId, 88);
  assert.equal(parsed.riderId, 3);
  assert.equal(parsed.restaurantId, '101');
  assert.equal(parsed.riderPhone, '0601');
  assert.ok(parsed.expiresAt > Date.now());
  assert.ok(parsed.sig);
});

test('telegram claim callback rejects tampered payload', () => {
  const encoded = buildTelegramClaimCallback({
    orderId: 88,
    riderId: 3,
    riderName: '陈工',
    restaurantId: '101',
    riderPhone: '0601',
    telegramChatId: 'chat-3',
    expiresAt: Date.now() + 60_000,
  });
  const raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
  raw.riderPhone = '0999';
  const tampered = Buffer.from(JSON.stringify(raw), 'utf8').toString('base64url');
  assert.throws(() => parseTelegramClaimCallback(tampered), /invalid_signature/);
});

test('telegram claim callback rejects expired payload', () => {
  const valid = buildTelegramClaimCallback({
    orderId: 88,
    riderId: 3,
    riderName: '陈工',
    restaurantId: '101',
    riderPhone: '0601',
    telegramChatId: 'chat-3',
    expiresAt: Date.now() + 60_000,
  });
  const raw = JSON.parse(Buffer.from(valid, 'base64url').toString('utf8')) as Record<string, unknown>;
  raw.expiresAt = Date.now() - 1;
  const expired = Buffer.from(JSON.stringify(raw), 'utf8').toString('base64url');
  assert.throws(() => parseTelegramClaimCallback(expired), /expired_callback/);
});

test('telegram claim callback rejects missing signature', () => {
  const valid = buildTelegramClaimCallback({
    orderId: 88,
    riderId: 3,
    riderName: '陈工',
    restaurantId: '101',
    riderPhone: '0601',
    telegramChatId: 'chat-3',
    expiresAt: Date.now() + 60_000,
  });
  const raw = JSON.parse(Buffer.from(valid, 'base64url').toString('utf8')) as Record<string, unknown>;
  delete raw.sig;
  const unsigned = Buffer.from(JSON.stringify(raw), 'utf8').toString('base64url');
  assert.throws(() => parseTelegramClaimCallback(unsigned), /invalid_signature/);
});

test('buildTelegramDispatchMessage 在无 callback data 时保留查看入口和 tel 联系按钮', () => {
  const message = buildTelegramDispatchMessage({
    shopName: '101 店',
    address: 'Main St 1',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    phone: '0601',
    dashboardLink: 'https://food.example.com/rider/dashboard?orderId=88&restaurantId=101',
  });

  assert.deepEqual(message.replyMarkup.inline_keyboard[0], [
    { text: '查看订单', url: 'https://food.example.com/rider/dashboard?orderId=88&restaurantId=101' },
    { text: '联系门店：0601', url: 'tel:0601' },
  ]);
});

test('buildAdminAssignedOrderTelegramMessage trims oversized item summary to keep telegram text deliverable', () => {
  const message = buildAdminAssignedOrderTelegramMessage({
    orderNo: 'A514',
    address: 'Cara Lazara 12',
    totalAmount: 2890,
    phone: '060123456',
    pickupEtaMinutes: 10,
    scheduledFor: '2026-04-04 12:30:00',
    claimCallbackData: 'rc2.test',
    declineCallbackData: 'rc2.decline',
    itemSummary: Array.from({ length: 120 }, (_, index) => `超长菜品名称-${index + 1}-非常非常非常长 x9`),
  });

  assert.ok(Buffer.byteLength(message.text, 'utf8') <= 3500);
  assert.match(message.text, /订单号：A514/);
  assert.match(message.text, /预约送达：2026-04-04 12:30:00/);
  assert.match(message.text, /菜品过多，已截断/);
  assert.deepEqual(message.replyMarkup.inline_keyboard[0]?.slice(0, 2), [
    { text: '接单', callback_data: 'rc2.test' },
    { text: '暂不接单', callback_data: 'rc2.decline' },
  ]);
});

test('buildAdminAssignedOrderTelegramMessage omits tel url button even when phone exists', () => {
  const message = buildAdminAssignedOrderTelegramMessage({
    orderNo: 'A600',
    address: 'Ruma 1',
    totalAmount: 905,
    phone: '0613083888',
    pickupEtaMinutes: 15,
    itemSummary: ['米饭 x1'],
  });

  assert.equal(message.replyMarkup.inline_keyboard.flat().some((button) => String(button?.url || '').startsWith('tel:0613083888')), false);
});

test('buildAdminAssignedOrderTelegramMessage renders accept and decline buttons only for awaiting_courier stage', () => {
  const message = buildAdminAssignedOrderTelegramMessage({
    orderNo: 'NO501',
    address: 'Beograd 1',
    totalAmount: 1200,
    phone: '0601',
    pickupEtaMinutes: 15,
    itemSummary: ['可乐 x1'],
    claimCallbackData: 'claim-1',
    declineCallbackData: 'decline-1',
  });

  assert.deepEqual(message.replyMarkup.inline_keyboard, [[
    { text: '接单', callback_data: 'claim-1' },
    { text: '暂不接单', callback_data: 'decline-1' },
  ]]);
});

test('buildRiderDeliveryCompleteTelegramMessage renders complete button for delivering stage', () => {
  const message = buildRiderDeliveryCompleteTelegramMessage({
    orderNo: 'NO501',
    address: 'Beograd 1',
    phone: '0601',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'complete-1',
  });

  assert.deepEqual(message.replyMarkup.inline_keyboard, [[
    { text: '送餐完成', callback_data: 'complete-1' },
  ]]);
  assert.match(message.text, /配送中/);
});

test('buildAdminAssignedOrderTelegramMessage delivering stage carries complete button when provided', () => {
  const message = buildAdminAssignedOrderTelegramMessage({
    orderNo: 'NO777',
    address: 'Beograd 7',
    totalAmount: 1880,
    phone: '0607',
    pickupEtaMinutes: 8,
    itemSummary: ['披萨 x1'],
    completeCallbackData: 'complete-777',
  } as any);

  assert.deepEqual(message.replyMarkup.inline_keyboard, [[
    { text: '送餐完成', callback_data: 'complete-777' },
  ]]);
  assert.match(message.text, /订单号：NO777/);
});
