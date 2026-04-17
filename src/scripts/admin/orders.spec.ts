import assert from 'node:assert/strict';
import test from 'node:test';

import { assignRider } from './orders.ts';

test('assignRider sends orderSummary from hidden order data', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const hidden = {
    dataset: {
      orderId: '901',
      oid: '901',
      orderNo: '260415001',
      shopName: 'Shop A',
      table: 'Body Address',
      userPhone: '381600000000',
      total: '100',
      items: JSON.stringify([{ name: 'Burger', quantity: 2 }]),
      scheduledFor: '2026-04-17 18:00:00',
    },
  };

  (globalThis as typeof globalThis & { window?: unknown }).window = {
    __adminRuntime: {
      shopSlug: 'shop-a',
      currentSettings: {},
    },
    __adminHandlers: {},
    __adminAssignInFlight: false,
    __adminPendingOrderRefresh: false,
    refreshOrderList: () => undefined,
    showToast: () => undefined,
  } as never;

  (globalThis as typeof globalThis & { document?: unknown }).document = {
    querySelector: (selector: string) => (
      selector === '.hidden-data[data-order-id="901"]' || selector === '.hidden-data[data-oid="901"]'
        ? hidden
        : null
    ),
  } as never;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request
      ? input
      : new Request(typeof input === 'string' ? new URL(input, 'https://example.com') : input, init);
    fetchCalls.push({
      url: request.url,
      body: JSON.parse(await request.text()) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  globalThis.setTimeout = ((handler: TimerHandler) => {
    if (typeof handler === 'function') handler();
    return 1 as never;
  }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof globalThis.clearTimeout;

  try {
    await assignRider('901', '202', {
      shopSlug: 'shop-a',
      pickupEtaMinutes: 12,
      riderTelegramChatId: 'chat-1',
      telegramBotToken: 'token-1',
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
    (globalThis as typeof globalThis & { document?: unknown }).document = originalDocument;
  }

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, 'https://example.com/api/admin/rider-assign');
  assert.deepEqual(fetchCalls[0]?.body.orderSummary, {
    orderNo: '260415001',
    shopName: 'Shop A',
    deliveryAddress: 'Body Address',
    userPhone: '381600000000',
    totalAmount: 100,
    scheduledFor: '2026-04-17 18:00:00',
    items: [{ name: 'Burger', quantity: 2 }],
  });
});
