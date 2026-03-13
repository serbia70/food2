import test from 'node:test';
import assert from 'node:assert/strict';

import { getCurrentShopSectionTitle, getOrderStatusLabel, getOtherShopSectionTitle } from './order-ui-copy.ts';

test('状态文案映射正确', () => {
	assert.equal(getOrderStatusLabel('pending'), '等待接单');
	assert.equal(getOrderStatusLabel('delivering'), '配送中');
	assert.equal(getOrderStatusLabel('completed'), '已完成');
});

test('当前店铺标题文案正确', () => {
	assert.equal(getCurrentShopSectionTitle('Pizza Grill 02'), 'Pizza Grill 02 · 当前店铺订单');
});

test('其他店铺标题文案正确', () => {
	assert.equal(getOtherShopSectionTitle(), '其他店铺订单');
});
