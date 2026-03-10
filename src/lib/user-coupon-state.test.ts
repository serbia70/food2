import test from 'node:test';
import assert from 'node:assert/strict';

import { getCouponEmptyState, getServicePanelState } from './user-coupon-state.ts';

test('红包卡券空态文案可用', () => {
	const state = getCouponEmptyState();
	assert.equal(state.title, '暂无可用红包');
	assert.match(state.description, /优惠券/);
});

test('客服面板状态可用', () => {
	const state = getServicePanelState();
	assert.equal(state.title, '联系客服');
	assert.match(state.phone, /^\+/);
});
