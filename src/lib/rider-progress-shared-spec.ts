import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDispatchMetaRemarks, readDispatchMetaFromRemarks } from './rider-dispatch.ts';
import {
  buildRiderProgressUpdate,
  buildRiderTelegramProgressEditPayload,
  buildRiderTelegramProgressSyncPayload,
  readOrderTelegramShopSlug,
} from './rider-progress-shared.ts';

function withTelegramCallbackSecret(run: () => void): void {
  const previous = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'test-secret';
  try {
    run();
  } finally {
    if (typeof previous === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = previous;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  }
}

function createRemarksJson(overrides: Partial<{
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
  telegramMessageRef: { chatId: string; messageId: number } | null;
}> = {}): string {
  return JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: null,
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-15T10:00:00.000Z',
    currentExpiresAt: '2026-04-15T10:05:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: overrides.acceptedAt || '',
    pickedUpAt: overrides.pickedUpAt || '',
    completedAt: overrides.completedAt || '',
    telegramMessageRef: overrides.telegramMessageRef === undefined ? null : overrides.telegramMessageRef,
  }));
}

test('buildRiderProgressUpdate 在 picked_up 时复用同一个 nowIso 并写入 remarksJson', () => {
  const nowIso = '2026-04-15T10:25:30.000Z';
  const result = buildRiderProgressUpdate({
    action: 'picked_up',
    orderId: '101',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    remarksJson: createRemarksJson({
      acceptedAt: '2026-04-15T10:03:00.000Z',
      telegramMessageRef: { chatId: '123456789', messageId: 7788 },
    }),
    nowIso,
    actionDecision: {
      expectedCurrentStatus: 'delivering',
      targetStatus: 'picked_up',
      feedbackWriteMode: 'update_status_remarks',
      nextRemarksJson: '[]',
    },
  });

  assert.equal(result.updateStatusPayload.id, 101);
  assert.equal(result.updateStatusPayload.expectedCurrentStatus, 'delivering');
  assert.equal(result.updateStatusPayload.status, 'picked_up');
  assert.equal(result.updateStatusPayload.courierName, undefined);
  assert.equal(result.updateStatusPayload.courierPhone, undefined);

  const nextMeta = readDispatchMetaFromRemarks(String(result.nextRemarksJson || ''));
  assert.equal(nextMeta.acceptedAt, '2026-04-15T10:03:00.000Z');
  assert.equal(nextMeta.pickedUpAt, nowIso);
  assert.equal(nextMeta.completedAt, '');
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: '123456789', messageId: 7788 });
  assert.equal(result.updateStatusPayload.remarksJson, result.nextRemarksJson);
});

test('buildRiderProgressUpdate 在 accept 时保留 actionDecision.nextRemarksJson 并透传骑手信息', () => {
  const result = buildRiderProgressUpdate({
    action: 'accept',
    orderId: '101',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    remarksJson: createRemarksJson(),
    nowIso: '2026-04-15T10:25:30.000Z',
    actionDecision: {
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: 'delivering',
      feedbackWriteMode: 'admin_remarks',
      nextRemarksJson: '["dispatch_meta:{}"]',
    },
  });

  assert.equal(result.nextRemarksJson, '["dispatch_meta:{}"]');
  assert.deepEqual(result.updateStatusPayload, {
    id: 101,
    expectedCurrentStatus: 'awaiting_courier',
    status: 'delivering',
    courierName: 'Rider 1',
    courierPhone: '381641234567',
  });
});

test('buildRiderTelegramProgressEditPayload 统一生成单消息编辑 payload', () => {
  withTelegramCallbackSecret(() => {
    const result = buildRiderTelegramProgressEditPayload({
      order: {
        orderNo: 'A476',
        shopName: '店铺A',
        tableInfo: 'Kralja Petra 10',
        userPhone: '381600000000',
      },
      orderId: '101',
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      remarksJson: createRemarksJson({
        acceptedAt: '2026-04-15T10:03:00.000Z',
        telegramMessageRef: { chatId: '123456789', messageId: 7788 },
      }),
      targetStatus: 'picked_up',
      fallbackShopSlug: 'shop-a',
    });

    assert.ok(result);
    assert.equal(result?.shopSlug, 'shop-a');
    assert.equal(result?.payload.chat_id, '123456789');
    assert.equal(result?.payload.message_id, 7788);
    assert.match(result?.payload.text || '', /状态：配送中/);
  });
});

test('buildRiderTelegramProgressSyncPayload 统一拼装发送 payload', () => {
  withTelegramCallbackSecret(() => {
    const result = buildRiderTelegramProgressSyncPayload({
      order: {
        orderNo: 'A477',
        shopName: '店铺B',
        tableInfo: 'Nemanjina 5',
        userPhone: '381611111111',
      },
      orderId: '102',
      riderId: '203',
      riderName: 'Rider 2',
      riderPhone: '381641111111',
      remarksJson: createRemarksJson({
        acceptedAt: '2026-04-15T10:03:00.000Z',
        telegramMessageRef: { chatId: '223456789', messageId: 8899 },
      }),
      targetStatus: 'delivering',
      fallbackShopSlug: 'shop-b',
    });

    assert.deepEqual(result, {
      shopSlug: 'shop-b',
      payload: {
        shopSlug: 'shop-b',
        chat_id: '223456789',
        message_id: 8899,
        text: result?.payload.text,
        reply_markup: result?.payload.reply_markup,
      },
    });
    assert.match(result?.payload.text || '', /状态：待取餐/);
  });
});

test('readOrderTelegramShopSlug 在 shopSlug 缺失时回退 restaurantId', () => {
  assert.equal(readOrderTelegramShopSlug({ restaurantId: 103 }, 'admin'), '103');
  assert.equal(readOrderTelegramShopSlug({ shopSlug: 'real-shop' }, '103'), 'real-shop');
  assert.equal(readOrderTelegramShopSlug({}, 'admin'), '');
});
