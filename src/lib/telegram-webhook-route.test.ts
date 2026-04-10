import test from 'node:test';
import assert from 'node:assert/strict';

import { mapTelegramClaimErrorToCallbackText } from '../pages/api/telegram/webhook.ts';

test('mapTelegramClaimErrorToCallbackText maps business errors to callback text', () => {
  assert.equal(
    mapTelegramClaimErrorToCallbackText({ error: 'expired_callback' }),
    '操作已过期',
  );
  assert.equal(
    mapTelegramClaimErrorToCallbackText({ error: 'dispatch_invalidated', reason: '接单超时' }),
    '接单超时',
  );
  assert.equal(
    mapTelegramClaimErrorToCallbackText({ error: 'dispatch_invalidated', reason: '已改派' }),
    '已改派',
  );
  assert.equal(
    mapTelegramClaimErrorToCallbackText({ error: 'order_status_updated' }),
    '订单状态已更新',
  );
  assert.equal(
    mapTelegramClaimErrorToCallbackText({ error: 'order_completed' }),
    '订单已完成',
  );
  assert.equal(
    mapTelegramClaimErrorToCallbackText({ error: 'rider_identity_mismatch' }),
    '当前订单不属于你',
  );
  assert.equal(
    mapTelegramClaimErrorToCallbackText({ error: 'unknown_error' }),
    '操作失败',
  );
  assert.equal(
    mapTelegramClaimErrorToCallbackText({ error: 'dispatch_invalidated', reason: '其他原因' }),
    '操作失败',
  );
});
