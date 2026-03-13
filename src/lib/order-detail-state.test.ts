import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOrderDetailState } from './order-detail-state.ts';

test('可生成订单详情面板状态', () => {
	const detail = buildOrderDetailState({
		order_no: '260309002',
		total_amount: 1275,
		status: 'pending',
		created_at: '2026-03-09 21:49:00',
		table_info: 'hui, 0613083888, ruma1',
		items_json: JSON.stringify([{ name: '葱姜炒蟹', quantity: 1 }]),
	});

	assert.equal(detail.orderNo, '260309002');
	assert.equal(detail.amount, '1,275 RSD');
	assert.equal(detail.statusLabel, '等待接单');
	assert.equal(detail.address, 'hui, 0613083888, ruma1');
	assert.deepEqual(detail.items, ['葱姜炒蟹 x1']);
});
