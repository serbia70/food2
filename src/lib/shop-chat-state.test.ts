import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShopChatContext } from './shop-chat-state.ts';

test('可根据店铺和手机号生成聊天上下文', () => {
	const ctx = buildShopChatContext({
		shopId: 2,
		shopName: 'Pizza Grill 02',
		shopSlug: '02',
		userPhone: '0613083888',
	});

	assert.equal(ctx.shopId, 2);
	assert.equal(ctx.shopName, 'Pizza Grill 02');
	assert.equal(ctx.shopSlug, '02');
	assert.equal(ctx.userPhone, '0613083888');
	assert.equal(ctx.title, 'Pizza Grill 02 商家会话');
});
