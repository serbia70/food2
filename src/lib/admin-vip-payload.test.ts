import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeVipPayload } from './admin-vip-payload.ts';

test('normalizeVipPayload: coerces is_vip and discount percent', () => {
  assert.deepEqual(
    normalizeVipPayload({ user_phone: ' 123 ', is_vip: true, vip_discount_percent: '95' }),
    { user_phone: '123', is_vip: 1, vip_discount_percent: 95 },
  );

  assert.deepEqual(
    normalizeVipPayload({ user_phone: '123', is_vip: 1, vip_discount_percent: 90.2 }),
    { user_phone: '123', is_vip: 1, vip_discount_percent: 90 },
  );

  assert.deepEqual(
    normalizeVipPayload({ user_phone: '123', is_vip: '0', vip_discount_percent: 85 }),
    { user_phone: '123', is_vip: 0, vip_discount_percent: 100 },
  );
});

test('normalizeVipPayload: defaults discount when missing/invalid', () => {
  assert.deepEqual(
    normalizeVipPayload({ user_phone: '123', is_vip: 1 }),
    { user_phone: '123', is_vip: 1, vip_discount_percent: 95 },
  );

  assert.deepEqual(
    normalizeVipPayload({ user_phone: '123', is_vip: true, vip_discount_percent: 'nope' }),
    { user_phone: '123', is_vip: 1, vip_discount_percent: 95 },
  );
});

test('normalizeVipPayload: empty phone stays empty string', () => {
  assert.deepEqual(
    normalizeVipPayload({ user_phone: '   ', is_vip: true, vip_discount_percent: 95 }),
    { user_phone: '', is_vip: 1, vip_discount_percent: 95 },
  );
});
