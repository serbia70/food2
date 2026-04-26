import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramClaimCallback,
  parseTelegramClaimCallback,
} from '../../../src/lib/telegram-dispatch.ts';
import { TEST_CHAT_ID, useTelegramCallbackSecret } from './telegram-dispatch-test-helpers.ts';

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
});

