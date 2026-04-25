import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildDispatchMetaRemarks,
  resolveRiderOrderAction,
  resolveRiderUnifiedStatus,
} from './rider-dispatch.ts';

const riderDashboardSource = readFileSync(new URL('../pages/rider/dashboard.astro', import.meta.url), 'utf8');

test('resolveRiderUnifiedStatus hides awaiting_courier actions when rider cannot act', () => {
  assert.deepEqual(resolveRiderUnifiedStatus({
    status: 'awaiting_courier',
    courierPhone: '381641234567',
    remarksJson: JSON.stringify(buildDispatchMetaRemarks('', {
      lastRiderDecision: null,
      declinedRiderIds: [],
      currentRiderId: 'other-rider',
      currentAssignedAt: '2026-04-14T10:00:00.000Z',
      currentExpiresAt: '2026-04-14T10:10:00.000Z',
      invalidatedRiderIds: [],
      lastInvalidationReason: null,
      acceptedAt: '',
      pickedUpAt: '',
      completedAt: '',
      telegramMessageRef: null,
    })),
  }, {
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-14T10:05:00.000Z',
  }), {
    statusLabel: '待接单',
    primaryAction: '',
    secondaryAction: '',
    acceptedAt: '',
    pickedUpAt: '',
    completedAt: '',
  });
});

test('resolveRiderOrderAction accept ignores semantic-only dispatch_meta fields and keeps acceptedAt empty', () => {
  const result = resolveRiderOrderAction({
    action: 'accept',
    order: {
      status: 'awaiting_courier',
      remarksJson: JSON.stringify(buildDispatchMetaRemarks('', {
        lastRiderDecision: null,
        declinedRiderIds: [],
        currentRiderId: '',
        currentAssignedAt: '',
        currentExpiresAt: '',
        invalidatedRiderIds: [],
        lastInvalidationReason: null,
        acceptedAt: '',
        pickedUpAt: '',
        completedAt: '',
        telegramMessageRef: { chatId: 'chat-1', messageId: 7788 },
      })),
      courierPhone: '',
    },
    riderId: '202',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    nowIso: '2026-04-14T10:03:00.000Z',
  });

  assert.equal(result.allowed, true);
  assert.equal(result.error, '');
});

test('resolveRiderUnifiedStatus returns shared status/action semantics for telegram and dashboard', () => {
  assert.deepEqual(resolveRiderUnifiedStatus({
    status: 'awaiting_courier',
    courierPhone: '381641234567',
    remarksJson: JSON.stringify(buildDispatchMetaRemarks('', {
      lastRiderDecision: null,
      declinedRiderIds: [],
      currentRiderId: '202',
      currentAssignedAt: '2026-04-14T10:00:00.000Z',
      currentExpiresAt: '2026-04-14T10:10:00.000Z',
      invalidatedRiderIds: [],
      lastInvalidationReason: null,
      acceptedAt: '',
      pickedUpAt: '',
      completedAt: '',
      telegramMessageRef: null,
    })),
  }, {
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-14T10:05:00.000Z',
  }).primaryAction, '接单');
});

test('rider dashboard source uses belgrade time and unified action copy', () => {
  assert.match(riderDashboardSource, /Europe\/Belgrade/);
  assert.match(riderDashboardSource, /createButton\('取餐'/);
  assert.match(riderDashboardSource, /createButton\('送达'/);
});

test('resolveRiderUnifiedStatus keeps complete action when dispatch meta already has pickedUpAt but order status is still delivering', () => {
  assert.equal(resolveRiderUnifiedStatus({
    status: 'delivering',
    courierPhone: '381641234567',
    remarksJson: JSON.stringify(buildDispatchMetaRemarks('', {
      lastRiderDecision: null,
      declinedRiderIds: [],
      currentRiderId: '202',
      currentAssignedAt: '2026-04-14T10:00:00.000Z',
      currentExpiresAt: '2026-04-14T10:10:00.000Z',
      invalidatedRiderIds: [],
      lastInvalidationReason: null,
      acceptedAt: '2026-04-14T10:03:00.000Z',
      pickedUpAt: '2026-04-14T10:19:00.000Z',
      completedAt: '',
      telegramMessageRef: null,
    })),
  }, {
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-14T10:20:00.000Z',
  }).primaryAction, '送达');
});

test('rider-dispatch module still imports when Intl timezone formatter is unavailable', async () => {
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = class extends OriginalDateTimeFormat {
    constructor(locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      if (options?.timeZone === 'Europe/Belgrade') {
        throw new RangeError('Invalid time zone specified: Europe/Belgrade');
      }
      super(locales, options);
    }
  } as typeof Intl.DateTimeFormat;

  const moduleUrl = new URL(`./rider-dispatch.ts?intl-fallback=${Date.now()}`, import.meta.url).href;
  try {
    const imported = await import(moduleUrl);
    assert.equal(typeof imported.filterRiderDashboardOrders, 'function');
  } finally {
    Intl.DateTimeFormat = OriginalDateTimeFormat;
  }
});
