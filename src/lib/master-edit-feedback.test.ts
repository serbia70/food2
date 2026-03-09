import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEditShopSuccessMessage } from './master-edit-feedback.ts';

test('根据店铺名生成明确的保存成功提示', () => {
  assert.equal(
    buildEditShopSuccessMessage('Shop 02'),
    '已保存 Shop 02，页面将刷新以显示最新状态',
  );
});

test('缺少店铺名时回退为通用成功提示', () => {
  assert.equal(
    buildEditShopSuccessMessage(''),
    '店铺已保存，页面将刷新以显示最新状态',
  );
});
