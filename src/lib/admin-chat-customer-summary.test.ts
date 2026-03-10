import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCustomerSummary } from './admin-chat-customer-summary.ts';

test('可按手机号汇总最近外卖和预约', () => {
	const summary = buildCustomerSummary(
		'0613083888',
		[
			{ user_phone: '0613083888', order_no: 'A1', created_at: '2026-03-10 12:00:00' },
			{ user_phone: '0613999999', order_no: 'B1', created_at: '2026-03-10 13:00:00' },
		],
		[
			{ customer_phone: '0613083888', reservation_time: '2026-03-11 18:00:00' },
		],
	);

	assert.equal(summary.orderCount, 1);
	assert.equal(summary.reservationCount, 1);
	assert.equal(summary.latestOrder?.order_no, 'A1');
	assert.equal(summary.latestReservation?.customer_phone, '0613083888');
	assert.equal(summary.recentOrders.length, 1);
});
