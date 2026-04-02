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
    { senderPhone: '0601', createdAt: '2026-03-09 10:00:00' },
    { senderPhone: '0602', createdAt: '2026-03-09 12:00:00' },
    { senderPhone: '0601', createdAt: '2026-03-09 13:00:00' },
  ]);

  assert.deepEqual(phones, ['0601', '0602']);
});

test('有未读时未读客户仍优先，其余再按最近时间排序', () => {
  const phones = buildRecentChatPhones(
    [
      { senderPhone: '0601', createdAt: '2026-03-09 10:00:00' },
      { senderPhone: '0602', createdAt: '2026-03-09 12:00:00' },
      { senderPhone: '0603', createdAt: '2026-03-09 11:00:00' },
    ],
    { '0603': 1 },
  );

  assert.deepEqual(phones, ['0603', '0602', '0601']);
});

test('admin chat state source uses canonical chat fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/lib/admin-chat-state.ts'), 'utf8');

  assert.match(source, /senderPhone\?: unknown;/);
  assert.match(source, /createdAt\?: unknown;/);
  assert.match(source, /message\?\.senderPhone/);
  assert.match(source, /message\?\.createdAt/);
  assert.doesNotMatch(source, /sender_phone/);
  assert.doesNotMatch(source, /created_at/);
});
