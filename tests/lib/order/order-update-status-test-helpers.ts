import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';

type FetchHandler = (request: Request) => Promise<Response>;

export interface MockFetchCall {
  url: string;
  method: string;
  body: string;
  headers: Headers;
}

export interface TelegramSendPayloadButton {
  text?: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramSendPayload {
  chat_id?: string;
  chatId?: string;
  message_id?: number;
  text?: string;
  replyMarkup?: {
    inline_keyboard?: TelegramSendPayloadButton[][];
  };
  reply_markup?: {
    inline_keyboard?: TelegramSendPayloadButton[][];
  };
}

export function useTestEnv(t: TestContext): void {
  const originalApiUrl = process.env.PUBLIC_API_URL;
  const originalTelegramCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;

  process.env.TELEGRAM_CALLBACK_SECRET = 'order-update-status-test-secret';

  t.after(() => {
    if (typeof originalApiUrl === 'string') {
      process.env.PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.PUBLIC_API_URL;
    }

    if (typeof originalTelegramCallbackSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalTelegramCallbackSecret;
      return;
    }
    delete process.env.TELEGRAM_CALLBACK_SECRET;
  });
}

export function useMockFetch(t: TestContext, handler: FetchHandler): MockFetchCall[] {
  const calls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      body: await request.clone().text(),
      headers: request.headers,
    });
    return handler(request);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return calls;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function readTelegramSendPayload(call: MockFetchCall | undefined): TelegramSendPayload {
  assert.ok(call);
  return JSON.parse(call.body) as TelegramSendPayload;
}

export function findTelegramButton(payload: TelegramSendPayload, text: string): TelegramSendPayloadButton | undefined {
  return (payload.replyMarkup?.inline_keyboard || payload.reply_markup?.inline_keyboard || []).flat().find((button) => button.text === text);
}

