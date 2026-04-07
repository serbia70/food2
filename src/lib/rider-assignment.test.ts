import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pickNextAvailableRider,
  buildAssignedOrderStatusPayload,
  readOnlineRiders,
} from './rider-assignment.ts';

test('readOnlineRiders keeps only available riders with phone and stable order', () => {
  const rows = readOnlineRiders([
    { id: 9, name: 'C', phone: '063', status: 'busy' },
    { id: 2, name: 'B', phone: '062', status: 'available' },
    { id: 1, name: 'A', phone: '061', status: 'available' },
    { id: 4, name: 'NoPhone', phone: '', status: 'available' },
  ]);

  assert.deepEqual(rows, [
    { id: 1, name: 'A', phone: '061', status: 'available' },
    { id: 2, name: 'B', phone: '062', status: 'available' },
  ]);
});

test('pickNextAvailableRider returns first rider when there is no cursor', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 1, name: 'A', phone: '061', status: 'available' },
      { id: 2, name: 'B', phone: '062', status: 'available' },
    ],
    lastAssignedRiderId: '',
  });

  assert.equal(rider?.id, 1);
});

test('pickNextAvailableRider advances after previous rider id', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 1, name: 'A', phone: '061', status: 'available' },
      { id: 2, name: 'B', phone: '062', status: 'available' },
      { id: 3, name: 'C', phone: '063', status: 'available' },
    ],
    lastAssignedRiderId: '2',
  });

  assert.equal(rider?.id, 3);
});

test('pickNextAvailableRider wraps to first rider when cursor points at last rider', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 1, name: 'A', phone: '061', status: 'available' },
      { id: 2, name: 'B', phone: '062', status: 'available' },
    ],
    lastAssignedRiderId: '2',
  });

  assert.equal(rider?.id, 1);
});

test('pickNextAvailableRider falls back to first rider when cursor rider is offline', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 2, name: 'B', phone: '062', status: 'available' },
      { id: 5, name: 'E', phone: '065', status: 'available' },
    ],
    lastAssignedRiderId: '99',
  });

  assert.equal(rider?.id, 2);
});

test('pickNextAvailableRider skips excluded riders and current rider', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 1, name: 'A', phone: '061', status: 'available' },
      { id: 2, name: 'B', phone: '062', status: 'available' },
      { id: 3, name: 'C', phone: '063', status: 'available' },
    ],
    lastAssignedRiderId: '3',
    excludedRiderIds: ['1'],
  });

  assert.equal(rider?.id, 2);
});

test('pickNextAvailableRider excludes riders regardless of type or whitespace', () => {
  const result = pickNextAvailableRider({
    riders: [
      { id: '1', name: 'A', phone: '123', status: 'available' },
      { id: '2', name: 'B', phone: '123', status: 'available' },
      { id: '3', name: 'C', phone: '123', status: 'available' },
      { id: '4', name: 'D', phone: '123', status: 'available' },
    ],
    lastAssignedRiderId: '1',
    excludedRiderIds: [' 2 ', 3],
  });

  assert.strictEqual(result?.id, '4');
});

test('pickNextAvailableRider returns null when only current rider remains', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: '1', name: 'A', phone: '061', status: 'available' },
      { id: '2', name: 'B', phone: '062', status: 'available' },
    ],
    lastAssignedRiderId: '1',
    excludedRiderIds: ['2'],
  });

  assert.equal(rider, null);
});

test('pickNextAvailableRider returns null when no rider remains after exclusion', () => {
  const rider = pickNextAvailableRider({
    riders: [
      { id: 1, name: 'A', phone: '061', status: 'available' },
    ],
    lastAssignedRiderId: '1',
    excludedRiderIds: ['1'],
  });

  assert.equal(rider, null);
});

test('buildAssignedOrderStatusPayload writes canonical awaiting_courier payload', () => {
  assert.deepEqual(
    buildAssignedOrderStatusPayload({
      rider: { id: 2, name: 'B', phone: '062', status: 'available' },
      pickupEtaMinutes: 15,
    }),
    {
      status: 'awaiting_courier',
      courierName: 'B',
      courierPhone: '062',
      courier_name: 'B',
      courier_phone: '062',
      pickupEtaMinutes: 15,
      pickup_eta_minutes: 15,
    },
  );
});
