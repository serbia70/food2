import { createHmac } from 'node:crypto';
import type { TestContext } from 'node:test';

type TelegramClaimAction = 'accept' | 'decline' | 'picked_up' | 'complete';
type FetchHandler = (request: Request) => Promise<Response>;

export const TEST_SECRET = 'telegram-dispatch-test-secret';
export const TEST_CHAT_ID = '123456789';

export interface MockFetchCall {
  url: string;
  method: string;
  body: string;
  headers: Headers;
}

export function useTelegramCallbackSecret(t: TestContext): void {
  const original = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = TEST_SECRET;
  t.after(() => {
    if (typeof original === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = original;
      return;
    }
    delete process.env.TELEGRAM_CALLBACK_SECRET;
  });
}

export function createSignedCallback(action: TelegramClaimAction, expiresAt: number): string {
  const payload = {
    orderId: 101,
    riderId: 202,
    riderName: 'Rider 1',
    restaurantId: 'shop-1',
    riderPhone: '381641234567',
    telegramChatId: TEST_CHAT_ID,
    expiresAt,
    action,
  };
  const sig = createHmac('sha256', TEST_SECRET)
    .update(JSON.stringify(payload))
    .digest('base64url');
  return Buffer.from(JSON.stringify({ ...payload, sig }), 'utf8').toString('base64url');
}

function toShortAction(action: TelegramClaimAction): 'a' | 'd' | 'p' | 'c' {
  if (action === 'decline') return 'd';
  if (action === 'picked_up') return 'p';
  if (action === 'complete') return 'c';
  return 'a';
}

function signShortCallbackParts(parts: string[]): string {
  return createHmac('sha256', TEST_SECRET)
    .update(['rc2', ...parts].join('.'))
    .digest('base64url')
    .slice(0, 8);
}

function hashChatId(chatId: string): string {
  return createHmac('sha256', TEST_SECRET)
    .update(`chat:${chatId}`)
    .digest('base64url')
    .slice(0, 6);
}

export function createShortCallback(action: TelegramClaimAction, expiresAt: number): string {
  const parts = [
    toShortAction(action),
    (101).toString(36),
    (202).toString(36),
    Math.floor(expiresAt / 1000).toString(36),
    hashChatId(TEST_CHAT_ID),
    '381641234567',
    'Rider_1',
  ];
  return `rc2.${parts.join('.')}.${signShortCallbackParts(parts)}`;
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

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

export function flattenInlineButtonTexts(inlineKeyboard: Array<Array<{ text?: string }>>): string[] {
  return inlineKeyboard.flat().map((button) => button.text ?? '');
}

export function findInlineButton(
  inlineKeyboard: Array<Array<{ text?: string; callback_data?: string; url?: string }>>,
  text: string,
): { text?: string; callback_data?: string; url?: string } | undefined {
  return inlineKeyboard.flat().find((button) => button.text === text);
}
