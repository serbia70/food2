process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramClaimCallback,
  buildTelegramDispatchMessage,
  buildTelegramDeepLink,
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
  assert.match(message.text, /约 15 分钟后可取/);
  assert.equal(message.replyMarkup.inline_keyboard[0]?.[0]?.text, '查看并接单');
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

test('buildTelegramDispatchMessage 在无 callback data 时只保留查看入口和电话', () => {
  const message = buildTelegramDispatchMessage({
    shopName: '101 店',
    address: 'Main St 1',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    phone: '0601',
    dashboardLink: 'https://food.example.com/rider/dashboard?orderId=88&restaurantId=101',
  });

  assert.deepEqual(message.replyMarkup.inline_keyboard[0], [
    { text: '查看并接单', url: 'https://food.example.com/rider/dashboard?orderId=88&restaurantId=101' },
    { text: '联系门店', url: 'tel:0601' },
  ]);
});
