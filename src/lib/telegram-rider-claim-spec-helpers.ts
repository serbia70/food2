import { createHmac } from 'node:crypto';
import type { TestContext } from 'node:test';

import { buildDispatchMetaRemarks } from './rider-dispatch.ts';
import { buildTelegramShortClaimCallback } from './telegram-dispatch.ts';

export const TEST_SECRET = 'telegram-rider-claim-test-secret';
export const TEST_API_BASE = 'https://api.example.com';
export const TEST_CHAT_ID = '123456789';
export const TEST_ORDER_ID = 101;
export const TEST_RIDER_ID = 202;
export const TEST_RIDER_NAME = 'Rider 1';
export const TEST_RIDER_PHONE = '381641234567';

export type FetchHandler = (request: Request) => Promise<Response>;

export interface MockFetchCall {
  url: string;
  method: string;
  body: string;
  headers: Headers;
}

export interface OrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone?: string;
  shopSlug?: string;
  itemsJson?: string;
}

export function useTestEnv(t: TestContext): void {
  const originalCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const originalApiUrl = process.env.PUBLIC_API_URL;

  process.env.TELEGRAM_CALLBACK_SECRET = TEST_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = TEST_SECRET;
  process.env.PUBLIC_API_URL = TEST_API_BASE;

  t.after(() => {
    if (typeof originalCallbackSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalCallbackSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }

    if (typeof originalWebhookSecret === 'string') {
      process.env.TELEGRAM_WEBHOOK_SECRET = originalWebhookSecret;
    } else {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    }

    if (typeof originalApiUrl === 'string') {
      process.env.PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.PUBLIC_API_URL;
    }
  });
}

export function useMockFetch(t: TestContext, handler: FetchHandler): MockFetchCall[] {
  const calls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const cloned = request.clone();
    calls.push({
      url: request.url,
      method: request.method,
      body: await cloned.text(),
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

export function createRemarksJson(overrides: Partial<{
  currentRiderId: string;
  currentAssignedAt: string;
  currentExpiresAt: string;
  invalidatedRiderIds: string[];
  declinedRiderIds: string[];
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
  telegramMessageRef: { chatId: string; messageId: number } | null;
}> = {}): string {
  return JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: null,
    declinedRiderIds: overrides.declinedRiderIds || [],
    currentRiderId: overrides.currentRiderId || String(TEST_RIDER_ID),
    currentAssignedAt: overrides.currentAssignedAt || '2026-04-10T10:00:00.000Z',
    currentExpiresAt: overrides.currentExpiresAt || new Date(Date.now() + 5 * 60_000).toISOString(),
    invalidatedRiderIds: overrides.invalidatedRiderIds || [],
    lastInvalidationReason: null,
    acceptedAt: overrides.acceptedAt || '',
    pickedUpAt: overrides.pickedUpAt || '',
    completedAt: overrides.completedAt || '',
    telegramMessageRef: overrides.telegramMessageRef === undefined ? null : overrides.telegramMessageRef,
  }));
}

export function createOrderRow(snapshot: OrderSnapshot): Record<string, unknown> {
  return {
    id: String(TEST_ORDER_ID),
    orderNo: 'A101',
    status: snapshot.status,
    remarksJson: snapshot.remarksJson,
    courierPhone: snapshot.courierPhone ?? TEST_RIDER_PHONE,
    shopSlug: snapshot.shopSlug ?? 'shop-1',
    shopName: 'Pizza One',
    shopAddress: 'Shop Street 1',
    shopMapUrl: 'https://maps.example.com/shop',
    tableInfo: 'Test Address',
    userPhone: '381600000000',
    totalAmount: 1500,
    pickupEtaMinutes: 20,
    itemsJson: snapshot.itemsJson ?? JSON.stringify([
      { name: '土豆牛肉饼', subName: 'Pljeskavica', quantity: 2, price: 600 },
      { name: '可乐', subName: 'Coca-Cola', quantity: 1, price: 200 },
    ]),
  };
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

export function createCallback(action: 'accept' | 'decline' | 'picked_up' | 'complete', expiresAt: number): string {
  if (action === 'accept') {
    const parts = [
      'a',
      TEST_ORDER_ID.toString(36),
      TEST_RIDER_ID.toString(36),
      Math.floor(expiresAt / 1000).toString(36),
      hashChatId(TEST_CHAT_ID),
      TEST_RIDER_PHONE,
      'Rider_1',
    ];
    return `rc2.${parts.join('.')}.${signShortCallbackParts(parts)}`;
  }

  return buildTelegramShortClaimCallback({
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    restaurantId: 'shop-1',
    telegramChatId: TEST_CHAT_ID,
    action,
    expiresAt,
  });
}

export function createRequest(callbackData: string): Request {
  return new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callbackData, chatId: TEST_CHAT_ID }),
  });
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

export function createFetchHandler(
  snapshot: OrderSnapshot,
  options?: {
    updateStatusOk?: boolean;
    updateStatusBody?: unknown;
    updateStatusStatus?: number;
  },
): FetchHandler {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegramChatId: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([createOrderRow(snapshot)]);
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === `/api/order/update_status/${TEST_ORDER_ID}`) {
      return jsonResponse(
        options?.updateStatusBody ?? { success: options?.updateStatusOk !== false },
        options?.updateStatusStatus ?? (options?.updateStatusOk === false ? 409 : 200),
      );
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  };
}
