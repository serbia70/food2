import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldPlayAdminChatNotify } from './admin-chat-notify.ts';

test('当前会话来消息时，无论聊天窗口是否打开，都应播报', () => {
	assert.equal(shouldPlayAdminChatNotify({ adminChatOpen: true, currentChatUserPhone: '0613', incomingPhone: '0613' }), true);
	assert.equal(shouldPlayAdminChatNotify({ adminChatOpen: false, currentChatUserPhone: '0613', incomingPhone: '0613' }), true);
});

test('无当前会话时，有新消息也应播报', () => {
	assert.equal(shouldPlayAdminChatNotify({ adminChatOpen: false, currentChatUserPhone: '', incomingPhone: '0613' }), true);
});
