import test from 'node:test';
import assert from 'node:assert/strict';

import { makeAdminChatMessageKey } from './admin-chat-message-key.ts';

test('相同聊天消息生成相同 key', () => {
	const msg = {
		shopId: 2,
		senderPhone: '0613083888',
		senderRole: 'user',
		createdAt: '2026-03-10 12:00:00',
		message: '你好',
	};
	assert.equal(makeAdminChatMessageKey(msg), makeAdminChatMessageKey(msg));
});

test('admin chat message key source uses canonical chat fields', async () => {
	const { readFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const source = await readFile(resolve(process.cwd(), 'src/lib/admin-chat-message-key.ts'), 'utf8');

	assert.match(source, /message\?\.shopId/);
	assert.match(source, /message\?\.senderPhone/);
	assert.match(source, /message\?\.senderRole/);
	assert.match(source, /message\?\.createdAt/);
	assert.doesNotMatch(source, /shop_id/);
	assert.doesNotMatch(source, /sender_phone/);
	assert.doesNotMatch(source, /sender_role/);
	assert.doesNotMatch(source, /created_at/);
});
