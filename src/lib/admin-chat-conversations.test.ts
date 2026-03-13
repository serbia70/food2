import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConversationList } from './admin-chat-conversations.ts';

test('会话列表按未读优先、最近时间排序', () => {
	const result = buildConversationList([
		{ sender_phone: '999', created_at: '2026-03-10 10:00:00', message: '你好999' },
		{ sender_phone: '888', created_at: '2026-03-10 11:00:00', message: '你好888' },
	], { '999': 3, '888': 1 });

	assert.deepEqual(result.map((item) => item.phone), ['999', '888']);
});

test('同一手机号取最新一条作为预览', () => {
	const result = buildConversationList([
		{ sender_phone: '999', created_at: '2026-03-10 10:00:00', message: '旧消息' },
		{ sender_phone: '999', created_at: '2026-03-10 11:00:00', message: '新消息' },
	]);

	assert.equal(result[0]?.preview, '新消息');
});

test('会话项包含最近时间戳', () => {
	const result = buildConversationList([
		{ sender_phone: '999', created_at: '2026-03-10 11:00:00', message: '新消息' },
	]);

	assert.equal(typeof result[0]?.timestamp, 'number');
	assert.equal(result[0]?.timestamp > 0, true);
});
