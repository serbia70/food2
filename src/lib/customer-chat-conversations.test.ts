import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCustomerConversationList } from './customer-chat-conversations.ts';

test('可从聊天记录生成最近联系商家列表', () => {
	const result = buildCustomerConversationList([
		{ shop_id: 2, created_at: '2026-03-10 11:00:00', message: '你好02' },
		{ shop_id: 1, created_at: '2026-03-10 10:00:00', message: '你好01' },
	], {
		'1': { id: 1, name: 'Burger House', slug: '01' },
		'2': { id: 2, name: 'Pizza Grill 02', slug: '02' },
	});

	assert.equal(result[0]?.shopName, 'Pizza Grill 02');
	assert.equal(result[1]?.shopName, 'Burger House');
});
