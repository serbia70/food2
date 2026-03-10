import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCustomerChatWorkspaceContext } from './customer-chat-workspace.ts';

test('首页进入时绑定当前商家上下文', () => {
	const ctx = buildCustomerChatWorkspaceContext({
		shopId: 2,
		shopSlug: '02',
		shopName: 'Pizza Grill 02',
		entry: 'home',
	});

	assert.equal(ctx.shopId, 2);
	assert.equal(ctx.shopSlug, '02');
	assert.equal(ctx.shopName, 'Pizza Grill 02');
	assert.equal(ctx.entry, 'home');
});
