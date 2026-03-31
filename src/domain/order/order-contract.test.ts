import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOrderContract } from './order-contract.ts';

test('order contract accepts dispatch and rider snapshots in camelCase', () => {
  const order = parseOrderContract({
    id: 1,
    orderNo: 'A001',
    status: 'awaitingCourier',
    dispatch: {
      status: 'active',
      dispatchRound: 1,
      currentPoolIndex: 0,
    },
    rider: {
      id: 9,
      name: 'Rider One',
      phone: '0600',
      status: 'available',
    },
  });

  assert.equal(order.dispatch?.dispatchRound, 1);
  assert.equal(order.rider?.status, 'available');
});

test('order contract rejects snake_case dispatch/rider fields', () => {
  assert.throws(() =>
    parseOrderContract({
      id: 1,
      orderNo: 'A001',
      status: 'awaitingCourier',
      dispatch: {
        status: 'active',
        dispatch_round: 1,
        current_pool_index: 0,
      },
      rider: {
        id: 9,
        name: 'Rider One',
        phone: '0600',
        rider_status: 'available',
      },
    }),
  );
});

test('order contract rejects unknown order status', () => {
  assert.throws(() =>
    parseOrderContract({
      id: 1,
      orderNo: 'A001',
      status: 'foo',
    }),
  );
});

test('order contract rejects unknown dispatch status', () => {
  assert.throws(() =>
    parseOrderContract({
      id: 1,
      orderNo: 'A001',
      status: 'awaitingCourier',
      dispatch: {
        status: 'foo',
        dispatchRound: 1,
        currentPoolIndex: 0,
      },
    }),
  );
});

test('order contract rejects unknown rider status', () => {
  assert.throws(() =>
    parseOrderContract({
      id: 1,
      orderNo: 'A001',
      status: 'awaitingCourier',
      rider: {
        id: 9,
        name: 'Rider One',
        phone: '0600',
        status: 'foo',
      },
    }),
  );
});
