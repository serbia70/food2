import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeVipPayload } from './admin-vip-payload.ts';

test('normalizeVipPayload: coerces isVip and vipDiscountPercent', () => {
  assert.deepEqual(
    normalizeVipPayload({ userPhone: ' 123 ', isVip: true, vipDiscountPercent: '95' }),
    { userPhone: '123', isVip: 1, vipDiscountPercent: 95 },
  );

  assert.deepEqual(
    normalizeVipPayload({ userPhone: '123', isVip: 1, vipDiscountPercent: 90.2 }),
    { userPhone: '123', isVip: 1, vipDiscountPercent: 90 },
  );

  assert.deepEqual(
    normalizeVipPayload({ userPhone: '123', isVip: '0', vipDiscountPercent: 85 }),
    { userPhone: '123', isVip: 0, vipDiscountPercent: 100 },
  );
});

test('normalizeVipPayload: defaults discount when missing or invalid', () => {
  assert.deepEqual(
    normalizeVipPayload({ userPhone: '123', isVip: 1 }),
    { userPhone: '123', isVip: 1, vipDiscountPercent: 95 },
  );

  assert.deepEqual(
    normalizeVipPayload({ userPhone: '123', isVip: true, vipDiscountPercent: 'nope' }),
    { userPhone: '123', isVip: 1, vipDiscountPercent: 95 },
  );
});

test('normalizeVipPayload: empty phone stays empty string', () => {
  assert.deepEqual(
    normalizeVipPayload({ userPhone: '   ', isVip: true, vipDiscountPercent: 95 }),
    { userPhone: '', isVip: 1, vipDiscountPercent: 95 },
  );
});

test('admin vip payload source uses canonical vip fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/lib/admin-vip-payload.ts'), 'utf8');

  assert.match(source, /userPhone\?: unknown;/);
  assert.match(source, /isVip\?: unknown;/);
  assert.match(source, /vipDiscountPercent\?: unknown;/);
  assert.match(source, /const phone = String\(input\?\.userPhone \?\? ''\)\.trim\(\);/);
  assert.match(source, /const isVip = toVipFlag\(input\?\.isVip\);/);
  assert.match(source, /userPhone: phone,/);
  assert.match(source, /isVip: isVip,/);
  assert.match(source, /vipDiscountPercent: isVip === 1 \? toDiscountPercent\(input\?\.vipDiscountPercent, defaultDiscount\) : 100,/);

  assert.doesNotMatch(source, /user_phone/);
  assert.doesNotMatch(source, /is_vip/);
  assert.doesNotMatch(source, /vip_discount_percent/);
});
