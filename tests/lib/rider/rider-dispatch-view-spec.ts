import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContactableRiderRows,
  buildRiderOrderMapUrl,
  buildRiderOrderView,
  filterRiderActiveOrders,
  filterRiderDashboardOrders,
  getAdminDispatchStatusCopy,
  getRiderActionFlags,
  getRiderDispatchState,
  readDispatchMetaFromRemarks,
} from '../../../src/lib/rider-dispatch.ts';

test('buildContactableRiderRows normalizes snake_case telegram chat id for admin assign entry', () => {
  const [rider] = buildContactableRiderRows([
    {
      id: 202,
      name: 'Rider 1',
      phone: '381641234567',
      status: 'available' as const,
      telegram_chat_id: 'chat-snake',
    },
  ]);

  assert.equal((rider as { telegramChatId?: string } | undefined)?.telegramChatId, 'chat-snake');
});

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
  assert.match(view.shopMapUrl, /google\.com\/maps\/search/);
  assert.match(view.deliveryMapUrl, /google\.com\/maps\/search/);
  assert.equal(view.orderStatusCopy, '配送中');
});

test('buildRiderOrderMapUrl prefers direct link and falls back to address search', () => {
  assert.equal(buildRiderOrderMapUrl('https://maps.example/direct', 'Bulevar 1'), 'https://maps.example/direct');
  assert.match(buildRiderOrderMapUrl('', 'Bulevar 1'), /google\.com\/maps\/search/);
  assert.equal(buildRiderOrderMapUrl('', ''), '');
});

test('buildRiderOrderMapUrl strips cash and remark suffixes from fallback address search', () => {
  const url = buildRiderOrderMapUrl('', 'hui, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)');
  assert.match(url, /query=ruma1/);
  assert.doesNotMatch(url, /hui|0613083888|Cash/i);
});

test('buildRiderOrderMapUrl strips name and phone prefixes and keeps only delivery address', () => {
  const url = buildRiderOrderMapUrl('', '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)');
  assert.match(url, /query=ruma1/);
  assert.doesNotMatch(url, /张三|0613083888|Cash/);
});

test('buildRiderOrderView falls back to restaurantAddress for pickup navigation when shopMapUrl is missing', () => {
  const view = buildRiderOrderView({
    shopName: 'Pizza One',
    restaurantAddress: 'Bulevar 1',
    shopMapUrl: '',
    tableInfo: '张三, 0613083888, ruma1 [货到付款/Cash] (备注:不要辣)',
  });

  assert.match(view.shopMapUrl, /Bulevar%201/);
  assert.match(view.deliveryMapUrl, /query=ruma1/);
});

test('buildRiderOrderView preserves explicit shopMapUrl instead of fallback map search', () => {
  const view = buildRiderOrderView({
    shopName: 'Pizza One',
    shopAddress: 'Bulevar 1',
    shopMapUrl: 'https://maps.example.com/shop-explicit',
    tableInfo: 'Kralja Petra 10',
  });

  assert.equal(view.shopMapUrl, 'https://maps.example.com/shop-explicit');
});

test('getRiderActionFlags and dispatch state stay aligned for picked_up orders', () => {
  const meta = readDispatchMetaFromRemarks(JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"202","currentAssignedAt":"2026-04-11T10:00:00.000Z","currentExpiresAt":"2026-04-11T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
  ]));

  const flags = getRiderActionFlags({ status: 'picked_up', courierPhone: '0611' }, '0611');
  const state = getRiderDispatchState({ status: 'picked_up', courierPhone: '0611' }, meta, '202');

  assert.equal(state.canComplete, flags.canComplete);
  assert.equal(getAdminDispatchStatusCopy('picked_up'), '配送中');
});

test('getRiderDispatchState falls back to courierPhone for picked_up orders without dispatch_meta', () => {
  const meta = readDispatchMetaFromRemarks('');
  const flags = getRiderActionFlags({ status: 'picked_up', courierPhone: '0611' }, '0611');
  const state = getRiderDispatchState({ status: 'picked_up', courierPhone: '0611' }, meta, '202', undefined, '0611');
  assert.equal(state.canComplete, flags.canComplete);
});

test('getRiderActionFlags supports snake_case courier_phone on delivering orders', () => {
  const flags = getRiderActionFlags({ status: 'delivering', courier_phone: '13800138000' }, '13800138000');
  assert.deepEqual(flags, {
    canAccept: false,
    canDecline: false,
    canPickUp: true,
    canComplete: false,
  });
});

test('filterRiderActiveOrders supports snake_case timestamps on awaiting_courier orders', () => {
  const orders = filterRiderActiveOrders([{ id: 1, status: 'awaiting_courier', created_at: '2026-04-01T00:00:00.000Z' }], '13800138000', '2026-04-09T12:00:00.000Z');
  assert.equal(orders.length, 0);
});

test('filterRiderDashboardOrders returns pool active and today history from one dashboard view', () => {
  const orders = [
    { id: 1, status: 'awaiting_courier', createdAt: '2026-04-12T08:00:00.000Z' },
    { id: 2, status: 'delivering', courierPhone: '0611', createdAt: '2026-04-12T09:00:00.000Z' },
    { id: 3, status: 'completed', courierPhone: '0611', createdAt: '2026-04-12T10:00:00.000Z', updatedAt: '2026-04-12T11:00:00.000Z' },
    { id: 4, status: 'completed', courierPhone: '0611', createdAt: '2026-04-11T10:00:00.000Z', updatedAt: '2026-04-11T11:00:00.000Z' },
  ];
  assert.deepEqual(filterRiderDashboardOrders(orders, '0611', 'dashboard', '2026-04-12T12:00:00.000Z').map((item) => item.id), [1, 2, 3]);
});

test('filterRiderDashboardOrders treats history by Europe/Belgrade local day instead of UTC day', () => {
  const orders = [
    { id: 5, status: 'completed', courierPhone: '0611', updatedAt: '2026-04-12T22:30:00.000Z' },
    { id: 6, status: 'completed', courierPhone: '0611', updatedAt: '2026-04-12T20:30:00.000Z' },
  ];
  assert.deepEqual(filterRiderDashboardOrders(orders, '0611', 'history', '2026-04-12T23:30:00.000Z').map((item) => item.id), [5]);
});

