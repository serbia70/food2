import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVipUpstreamPayload } from './admin-vip-upstream-payload.ts';

test('buildVipUpstreamPayload: includes compatibility aliases', () => {
  const payload = buildVipUpstreamPayload({ user_phone: ' 123 ', is_vip: true, vip_discount_percent: 95 });

  assert.equal(payload.user_phone, '123');
  assert.equal(payload.phone, '123');
  assert.equal(payload.is_vip, 1);
  assert.equal(payload.vip_discount_percent, 95);
  assert.equal(payload.discount_percent, 95);
  assert.equal(payload.vip_discount, 0.95);
  assert.equal(payload.discount, 0.95);
});

test('buildVipUpstreamPayload: disabling VIP forces 100%', () => {
  const payload = buildVipUpstreamPayload({ user_phone: '123', is_vip: 0, vip_discount_percent: 80 });
  assert.equal(payload.is_vip, 0);
  assert.equal(payload.vip_discount_percent, 100);
  assert.equal(payload.vip_discount, 1);
});
