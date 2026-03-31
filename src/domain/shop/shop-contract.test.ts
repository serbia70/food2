import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMenuContract, parseShopContract } from './shop-contract.ts';

test('shop contract accepts canonical camelCase fields', () => {
  const shop = parseShopContract({
    id: 101,
    slug: '101',
    name: 'Test Shop',
    deliveryEnabled: true,
    footerPhone: '123456',
  });

  assert.equal(shop.footerPhone, '123456');
  assert.equal(shop.deliveryEnabled, true);
});

test('shop contract rejects legacy snake_case fields', () => {
  assert.throws(() =>
    parseShopContract({
      id: 101,
      slug: '101',
      name: 'Test Shop',
      delivery_enabled: true,
      footer_phone: '123456',
    }),
  );
});

test('menu contract preserves nested category/product structure', () => {
  const menu = parseMenuContract([
    {
      id: 'cat-1',
      name: '主食',
      products: [{ id: 'p-1', name: '汉堡', price: 12, imageUrl: '/uploads/a.jpg' }],
    },
  ]);

  assert.equal(menu[0]?.products[0]?.imageUrl, '/uploads/a.jpg');
});
