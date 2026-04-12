import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import * as riderDispatch from './rider-dispatch.ts';
import {
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
} from './rider-dispatch.ts';

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

test('TabOrders.astro uses getAdminDispatchStatusCopy and preserves rider feedback', async () => {
  const source = await fs.readFile(new URL('../components/admin/TabOrders.astro', import.meta.url), 'utf8');

  // 确保使用 getAdminDispatchStatusCopy
  assert.match(source, /getAdminDispatchStatusCopy\(o\.status\)/);

  // 确保保留骑手反馈标识
  assert.match(source, /骑手反馈：/);

  // 确保没有硬编码主状态文案
  assert.doesNotMatch(source, /骑手已接单/);
  assert.doesNotMatch(source, /骑手已取餐/);
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

test('dashboard script uses shared rider dashboard action helper instead of getRiderActionFlags', async () => {
  const source = await fs.readFile(new URL('../pages/rider/dashboard.astro', import.meta.url), 'utf8');

  assert.match(source, /resolveRiderDashboardActionState/);
  assert.doesNotMatch(source, /getRiderActionFlags/);
});

test('shared helper stays sourced from resolveRiderOrderAction semantics', () => {
  assert.equal(typeof riderDispatch.resolveRiderDashboardActionState, 'function');
  assert.match(String(riderDispatch.resolveRiderDashboardActionState), /resolveRiderOrderAction/);
});

test('dashboard script calls rider action route instead of update_status and renders summary sections', async () => {
  const source = await fs.readFile(new URL('../pages/rider/dashboard.astro', import.meta.url), 'utf8');

  assert.match(source, /进行中订单数/);
  assert.match(source, /涉及店铺数/);
  assert.match(source, /今日完成/);
  assert.match(source, /\/api\/rider\/action/);
  assert.doesNotMatch(source, /\/api\/order\/update_status/);
  assert.doesNotMatch(source, /buildDispatchMetaRemarks\(/);
});

test('dashboard script reads display fields from riderView instead of raw order fallbacks', async () => {
  const source = await fs.readFile(new URL('../pages/rider/dashboard.astro', import.meta.url), 'utf8');

  assert.match(source, /riderView\.shopName/);
  assert.match(source, /riderView\.shopAddress/);
  assert.match(source, /riderView\.deliveryAddress/);
  assert.match(source, /riderView\.shopMapUrl/);
  assert.match(source, /riderView\.deliveryMapUrl/);
  assert.match(source, /riderView\.orderStatusCopy/);
  assert.doesNotMatch(source, /order\?\.shopName/);
  assert.doesNotMatch(source, /order\?\.restaurantName/);
  assert.doesNotMatch(source, /order\?\.shopAddress/);
  assert.doesNotMatch(source, /order\?\.restaurantAddress/);
  assert.doesNotMatch(source, /order\?\.tableInfo/);
  assert.doesNotMatch(source, /order\?\.deliveryAddress/);
});
