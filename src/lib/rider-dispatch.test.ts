import assert from 'node:assert/strict';
import test from 'node:test';

import { filterRiderActiveOrders, getRiderActionFlags } from './rider-dispatch.ts';

test('getRiderActionFlags ignores snake_case courier_phone on delivering orders', () => {
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
    canPickUp: false,
    canComplete: false,
  });
});

test('filterRiderActiveOrders ignores snake_case timestamps on awaiting_courier orders', () => {
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

  assert.equal(orders.length, 1);
});
