import test from 'node:test';
import assert from 'node:assert/strict';

import { makeAdminChatMessageKey } from './admin-chat-message-key.ts';

test('相同聊天消息生成相同 key', () => {
	const msg = {
		shop_id: 2,
		sender_phone: '0613083888',
		sender_role: 'user',
		created_at: '2026-03-10 12:00:00',
		message: '你好',
	};
	assert.equal(makeAdminChatMessageKey(msg), makeAdminChatMessageKey(msg));
});
