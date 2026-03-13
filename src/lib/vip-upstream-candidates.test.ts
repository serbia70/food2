import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVipUpstreamCandidates } from './vip-upstream-candidates.ts';

test('buildVipUpstreamCandidates: returns multiple compatible payload shapes', () => {
  const list = buildVipUpstreamCandidates({ user_phone: ' 123 ', is_vip: true, vip_discount_percent: 95 });

  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 6);

  // First candidate should be the canonical expected shape.
  assert.deepEqual(list[0], { user_phone: '123', is_vip: 1, vip_discount_percent: 95 });

  // At least one candidate should use boolean is_vip.
  assert.ok(list.some((p: any) => p && p.user_phone === '123' && p.is_vip === true));

  // At least one candidate should use phone key.
  assert.ok(list.some((p: any) => p && p.phone === '123'));

  // At least one candidate should use ratio discount.
  assert.ok(list.some((p: any) => p && (p.vip_discount === 0.95 || p.discount === 0.95)));
});

test('buildVipUpstreamCandidates: disabling VIP forces 100%', () => {
  const list = buildVipUpstreamCandidates({ user_phone: '123', is_vip: 0, vip_discount_percent: 80 });
  assert.equal(list[0].vip_discount_percent, 100);
});
