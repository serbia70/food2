import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import { parseTelegramClaimCallback } from './telegram-dispatch.ts';

type TelegramClaimAction = 'accept' | 'decline' | 'picked_up' | 'complete';

const TEST_SECRET = 'telegram-dispatch-test-secret';
const TEST_CHAT_ID = '123456789';

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

test('accept callback 超时后仍报 expired_callback', (t) => {
  useTelegramCallbackSecret(t);

  const callback = createSignedCallback('accept', Date.now() - 1_000);

  assert.throws(
    () => parseTelegramClaimCallback(callback),
    /expired_callback/,
  );
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
