import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCurrentShopContext } from './current-shop-context.ts';

test('可根据 pathname 和店铺字典识别当前店铺上下文', () => {
  const result = resolveCurrentShopContext('/02', {
    '1': { id: '1', name: 'Burger House', slug: '01' },
    '2': { id: '2', name: 'Seafood Place', slug: '02' },
  });

  assert.equal(result.slug, '02');
  assert.equal(result.name, 'Seafood Place');
  assert.equal(result.id, '2');
});

test('未知 pathname 时至少保留 slug 上下文', () => {
  const result = resolveCurrentShopContext('/abc', {});

  assert.equal(result.slug, 'abc');
  assert.equal(result.name, '当前店铺');
});
