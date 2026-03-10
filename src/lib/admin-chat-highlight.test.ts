import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConversationItemTone } from './admin-chat-highlight.ts';

test('当前选中项高亮为蓝色', () => {
	const tone = buildConversationItemTone({ unread: 0, active: true });
	assert.equal(tone.background, '#eff6ff');
});

test('未读项高亮为橙色', () => {
	const tone = buildConversationItemTone({ unread: 2, active: false });
	assert.equal(tone.background, '#fff7ed');
});
