import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readAdminTelegramSendOutcome,
  readTelegramSendResult,
} from './rider-route-admin-telegram.ts';

test('readTelegramSendResult 读取 result.message_id 与顶层 message_id，并保留上游错误文本', () => {
  assert.deepEqual(
    readTelegramSendResult(
      new Response(JSON.stringify({ success: true, result: { message_id: 7788 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      JSON.stringify({ success: true, result: { message_id: 7788 } }),
    ),
    { ok: true, messageId: 7788 },
  );

  assert.deepEqual(
    readTelegramSendResult(
      new Response(JSON.stringify({ success: false, error: 'telegram_failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
      JSON.stringify({ success: false, error: 'telegram_failed' }),
    ),
    { ok: false, error: '{"success":false,"error":"telegram_failed"}' },
  );
});

test('readAdminTelegramSendOutcome 在成功时产出 messageRef，在失败时保留错误契约', () => {
  assert.deepEqual(
    readAdminTelegramSendOutcome({
      response: new Response(JSON.stringify({ success: true, result: { message_id: 7788 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      responseText: JSON.stringify({ success: true, result: { message_id: 7788 } }),
      chatId: 'chat-1',
    }),
    { success: true, messageRef: { chatId: 'chat-1', messageId: 7788 } },
  );
});
