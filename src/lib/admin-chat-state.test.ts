import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecentChatPhones, chooseChatPhoneOnOpen } from './admin-chat-state.ts';

test('收到新消息时打开聊天优先进入最后一个未读客户', () => {
  assert.equal(chooseChatPhoneOnOpen(' 0600123456 '), '0600123456');
});

test('没有未读客户时打开聊天不应复用旧会话', () => {
  assert.equal(chooseChatPhoneOnOpen(''), '');
});

test('客户列表按最近聊天时间倒序排列', () => {
  const phones = buildRecentChatPhones([
    { sender_phone: '0601', created_at: '2026-03-09 10:00:00' },
    { sender_phone: '0602', created_at: '2026-03-09 12:00:00' },
    { sender_phone: '0601', created_at: '2026-03-09 13:00:00' },
  ]);

  assert.deepEqual(phones, ['0601', '0602']);
});

test('有未读时未读客户仍优先，其余再按最近时间排序', () => {
  const phones = buildRecentChatPhones(
    [
      { sender_phone: '0601', created_at: '2026-03-09 10:00:00' },
      { sender_phone: '0602', created_at: '2026-03-09 12:00:00' },
      { sender_phone: '0603', created_at: '2026-03-09 11:00:00' },
    ],
    { '0603': 1 },
  );

  assert.deepEqual(phones, ['0603', '0602', '0601']);
});
