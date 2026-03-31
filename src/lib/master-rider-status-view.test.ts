import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterRiderStatusView } from './master-rider-status-view.ts';

test('buildMasterRiderStatusView groups riders and normalizes missing values', () => {
  const view = buildMasterRiderStatusView({
    summary: { total_riders: 2, available_riders: 1, busy_riders: 1, offline_riders: 0, active_order_count: 1, cod_order_count: 1, delivery_fee_total: 150, cod_amount_total: 2300 },
    groups: {
      available: [{ rider_id: 1, name: 'A', phone: '111', status: 'available', active_order_count: 0, cod_order_count: 0, delivery_fee_total: 0, cod_amount_total: 0, orders: [] }],
      busy: [{ rider_id: 2, name: 'B', phone: '222', status: 'busy', active_order_count: 1, cod_order_count: 1, delivery_fee_total: 150, cod_amount_total: 2300, orders: [{ order_id: 9, order_no: 'D9', shop_name: 'Shop', status: 'delivering', is_cash_on_delivery: true, order_amount: 2300, delivery_fee: 150, cash_to_collect: 2300 }] }],
      offline: [{ rider_id: 3, name: 'C', phone: '333', status: 'offline', orders: [{ order_id: 10, order_no: 'D10', shop_id: 8, status: 'completed', is_cash_on_delivery: false }] }],
    },
  });

  assert.equal(view.summary.totalRiders, 2);
  assert.equal(view.groups.available[0].statusLabel, '空闲');
  assert.equal(view.groups.busy[0].statusLabel, '送餐中');
  assert.equal(view.groups.offline[0].statusLabel, '下班');
  assert.equal(view.groups.busy[0].orders[0].cashTagLabel, '代收');
  assert.equal(view.groups.offline[0].orders[0].cashTagLabel, '非代收');
  assert.equal(view.groups.offline[0].orders[0].deliveryFee, 0);
  assert.equal(view.groups.offline[0].orders[0].cashToCollect, 0);
});

test('buildMasterRiderStatusView keeps empty groups and defaults missing summary numbers to zero', () => {
  const view = buildMasterRiderStatusView({
    summary: {},
    groups: {},
  });

  assert.equal(view.summary.totalRiders, 0);
  assert.equal(view.summary.availableRiders, 0);
  assert.equal(view.summary.busyRiders, 0);
  assert.equal(view.summary.offlineRiders, 0);
  assert.equal(view.summary.activeOrderCount, 0);
  assert.equal(view.summary.codOrderCount, 0);
  assert.equal(view.summary.deliveryFeeTotal, 0);
  assert.equal(view.summary.codAmountTotal, 0);
  assert.deepEqual(view.groups.available, []);
  assert.deepEqual(view.groups.busy, []);
  assert.deepEqual(view.groups.offline, []);
});

test('buildMasterRiderStatusView uses group key as source of truth for rider status', () => {
  const view = buildMasterRiderStatusView({
    groups: {
      busy: [{ rider_id: 7, name: 'X', phone: '999', status: 'available' }],
    },
  });

  assert.equal(view.groups.busy[0].status, 'busy');
  assert.equal(view.groups.busy[0].statusLabel, '送餐中');
});

test('buildMasterRiderStatusView coerces non-finite numbers to zero', () => {
  const view = buildMasterRiderStatusView({
    summary: {
      total_riders: Number.NaN,
      delivery_fee_total: Number.POSITIVE_INFINITY,
    },
    groups: {
      available: [{ rider_id: 1, delivery_fee_total: Number.NaN, orders: [{ order_id: 1, delivery_fee: Number.POSITIVE_INFINITY, cash_to_collect: Number.NaN }] }],
    },
  });

  assert.equal(view.summary.totalRiders, 0);
  assert.equal(view.summary.deliveryFeeTotal, 0);
  assert.equal(view.groups.available[0].deliveryFeeTotal, 0);
  assert.equal(view.groups.available[0].orders[0].deliveryFee, 0);
  assert.equal(view.groups.available[0].orders[0].cashToCollect, 0);
});
