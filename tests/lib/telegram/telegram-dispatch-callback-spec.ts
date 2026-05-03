import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramClaimCallback,
  buildTelegramShortClaimCallback,
  parseTelegramClaimCallback,
} from '../../../src/lib/telegram-dispatch.ts';
import {
  createShortCallback,
  createSignedCallback,
  TEST_CHAT_ID,
  useTelegramCallbackSecret,
} from './telegram-dispatch-test-helpers.ts';

test('accept callback 超时后仍报 expired_callback', (t) => {
  useTelegramCallbackSecret(t);
  const callback = createSignedCallback('accept', Date.now() - 1_000);
  assert.throws(() => parseTelegramClaimCallback(callback), /expired_callback/);
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
});

test('buildTelegramClaimCallback 优先使用 secretOverride 而不是本地 env secret', () => {
  const original = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'local-secret';

  try {
    const callback = buildTelegramClaimCallback({
      orderId: 101,
      riderId: 202,
      riderName: 'Rider 1',
      restaurantId: 'shop-1',
      riderPhone: '381641234567',
      telegramChatId: TEST_CHAT_ID,
      action: 'accept',
      secretOverride: 'remote-secret',
    } as Parameters<typeof buildTelegramClaimCallback>[0] & { secretOverride: string });

    assert.throws(() => parseTelegramClaimCallback(callback), /invalid_signature/);
    process.env.TELEGRAM_CALLBACK_SECRET = 'remote-secret';
    const parsed = parseTelegramClaimCallback(callback);
    assert.equal(parsed.orderId, 101);
    assert.equal(parsed.action, 'accept');
  } finally {
    if (typeof original === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = original;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  }
});

test('buildTelegramShortClaimCallback 优先使用 secretOverride 而不是本地 env secret', () => {
  const original = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'local-secret';

  try {
    const callback = buildTelegramShortClaimCallback({
      orderId: 101,
      riderId: 202,
      riderName: 'Rider 1',
      restaurantId: 'shop-1',
      riderPhone: '381641234567',
      telegramChatId: TEST_CHAT_ID,
      action: 'accept',
      secretOverride: 'remote-secret',
    } as Parameters<typeof buildTelegramShortClaimCallback>[0] & { secretOverride: string });

    assert.throws(() => parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID }), /invalid_signature/);
    process.env.TELEGRAM_CALLBACK_SECRET = 'remote-secret';
    const parsed = parseTelegramClaimCallback(callback, {
      chatId: TEST_CHAT_ID,
      riderPhone: '381641234567',
      restaurantId: 'shop-1',
    });
    assert.equal(parsed.orderId, 101);
    assert.equal(parsed.action, 'accept');
  } finally {
    if (typeof original === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = original;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  }
});

test('短 accept callback 超时后仍报 expired_callback', (t) => {
  useTelegramCallbackSecret(t);
  const callback = createShortCallback('accept', Date.now() - 1_000);
  assert.throws(() => parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID }), /expired_callback/);
});

test('picked_up callback 超过原窗口后仍可 parse 成功', (t) => {
  useTelegramCallbackSecret(t);
  const expiresAt = Date.now() - 1_000;
  const callback = createShortCallback('picked_up', expiresAt);
  const parsed = parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID });
  assert.equal(parsed.action, 'picked_up');
  assert.equal(parsed.orderId, 101);
});

test('complete callback 超过原窗口后仍可 parse 成功', (t) => {
  useTelegramCallbackSecret(t);
  const expiresAt = Date.now() - 1_000;
  const callback = createShortCallback('complete', expiresAt);
  const parsed = parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID });
  assert.equal(parsed.action, 'complete');
  assert.equal(parsed.orderId, 101);
});

test('decline callback 超时后仍报 expired_callback', (t) => {
  useTelegramCallbackSecret(t);
  const callback = createShortCallback('decline', Date.now() - 1_000);
  assert.throws(() => parseTelegramClaimCallback(callback, { chatId: TEST_CHAT_ID }), /expired_callback/);
});

