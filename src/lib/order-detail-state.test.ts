import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOrderDetailState } from './order-detail-state.ts';

test('可生成订单详情面板状态', () => {
	const detail = buildOrderDetailState({
		orderNo: '260309002',
		totalAmount: 1275,
		status: 'pending',
		createdAt: '2026-03-09 21:49:00',
		tableInfo: 'hui, 0613083888, ruma1',
		itemsJson: JSON.stringify([{ name: '葱姜炒蟹', quantity: 1 }]),
	});

	assert.equal(detail.orderNo, '260309002');
	assert.equal(detail.amount, '1,275 RSD');
	assert.equal(detail.statusLabel, '等待接单');
	assert.equal(detail.address, 'hui, 0613083888, ruma1');
	assert.deepEqual(detail.items, ['葱姜炒蟹 x1']);
});

test('order detail state source uses canonical order fields', async () => {
	const { readFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const source = await readFile(resolve(process.cwd(), 'src/lib/order-detail-state.ts'), 'utf8');

	assert.match(source, /order\?\.orderNo/);
	assert.match(source, /order\?\.totalAmount/);
	assert.match(source, /order\?\.createdAt/);
	assert.match(source, /order\?\.itemsJson/);
	assert.match(source, /order\?\.tableInfo/);
	assert.doesNotMatch(source, /order_no/);
	assert.doesNotMatch(source, /total_amount/);
	assert.doesNotMatch(source, /created_at/);
	assert.doesNotMatch(source, /items_json/);
	assert.doesNotMatch(source, /table_info/);
});
