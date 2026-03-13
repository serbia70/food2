import test from 'node:test';
import assert from 'node:assert/strict';

import { getContactShopLabel } from './shop-chat-copy.ts';

test('联系商家按钮文案包含店铺名', () => {
	assert.equal(getContactShopLabel('Pizza Grill 02'), '联系 Pizza Grill 02');
});
