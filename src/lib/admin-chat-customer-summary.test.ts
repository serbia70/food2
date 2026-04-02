import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCustomerSummary } from './admin-chat-customer-summary.ts';

test('可按手机号汇总最近外卖和预约', () => {
	const summary = buildCustomerSummary(
		'0613083888',
		[
			{ userPhone: '0613083888', orderNo: 'A1', createdAt: '2026-03-10 12:00:00' },
			{ userPhone: '0613999999', orderNo: 'B1', createdAt: '2026-03-10 13:00:00' },
		],
		[
			{ customerPhone: '0613083888', reservationTime: '2026-03-11 18:00:00' },
		],
	);

	assert.equal(summary.orderCount, 1);
	assert.equal(summary.reservationCount, 1);
	assert.equal(summary.latestOrder?.orderNo, 'A1');
	assert.equal(summary.latestReservation?.customerPhone, '0613083888');
	assert.equal(summary.recentOrders.length, 1);
});

test('customer summary source uses canonical customer fields', async () => {
	const { readFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const source = await readFile(resolve(process.cwd(), 'src/lib/admin-chat-customer-summary.ts'), 'utf8');

	assert.match(source, /item\?\.userPhone/);
	assert.match(source, /item\?\.customerPhone/);
	assert.match(source, /b\?\.createdAt/);
	assert.match(source, /a\?\.createdAt/);
	assert.match(source, /b\?\.reservationTime/);
	assert.match(source, /a\?\.reservationTime/);
	assert.doesNotMatch(source, /user_phone/);
	assert.doesNotMatch(source, /customer_phone/);
	assert.doesNotMatch(source, /created_at/);
	assert.doesNotMatch(source, /reservation_time/);
});
