import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMasterFocusShopId } from './master-focus-shop.ts';

test('合法 shop id 字符串应被保留', () => {
  assert.equal(normalizeMasterFocusShopId('12'), '12');
  assert.equal(normalizeMasterFocusShopId(15), '15');
});

test('非法或空值应回退为空字符串', () => {
  assert.equal(normalizeMasterFocusShopId('abc'), '');
  assert.equal(normalizeMasterFocusShopId(''), '');
  assert.equal(normalizeMasterFocusShopId(null), '');
});
