import test from 'node:test';
import assert from 'node:assert/strict';

import { applyTopupResultToShopViews } from './master-billing-state.ts';

test('根据 billing.shop_id 更新对应店铺余额', () => {
  const shops = [
    { id: 1, balanceRsd: 100 },
    { id: 2, balanceRsd: 200 },
  ];

  const result = applyTopupResultToShopViews(shops, {
    shop_id: 2,
    balance_rsd: 999,
  });

  assert.equal(result[0].balanceRsd, 100);
  assert.equal(result[1].balanceRsd, 999);
});

test('未匹配到店铺时返回原列表值', () => {
  const shops = [{ id: 1, balanceRsd: 100 }];
  const result = applyTopupResultToShopViews(shops, { shop_id: 9, balance_rsd: 888 });
  assert.equal(result[0].balanceRsd, 100);
});
