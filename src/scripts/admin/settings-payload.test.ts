import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminSettingsPayload } from './settings-payload.ts';

test('buildAdminSettingsPayload: includes delivery fields and delivery_type', () => {
  const fd = new FormData();
  fd.set('open', '09:00');
  fd.set('close', '21:00');
  fd.set('zones', 'A,B');
  fd.set('fee', '120');
  fd.set('free_threshold', '999');
  fd.set('print_on_checkout', 'on');

  const payload = buildAdminSettingsPayload(fd, {
    deliveryType: 'platform',
    driversJson: '[]',
  });

  assert.equal(payload.delivery_type, 'platform');
  assert.deepEqual(payload.delivery, { zones: 'A,B', fee: 120, free_threshold: 999 });
  assert.deepEqual(payload.hours, { open: '09:00', close: '21:00' });
  assert.deepEqual(payload.print, { print_on_checkout: true });
  assert.deepEqual(payload.drivers, []);
});

test('buildAdminSettingsPayload: handles missing drivers JSON', () => {
  const fd = new FormData();
  const payload = buildAdminSettingsPayload(fd, { deliveryType: 'merchant' });
  assert.deepEqual(payload.drivers, []);
});
