import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUserCenterPanelState } from './user-center-panel-state.ts';

test('可将用户资料与店铺上下文聚合为共享面板状态', () => {
	const state = buildUserCenterPanelState({
		user: { name: '888', phone: '0613083889', login_account: '888' },
		currentShopName: 'Pizza Grill 02',
		currentShopSlug: '02',
		orders: [{ order_no: 'A1' }, { order_no: 'A2' }],
		addressSummary: 'hui chen · 0613083888 · veljka',
		membershipLabel: 'VIP · 积分 80',
	});

	assert.equal(state.userName, '888');
	assert.equal(state.currentShopName, 'Pizza Grill 02');
	assert.equal(state.currentShopSlug, '02');
	assert.equal(state.orderCount, 2);
	assert.equal(state.membershipLabel, 'VIP · 积分 80');
	assert.equal(state.addressSummary, 'hui chen · 0613083888 · veljka');
});
