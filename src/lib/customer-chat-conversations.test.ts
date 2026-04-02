import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCustomerConversationList } from './customer-chat-conversations.ts';

test('可从聊天记录生成最近联系商家列表', () => {
	const result = buildCustomerConversationList([
		{ shopId: 2, createdAt: '2026-03-10 11:00:00', message: '你好02' },
		{ shopId: 1, createdAt: '2026-03-10 10:00:00', message: '你好01' },
	], {
		'1': { id: 1, name: 'Burger House', slug: '01' },
		'2': { id: 2, name: 'Pizza Grill 02', slug: '02' },
	});

	assert.equal(result[0]?.shopName, 'Pizza Grill 02');
	assert.equal(result[1]?.shopName, 'Burger House');
});

test('customer chat conversations source uses canonical chat fields', async () => {
	const { readFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const source = await readFile(resolve(process.cwd(), 'src/lib/customer-chat-conversations.ts'), 'utf8');

	assert.match(source, /shopId\?: unknown;/);
	assert.match(source, /createdAt\?: unknown;/);
	assert.match(source, /message\?\.shopId/);
	assert.match(source, /message\?\.createdAt/);
	assert.doesNotMatch(source, /shop_id/);
	assert.doesNotMatch(source, /created_at/);
});
