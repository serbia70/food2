import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildDispatchMetaRemarks,
  buildRiderOrderMapUrl,
  buildRiderOrderView,
  filterRiderActiveOrders,
  filterRiderDashboardOrders,
  getAdminDispatchStatusCopy,
  getRiderActionFlags,
  getRiderDispatchState,
  readDispatchMetaFromRemarks,
  resolveRiderDashboardActionState,
  resolveRiderOrderAction,
  resolveRiderUnifiedStatus,
} from './rider-dispatch.ts';

const riderDashboardSource = readFileSync(new URL('../pages/rider/dashboard.astro', import.meta.url), 'utf8');

test('buildRiderOrderView returns shared shop and map fields', () => {
  const view = buildRiderOrderView({
    id: 18,
    status: 'delivering',
    shopName: 'Pizza One',
    shopAddress: 'Bulevar 1',
    shopMapUrl: '',
    tableInfo: 'Kralja Petra 10',
    totalAmount: 2300,
    pickupEtaMinutes: 18,
    courierPhone: '0611',
  });

  assert.equal(view.shopName, 'Pizza One');
  assert.equal(view.shopAddress, 'Bulevar 1');
  assert.match(view.shopMapUrl, /google\.com\/maps\/search/);
  assert.equal(view.deliveryAddress, 'Kralja Petra 10');
  assert.match(view.deliveryMapUrl, /google\.com\/maps\/search/);
  assert.equal(view.orderStatusCopy, '配送中');
  assert.equal(view.totalAmount, 2300);
  assert.equal(view.pickupEtaMinutes, 18);
  assert.equal(view.courierPhone, '0611');
});

test('buildRiderOrderMapUrl prefers direct link and falls back to address search', () => {
  assert.equal(buildRiderOrderMapUrl('https://maps.example/direct', 'Bulevar 1'), 'https://maps.example/direct');
  assert.match(buildRiderOrderMapUrl('', 'Bulevar 1'), /google\.com\/maps\/search/);
  assert.match(buildRiderOrderMapUrl('', 'Bulevar 1'), /Bulevar%201/);
  assert.equal(buildRiderOrderMapUrl('', ''), '');
});

test('buildRiderOrderMapUrl strips cash and remark suffixes from fallback address search', () => {
  const url = buildRiderOrderMapUrl('', 'hui, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)');

  assert.match(url, /google\.com\/maps\/search/);
  assert.match(url, /query=ruma1/);
  assert.doesNotMatch(url, /hui|0613083888|%E8%B4%A7%E5%88%B0%E4%BB%98%E6%AC%BE|Cash|%E5%A4%87%E6%B3%A8|remark/i);
});

test('buildRiderOrderMapUrl strips name and phone prefixes and keeps only delivery address', () => {
  const url = buildRiderOrderMapUrl('', '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)');

  assert.match(url, /google\.com\/maps\/search/);
  assert.match(url, /query=ruma1/);
  assert.doesNotMatch(url, /张三|0613083888|Cash|%E5%A4%87%E6%B3%A8/);
});

test('buildRiderOrderView falls back to restaurantAddress for pickup navigation when shopMapUrl is missing', () => {
  const view = buildRiderOrderView({
    shopName: 'Pizza One',
    restaurantAddress: 'Bulevar 1',
    shopMapUrl: '',
    tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
  });

  assert.match(view.shopMapUrl, /google\.com\/maps\/search/);
  assert.match(view.shopMapUrl, /Bulevar%201/);
  assert.match(view.deliveryMapUrl, /query=ruma1/);
  assert.doesNotMatch(view.deliveryMapUrl, /张三|0613083888|Cash|%E5%A4%87%E6%B3%A8/);
});

test('buildRiderOrderView preserves explicit shopMapUrl instead of fallback map search', () => {
  const view = buildRiderOrderView({
    shopName: 'Pizza One',
    shopAddress: 'Bulevar 1',
    shopMapUrl: 'https://maps.example.com/shop-explicit',
    tableInfo: 'Kralja Petra 10',
  });

  assert.equal(view.shopMapUrl, 'https://maps.example.com/shop-explicit');
  assert.match(view.deliveryMapUrl, /google\.com\/maps\/search/);
});

test('getRiderActionFlags and dispatch state stay aligned for picked_up orders', () => {
  const meta = readDispatchMetaFromRemarks(JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"202","currentAssignedAt":"2026-04-11T10:00:00.000Z","currentExpiresAt":"2026-04-11T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
  ]));

  const flags = getRiderActionFlags({ status: 'picked_up', courierPhone: '0611' }, '0611');
  const state = getRiderDispatchState({ status: 'picked_up', courierPhone: '0611' }, meta, '202');

  assert.deepEqual(flags, {
    canAccept: false,
    canDecline: false,
    canPickUp: false,
    canComplete: true,
  });
  assert.equal(state.canComplete, flags.canComplete);
  assert.equal(getAdminDispatchStatusCopy('picked_up'), '配送中');
  assert.equal(getAdminDispatchStatusCopy('completed'), '已完成');
});

test('getRiderDispatchState falls back to courierPhone for picked_up orders without dispatch_meta', () => {
  const meta = readDispatchMetaFromRemarks('');
  const flags = getRiderActionFlags({ status: 'picked_up', courierPhone: '0611' }, '0611');
  const state = getRiderDispatchState({ status: 'picked_up', courierPhone: '0611' }, meta, '202', undefined, '0611');

  assert.equal(flags.canComplete, true);
  assert.equal(state.canComplete, flags.canComplete);
  assert.equal(state.invalidReason, '');
});

test('getRiderActionFlags supports snake_case courier_phone on delivering orders', () => {
  const flags = getRiderActionFlags(
    {
      status: 'delivering',
      courier_phone: '13800138000',
    },
    '13800138000',
  );

  assert.deepEqual(flags, {
    canAccept: false,
    canDecline: false,
    canPickUp: true,
    canComplete: false,
  });
});

test('filterRiderActiveOrders supports snake_case timestamps on awaiting_courier orders', () => {
  const orders = filterRiderActiveOrders(
    [
      {
        id: 1,
        status: 'awaiting_courier',
        created_at: '2026-04-01T00:00:00.000Z',
      },
    ],
    '13800138000',
    '2026-04-09T12:00:00.000Z',
  );

  assert.equal(orders.length, 0);
});

test('filterRiderDashboardOrders returns pool active and today history from one dashboard view', () => {
  const orders = [
    {
      id: 1,
      status: 'awaiting_courier',
      createdAt: '2026-04-12T08:00:00.000Z',
    },
    {
      id: 2,
      status: 'delivering',
      courierPhone: '0611',
      createdAt: '2026-04-12T09:00:00.000Z',
    },
    {
      id: 3,
      status: 'completed',
      courierPhone: '0611',
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T11:00:00.000Z',
    },
    {
      id: 4,
      status: 'completed',
      courierPhone: '0611',
      createdAt: '2026-04-11T10:00:00.000Z',
      updatedAt: '2026-04-11T11:00:00.000Z',
    },
  ];

  assert.deepEqual(
    filterRiderDashboardOrders(orders, '0611', 'dashboard', '2026-04-12T12:00:00.000Z').map((item) => item.id),
    [1, 2, 3],
  );
});

test('filterRiderDashboardOrders treats history by Europe/Belgrade local day instead of UTC day', () => {
  const orders = [
    {
      id: 5,
      status: 'completed',
      courierPhone: '0611',
      updatedAt: '2026-04-12T22:30:00.000Z',
    },
    {
      id: 6,
      status: 'completed',
      courierPhone: '0611',
      updatedAt: '2026-04-12T20:30:00.000Z',
    },
  ];

  assert.deepEqual(
    filterRiderDashboardOrders(orders, '0611', 'history', '2026-04-12T23:30:00.000Z').map((item) => item.id),
    [5],
  );
});

test('resolveRiderOrderAction allows picked_up fallback by courierPhone without dispatch_meta', () => {
  const result = resolveRiderOrderAction({
    action: 'picked_up',
    order: {
      status: 'delivering',
      remarksJson: '',
      courierPhone: '381641234567',
    },
    riderId: '202',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:00:00.000Z',
  });

  assert.equal(result.allowed, true);
  assert.equal(result.error, '');
  assert.equal(result.expectedCurrentStatus, 'delivering');
  assert.equal(result.targetStatus, 'picked_up');
});

test('resolveRiderOrderAction rejects accept when order is no longer awaiting_courier', () => {
  const result = resolveRiderOrderAction({
    action: 'accept',
    order: {
      status: 'delivering',
      remarksJson: '',
      courierPhone: '381641234567',
    },
    riderId: '202',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:00:00.000Z',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.error, 'order_status_updated');
  assert.equal(result.expectedCurrentStatus, 'awaiting_courier');
});

test('resolveRiderOrderAction rejects accept when status is empty', () => {
  const result = resolveRiderOrderAction({
    action: 'accept',
    order: {
      status: '',
      remarksJson: '',
      courierPhone: '381641234567',
    },
    riderId: '202',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:00:00.000Z',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.error, 'order_status_updated');
});

test('resolveRiderDashboardActionState hides accept and decline when currentRiderId belongs to another rider', () => {
  const state = resolveRiderDashboardActionState({
    order: {
      status: 'awaiting_courier',
      remarksJson: JSON.stringify([
        'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"other-rider","currentAssignedAt":"2026-04-12T10:00:00.000Z","currentExpiresAt":"2026-04-12T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
      ]),
      courierPhone: '381641234567',
    },
    riderId: 'current-rider',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:03:00.000Z',
  });

  assert.equal(state.canAccept, false);
  assert.equal(state.canDecline, false);
  assert.equal(state.invalidReason, '已改派');
});

test('resolveRiderDashboardActionState hides accept and decline when current rider is already timed out', () => {
  const state = resolveRiderDashboardActionState({
    order: {
      status: 'awaiting_courier',
      remarks_json: JSON.stringify([
        'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"current-rider","currentAssignedAt":"2026-04-12T10:00:00.000Z","currentExpiresAt":"2026-04-12T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
      ]),
      courier_phone: '381641234567',
    },
    riderId: 'current-rider',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:06:00.000Z',
  });

  assert.equal(state.canAccept, false);
  assert.equal(state.canDecline, false);
  assert.equal(state.invalidReason, '接单超时');
});

test('resolveRiderDashboardActionState does not expose invalidReason for valid delivering pickup flow', () => {
  const state = resolveRiderDashboardActionState({
    order: {
      status: 'delivering',
      remarksJson: '',
      courierPhone: '381641234567',
    },
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:06:00.000Z',
  });

  assert.equal(state.canPickUp, true);
  assert.equal(state.invalidReason, '');
});

test('dispatch_meta preserves action times and telegram message ref', () => {
  const remarks = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: {
      action: 'accepted',
      riderId: '202',
      riderName: 'Rider 1',
      riderPhone: '381641234567',
      at: '2026-04-14T10:03:00.000Z',
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-14T10:00:00.000Z',
    currentExpiresAt: '2026-04-14T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '2026-04-14T10:19:00.000Z',
    completedAt: '2026-04-14T10:41:00.000Z',
    telegramMessageRef: { chatId: 'chat-1', messageId: 7788 },
  }));

  const meta = readDispatchMetaFromRemarks(remarks);
  assert.equal(meta.acceptedAt, '2026-04-14T10:03:00.000Z');
  assert.equal(meta.pickedUpAt, '2026-04-14T10:19:00.000Z');
  assert.equal(meta.completedAt, '2026-04-14T10:41:00.000Z');
  assert.deepEqual(meta.telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
});

test('dispatch_meta normalizes invalid telegramMessageRef to null', () => {
  const remarks = JSON.stringify(buildDispatchMetaRemarks('', {
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
    telegramMessageRef: { chatId: '', messageId: 0 },
  }));

  const meta = readDispatchMetaFromRemarks(remarks);
  assert.equal(meta.telegramMessageRef, null);
});

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
  const nextMeta = readDispatchMetaFromRemarks(result.nextRemarksJson);
  assert.equal(nextMeta.acceptedAt, '');
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
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
  }), {
    statusLabel: '待接单',
    primaryAction: '接单',
    secondaryAction: '暂不接单',
    acceptedAt: '',
    pickedUpAt: '',
    completedAt: '',
  });

  assert.deepEqual(resolveRiderUnifiedStatus({
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
      pickedUpAt: '',
      completedAt: '',
      telegramMessageRef: null,
    })),
  }, {
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-14T10:20:00.000Z',
  }), {
    statusLabel: '待取餐',
    primaryAction: '取餐',
    secondaryAction: '',
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '',
    completedAt: '',
  });

  assert.deepEqual(resolveRiderUnifiedStatus({
    status: 'picked_up',
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
  }), {
    statusLabel: '配送中',
    primaryAction: '送达',
    secondaryAction: '',
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '2026-04-14T10:19:00.000Z',
    completedAt: '',
  });

  assert.deepEqual(resolveRiderUnifiedStatus({
    status: 'completed',
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
      completedAt: '2026-04-14T10:41:00.000Z',
      telegramMessageRef: null,
    })),
  }, {
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-14T10:42:00.000Z',
  }), {
    statusLabel: '已送达',
    primaryAction: '',
    secondaryAction: '',
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '2026-04-14T10:19:00.000Z',
    completedAt: '2026-04-14T10:41:00.000Z',
  });
});

test('rider dashboard source uses belgrade time and unified action copy', () => {
  assert.match(riderDashboardSource, /Europe\/Belgrade/);
  assert.match(riderDashboardSource, /接单时间：/);
  assert.match(riderDashboardSource, /取餐时间：/);
  assert.match(riderDashboardSource, /送达时间：/);
  assert.match(riderDashboardSource, /createButton\('取餐'/);
  assert.match(riderDashboardSource, /createButton\('送达'/);
  assert.doesNotMatch(riderDashboardSource, /createButton\('已取餐'/);
  assert.doesNotMatch(riderDashboardSource, /createButton\('已送达'/);
  assert.doesNotMatch(riderDashboardSource, /replace\('T', ' '\)\.slice\(5, 16\)/);
});

test('resolveRiderUnifiedStatus keeps complete action when dispatch meta already has pickedUpAt but order status is still delivering', () => {
  assert.deepEqual(resolveRiderUnifiedStatus({
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
  }), {
    statusLabel: '配送中',
    primaryAction: '送达',
    secondaryAction: '',
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '2026-04-14T10:19:00.000Z',
    completedAt: '',
  });
});

