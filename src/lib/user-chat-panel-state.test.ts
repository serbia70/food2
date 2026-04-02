import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeUserChatMessages } from './user-chat-panel-state.ts';

test('聊天消息按店铺过滤并按时间升序排列', () => {
	const result = normalizeUserChatMessages([
		{ shopId: 2, createdAt: '2026-03-09 21:00:00', message: 'b' },
		{ shopId: 1, createdAt: '2026-03-09 20:00:00', message: 'x' },
		{ shopId: 2, createdAt: '2026-03-09 19:00:00', message: 'a' },
	], 2);

	assert.deepEqual(result.map((item) => item.message), ['a', 'b']);
});

test('user chat panel state source uses canonical chat fields', async () => {
	const { readFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const source = await readFile(resolve(process.cwd(), 'src/lib/user-chat-panel-state.ts'), 'utf8');

	assert.match(source, /Number\(msg\.shopId \|\| 0\)/);
	assert.match(source, /String\(a\.createdAt \|\| ''\)\.localeCompare\(String\(b\.createdAt \|\| ''\)\)/);
	assert.doesNotMatch(source, /shop_id/);
	assert.doesNotMatch(source, /created_at/);
});
