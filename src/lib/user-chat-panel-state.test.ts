import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeUserChatMessages } from './user-chat-panel-state.ts';

test('聊天消息按店铺过滤并按时间升序排列', () => {
	const result = normalizeUserChatMessages([
		{ shop_id: 2, created_at: '2026-03-09 21:00:00', message: 'b' },
		{ shop_id: 1, created_at: '2026-03-09 20:00:00', message: 'x' },
		{ shop_id: 2, created_at: '2026-03-09 19:00:00', message: 'a' },
	], 2);

	assert.deepEqual(result.map((item) => item.message), ['a', 'b']);
});
