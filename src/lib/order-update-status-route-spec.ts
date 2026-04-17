import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { buildDispatchMetaRemarks, readDispatchMetaFromRemarks } from './rider-dispatch.ts';
import { buildTelegramShortClaimCallback } from './telegram-dispatch.ts';
import { forwardOrderUpdateStatus } from '../pages/api/order/update_status.ts';

import { API_BASE_URL } from '../config.ts';

type FetchHandler = (request: Request) => Promise<Response>;

interface MockFetchCall {
  url: string;
  method: string;
  body: string;
  headers: Headers;
}

function useTestEnv(t: TestContext): void {
  const originalApiUrl = process.env.PUBLIC_API_URL;
  const originalCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'test-secret';

  t.after(() => {
    if (typeof originalApiUrl === 'string') {
      process.env.PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.PUBLIC_API_URL;
    }
    if (typeof originalCallbackSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalCallbackSecret;
      return;
    }
    delete process.env.TELEGRAM_CALLBACK_SECRET;
  });
}

function useMockFetch(t: TestContext, handler: FetchHandler): MockFetchCall[] {
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('forwardOrderUpdateStatus forwards cookie and authorization headers to upstream', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async () => jsonResponse({ success: true }));

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
      authorization: 'Bearer rider-token',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
    }),
  }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `${API_BASE_URL}/api/order/update_status/101`);
  assert.equal(calls[0]?.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(calls[0]?.headers.get('authorization'), 'Bearer rider-token');
});

test('forwardOrderUpdateStatus coerces numeric string id in body before forwarding', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async () => jsonResponse({ success: true }));

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
    }),
  }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const forwarded = JSON.parse(String(calls[0]?.body || '{}')) as { id?: unknown };
  assert.equal(forwarded.id, 101);
});

test('forwardOrderUpdateStatus edits telegram message after admin marks picked_up', async (t) => {
  useTestEnv(t);
  const remarksJson = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: { action: 'accepted', riderId: '202', riderName: '骑手888', riderPhone: '0613083888', at: '2026-04-17T10:03:00.000Z' },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-17T10:00:00.000Z',
    currentExpiresAt: '2026-04-17T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-17T10:03:00.000Z',
    pickedUpAt: '2026-04-17T10:20:00.000Z',
    completedAt: '',
    telegramMessageRef: { chatId: '123456789', messageId: 7788 },
  }));
  const completeCallback = buildTelegramShortClaimCallback({
    orderId: 101,
    riderId: 202,
    riderName: '骑手888',
    riderPhone: '0613083888',
    restaurantId: 'ruma1',
    telegramChatId: '123456789',
    action: 'complete',
  });
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/101') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 101,
          orderNo: 'A101',
          status: 'picked_up',
          remarksJson,
          courierPhone: '0613083888',
          courierName: '骑手888',
          shopName: '店铺A',
          tableInfo: 'hui, 0613083888, ruma1 [货到付款/Cash] (备注:)',
          userPhone: '0613083888',
          shopSlug: 'ruma1',
          itemsJson: JSON.stringify([{ name: 'Turbot na pari', subName: '清蒸多宝鱼', quantity: 1 }]),
        },
      ]);
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_token=abc123',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
      courierName: '骑手888',
      courierPhone: '0613083888',
      remarksJson,
    }),
  }));

  assert.equal(response.status, 200);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  assert.ok(telegramCall, 'telegram message should be edited');
  assert.match(telegramCall?.body || '', /"message_id":7788/);
  assert.match(telegramCall?.body || '', /状态：已取餐/);
  assert.match(telegramCall?.body || '', /"text":"送达"/);
  assert.match(telegramCall?.body || '', new RegExp(completeCallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('forwardOrderUpdateStatus reads latest remarksJson for real admin picked_up request', async (t) => {
  useTestEnv(t);
  const remarksJson = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: { action: 'accepted', riderId: '202', riderName: '骑手888', riderPhone: '0613083888', at: '2026-04-17T10:03:00.000Z' },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-17T10:00:00.000Z',
    currentExpiresAt: '2026-04-17T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-17T10:03:00.000Z',
    pickedUpAt: '2026-04-17T10:20:00.000Z',
    completedAt: '',
    telegramMessageRef: { chatId: '123456789', messageId: 7788 },
  }));
  const completeCallback = buildTelegramShortClaimCallback({
    orderId: 101,
    riderId: 202,
    riderName: '骑手888',
    riderPhone: '0613083888',
    restaurantId: 'ruma1',
    telegramChatId: '123456789',
    action: 'complete',
  });
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/101') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 101,
          orderNo: 'A101',
          status: 'picked_up',
          remarksJson,
          courierPhone: '0613083888',
          courierName: '骑手888',
          shopName: '店铺A',
          tableInfo: 'hui, 0613083888, ruma1 [货到付款/Cash] (备注:)',
          userPhone: '0613083888',
          restaurantId: 'ruma1',
          itemsJson: JSON.stringify([{ name: 'Turbot na pari', subName: '清蒸多宝鱼', quantity: 1 }]),
        },
      ]);
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_token=abc123',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
      courierName: '骑手888',
      courierPhone: '0613083888',
    }),
  }));

  assert.equal(response.status, 200);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  assert.ok(telegramCall, 'telegram message should be edited for real admin request body');
  assert.match(telegramCall?.body || '', /"shopSlug":"ruma1"/);
  assert.match(telegramCall?.body || '', /状态：已取餐/);
  assert.match(telegramCall?.body || '', new RegExp(completeCallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('forwardOrderUpdateStatus keeps complete button when order only exposes shop slug inside tableInfo', async (t) => {
  useTestEnv(t);
  const remarksJson = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: { action: 'accepted', riderId: '202', riderName: '骑手888', riderPhone: '0613083888', at: '2026-04-17T10:03:00.000Z' },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-17T10:00:00.000Z',
    currentExpiresAt: '2026-04-17T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-17T10:03:00.000Z',
    pickedUpAt: '2026-04-17T10:20:00.000Z',
    completedAt: '',
    telegramMessageRef: { chatId: '123456789', messageId: 7788 },
  }));
  const completeCallback = buildTelegramShortClaimCallback({
    orderId: 101,
    riderId: 202,
    riderName: '骑手888',
    riderPhone: '0613083888',
    restaurantId: 'ruma1',
    telegramChatId: '123456789',
    action: 'complete',
  });
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/101') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 101,
          orderNo: 'A101',
          status: 'picked_up',
          remarksJson,
          courierPhone: '0613083888',
          courierName: '骑手888',
          shopName: '店铺A',
          tableInfo: 'hui, 0613083888, ruma1 [货到付款/Cash] (备注:)',
          userPhone: '0613083888',
          itemsJson: JSON.stringify([{ name: 'Turbot na pari', subName: '清蒸多宝鱼', quantity: 1 }]),
        },
      ]);
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_token=abc123',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
      courierName: '骑手888',
      courierPhone: '0613083888',
    }),
  }));

  assert.equal(response.status, 200);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  assert.ok(telegramCall, 'telegram picked_up message should keep complete button');
  assert.match(telegramCall?.body || '', /"shopSlug":"ruma1"/);
  assert.match(telegramCall?.body || '', /"text":"送达"/);
  assert.match(telegramCall?.body || '', new RegExp(completeCallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('forwardOrderUpdateStatus edits telegram message after admin marks completed', async (t) => {
  useTestEnv(t);
  const remarksJson = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: { action: 'accepted', riderId: '202', riderName: '骑手888', riderPhone: '0613083888', at: '2026-04-17T10:03:00.000Z' },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-17T10:00:00.000Z',
    currentExpiresAt: '2026-04-17T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-17T10:03:00.000Z',
    pickedUpAt: '2026-04-17T10:20:00.000Z',
    completedAt: '2026-04-17T10:45:00.000Z',
    telegramMessageRef: { chatId: '123456789', messageId: 7788 },
  }));
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/101') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 101,
          orderNo: 'A101',
          status: 'completed',
          remarksJson,
          courierPhone: '0613083888',
          courierName: '骑手888',
          shopName: '店铺A',
          tableInfo: 'hui, 0613083888, ruma1 [货到付款/Cash] (备注:)',
          userPhone: '0613083888',
          restaurantId: 'ruma1',
          itemsJson: JSON.stringify([{ name: 'Turbot na pari', subName: '清蒸多宝鱼', quantity: 1 }]),
        },
      ]);
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_token=abc123',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'picked_up',
      status: 'completed',
      courierName: '骑手888',
      courierPhone: '0613083888',
    }),
  }));

  assert.equal(response.status, 200);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  assert.ok(telegramCall, 'telegram completed message should be edited');
  assert.match(telegramCall?.body || '', /"shopSlug":"ruma1"/);
  assert.match(telegramCall?.body || '', /状态：已送达/);
  assert.doesNotMatch(telegramCall?.body || '', /"callback_data":/);
});
