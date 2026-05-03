import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as sendTelegramRoute } from '../../../src/pages/api/telegram/send.ts';
import {
  jsonResponse,
  readJson,
  TEST_CHAT_ID,
  useMockFetch,
} from './telegram-dispatch-test-helpers.ts';

test('telegram send route 在带 message_id 时调用 editMessageText 并透传 upstream message_id', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'api.telegram.org') {
      return jsonResponse({
        ok: true,
        result: {
          message_id: 7788,
          chat: { id: TEST_CHAT_ID },
          text: 'edited text',
        },
      });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        replyMarkup: { inline_keyboard: [] },
        parseMode: 'HTML',
        disableWebPagePreview: true,
        telegram_bot_token: 'bot-token-1',
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  const telegramCall = calls.find((call) => call.url.includes('/editMessageText'));
  assert.equal(response.status, 200);
  assert.ok(telegramCall);
  assert.equal(((await readJson(response)).result as { message_id?: unknown })?.message_id, 7788);
});

test('telegram send route 忽略数组 replyMarkup 与空 parseMode', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'api.telegram.org') {
      return jsonResponse({ ok: true, result: { message_id: 9901 } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TEST_CHAT_ID,
        message_id: 9901,
        text: 'edited text',
        replyMarkup: [],
        parseMode: '   ',
        telegram_bot_token: 'bot-token-1',
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  assert.equal(response.status, 200);
  assert.ok(calls.find((call) => call.url.includes('/editMessageText')));
});

test('telegram send route 在前端取不到 token 时回退后端 telegram/send 并保留 message_id', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/shop-1/info') return jsonResponse({ success: true, settings: {} });
    if (url.pathname === '/api/master/init') return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    if (url.pathname === '/api/home') return jsonResponse({ success: true, settings: {} });
    if (url.pathname === '/api/telegram/send' && url.hostname === 'food2api.serbia70.com') {
      return jsonResponse({ success: true, ok: true, result: { message_id: 7788 } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_session=abc123; admin_token=cookie-token',
        authorization: 'Bearer route-token',
      },
      body: JSON.stringify({
        shopSlug: 'shop-1',
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        reply_markup: { inline_keyboard: [] },
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  assert.equal(response.status, 200);
  assert.ok(calls.find((call) => call.url === 'https://food2api.serbia70.com/api/telegram/send'));
});

test('telegram send route 在数字 shopSlug 场景跳过 /info 并继续走全局 token 解析', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/master/init') return jsonResponse({ telegram_bot_token: 'bot-token-1' });
    if (url.hostname === 'api.telegram.org') return jsonResponse({ ok: true, result: { message_id: 9902 } });
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: '103',
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        reply_markup: { inline_keyboard: [[{ text: '送达', callback_data: 'cb-complete' }]] },
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  assert.equal(response.status, 200);
  assert.ok(calls.find((call) => call.url.includes('/editMessageText')));
});

test('telegram send route 在数字 shopSlug 且前端取不到 token 时回退后端但不透传数字 shopSlug', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/master/init') return jsonResponse({ success: false, error: 'unauthorized' }, 401);
    if (url.pathname === '/api/home') return jsonResponse({ success: true, settings: {} });
    if (url.pathname === '/api/telegram/send' && url.hostname === 'food2api.serbia70.com') {
      return jsonResponse({ success: true, ok: true, result: { message_id: 7788 } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: '103',
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        reply_markup: { inline_keyboard: [[{ text: '送达', callback_data: 'cb-complete' }]] },
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  assert.equal(response.status, 200);
  assert.ok(calls.find((call) => call.url === 'https://food2api.serbia70.com/api/telegram/send'));
});

test('telegram send route 在已解析 token 且直连 Telegram 超时后回退后端并保留鉴权与 payload 语义', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'api.telegram.org') throw new DOMException('This operation was aborted', 'AbortError');
    if (url.pathname === '/api/telegram/send' && url.hostname === 'food2api.serbia70.com') {
      return jsonResponse({ success: true, ok: true, result: { message_id: 7788 } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await sendTelegramRoute({
    request: new Request('https://example.com/api/telegram/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_session=abc123; admin_token=cookie-token',
        authorization: 'Bearer route-token',
      },
      body: JSON.stringify({
        shopSlug: '103',
        chat_id: TEST_CHAT_ID,
        message_id: 7788,
        text: 'edited text',
        reply_markup: { inline_keyboard: [[{ text: '送达', callback_data: 'cb-complete' }]] },
        telegram_bot_token: 'bot-token-1',
      }),
    }),
  } as Parameters<typeof sendTelegramRoute>[0]);

  assert.equal(response.status, 200);
  assert.ok(calls.find((call) => call.url === 'https://food2api.serbia70.com/api/telegram/send'));
});

