import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { forwardOrderUpdateStatus } from '../pages/api/order/update_status.ts';

import { API_BASE_URL } from '../config.ts';
import { parseTelegramClaimCallback } from './telegram-dispatch.ts';
import { readDispatchMetaFromRemarks } from './rider-dispatch.ts';

type FetchHandler = (request: Request) => Promise<Response>;

interface MockFetchCall {
  url: string;
  method: string;
  body: string;
  headers: Headers;
}

interface TelegramSendPayloadButton {
  text?: string;
  url?: string;
  callback_data?: string;
}

interface TelegramSendPayload {
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

function useTestEnv(t: TestContext): void {
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

function useMockFetch(t: TestContext, handler: FetchHandler): MockFetchCall[] {
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readTelegramSendPayload(call: MockFetchCall | undefined): TelegramSendPayload {
  assert.ok(call);
  return JSON.parse(call.body) as TelegramSendPayload;
}

function findTelegramButton(payload: TelegramSendPayload, text: string): TelegramSendPayloadButton | undefined {
  return (payload.replyMarkup?.inline_keyboard || payload.reply_markup?.inline_keyboard || []).flat().find((button) => button.text === text);
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
      courierPhone: '',
      courierName: '',
    }),
  }));

  assert.equal(response.status, 200);
  const forwardCall = calls.find((call) => call.url === `${API_BASE_URL}/api/order/update_status/101`);
  assert.ok(forwardCall);
  assert.equal(forwardCall.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(forwardCall.headers.get('authorization'), 'Bearer rider-token');
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
      courierPhone: '',
      courierName: '',
    }),
  }));

  assert.equal(response.status, 200);
  const forwardCall = calls.find((call) => call.url === `${API_BASE_URL}/api/order/update_status/101`);
  assert.ok(forwardCall);
  assert.equal((JSON.parse(forwardCall.body) as { id?: unknown }).id, 101);
});

test('forwardOrderUpdateStatus updates telegram rider message to delivered action after admin marks picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/order/update_status/101') {
      return jsonResponse({ success: true });
    }

    if (pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 101,
          orderNo: '101',
          status: 'picked_up',
          shopSlug: 'real-shop',
          courierPhone: '381641234567',
          userPhone: '381600000000',
          shopName: '店铺A',
          tableInfo: 'Kralja Petra 10',
          deliveryAddress: 'Kralja Petra 10',
          deliveryMapUrl: 'https://maps.example.com/customer',
          shopMapUrl: 'https://maps.example.com/shop',
          remarksJson: JSON.stringify([
            'dispatch_meta:{"currentRiderId":"202","acceptedAt":"2026-04-14T10:03:00.000Z","pickedUpAt":"2026-04-14T10:19:00.000Z","completedAt":"","telegramMessageRef":{"chatId":"123456789","messageId":7788}}',
          ]),
          itemsJson: JSON.stringify([{ name: '汉堡', quantity: 1 }]),
        },
      ]);
    }

    if (pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        success: true,
        riders: [
          {
            id: 202,
            name: 'Rider 1',
            phone: '381641234567',
            status: 'available',
            telegramChatId: '123456789',
            telegram_chat_id: '123456789',
          },
        ],
      });
    }

    if (pathname === '/api/admin/settings/master') {
      return jsonResponse({ success: true, settings: { server: { telegramWebhookSecret: 'remote-secret' } } });
    }

    if (pathname === '/api/telegram/send') {
      return jsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
      authorization: 'Bearer admin-token',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
      courierPhone: '381641234567',
      courierName: 'Rider 1',
    }),
  }));

  assert.equal(response.status, 200);
  assert.ok(calls.some((call) => call.url === `${API_BASE_URL}/api/order/update_status/101`));
  const masterSettingsCall = calls.find((call) => call.url === `${API_BASE_URL}/api/admin/settings/master`);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  const telegramPayload = readTelegramSendPayload(telegramCall);
  const completeButton = findTelegramButton(telegramPayload, '送达');
  assert.ok(masterSettingsCall);
  assert.equal(masterSettingsCall.headers.get('authorization'), 'Bearer admin-token');
  assert.equal(masterSettingsCall.headers.get('cookie'), 'admin_session=abc123');
  assert.ok(telegramCall);
  assert.match(telegramCall.body, /"message_id":7788/);
  assert.match(telegramCall.body, /"chat_id":"123456789"/);
  assert.match(telegramCall.body, /状态：配送中/);
  assert.ok(completeButton);
  assert.equal(typeof completeButton.callback_data, 'string');
  assert.ok(completeButton.callback_data.trim().length > 0);
  assert.ok(!findTelegramButton(telegramPayload, '取餐'));
  assert.throws(
    () => parseTelegramClaimCallback(completeButton.callback_data, {
      chatId: '123456789',
      riderPhone: '381641234567',
      restaurantId: 'real-shop',
    }),
    /invalid_signature/,
  );

  const originalSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'remote-secret';
  try {
    const parsed = parseTelegramClaimCallback(completeButton.callback_data, {
      chatId: '123456789',
      riderPhone: '381641234567',
      restaurantId: 'real-shop',
    });
    assert.equal(parsed.orderId, 101);
    assert.equal(parsed.action, 'complete');
  } finally {
    if (typeof originalSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  }
});

test('forwardOrderUpdateStatus sends new telegram rider message and persists message ref when order lacks telegramMessageRef', async (t) => {
  useTestEnv(t);
  const remarksWrites: Array<{ orderId?: string; remarks?: string[] }> = [];
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/101') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 101,
          orderNo: '101',
          status: 'picked_up',
          shopSlug: 'real-shop',
          courierId: 202,
          courierPhone: '381641234567',
          userPhone: '381600000000',
          shopName: '店铺A',
          tableInfo: 'Kralja Petra 10',
          deliveryAddress: 'Kralja Petra 10',
          deliveryMapUrl: 'https://maps.example.com/customer',
          shopMapUrl: 'https://maps.example.com/shop',
          remarksJson: JSON.stringify([
            'dispatch_meta:{"currentRiderId":"202","acceptedAt":"2026-04-14T10:03:00.000Z","pickedUpAt":"2026-04-14T10:19:00.000Z","completedAt":"","telegramMessageRef":null}',
          ]),
          itemsJson: JSON.stringify([{ name: '汉堡', quantity: 1 }]),
        },
      ]);
    }

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        success: true,
        riders: [
          {
            id: 202,
            name: 'Rider 1',
            phone: '381641234567',
            status: 'available',
            telegramChatId: '123456789',
            telegram_chat_id: '123456789',
          },
        ],
      });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 8899 } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      const payload = JSON.parse(await request.text()) as { orderId?: string; remarks?: string[] };
      remarksWrites.push(payload);
      return jsonResponse({ success: true, remarks: payload.remarks || [] });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
      courierPhone: '381641234567',
      courierName: 'Rider 1',
    }),
  }));

  assert.equal(response.status, 200);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  const completeButton = findTelegramButton(readTelegramSendPayload(telegramCall), '送达');
  assert.ok(telegramCall);
  assert.doesNotMatch(telegramCall.body, /"message_id":/);
  assert.match(telegramCall.body, /"chatId":"123456789"/);
  assert.match(telegramCall.body, /状态：配送中/);
  assert.ok(completeButton);
  assert.equal(typeof completeButton.callback_data, 'string');
  assert.ok(completeButton.callback_data.trim().length > 0);
  assert.equal(remarksWrites.length, 1);
  assert.deepEqual(readDispatchMetaFromRemarks(JSON.stringify(remarksWrites[0].remarks || [])).telegramMessageRef, {
    chatId: '123456789',
    messageId: 8899,
  });
});

test('forwardOrderUpdateStatus falls back to order courier fields when payload omits courier info', async (t) => {
  useTestEnv(t);
  const remarksWrites: Array<{ orderId?: string; remarks?: string[] }> = [];
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/102') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 102,
          orderNo: '102',
          status: 'picked_up',
          shopSlug: 'real-shop',
          courierId: 3,
          courierPhone: '0613083888',
          courierName: '骑手888',
          userPhone: '0613000000',
          shopName: '103',
          tableInfo: 'ruma1',
          deliveryAddress: 'ruma1',
          deliveryMapUrl: 'https://maps.example.com/customer',
          shopMapUrl: 'https://maps.example.com/shop',
          remarksJson: null,
          itemsJson: JSON.stringify([{ name: '香辣蟹', quantity: 1 }]),
        },
      ]);
    }

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        success: true,
        riders: [
          {
            id: 3,
            name: '骑手888',
            phone: '0613083888',
            status: 'available',
            telegramChatId: '1033472638',
            telegram_chat_id: '1033472638',
          },
        ],
      });
    }

    if (url.pathname === '/api/telegram/send') {
      return jsonResponse({ success: true, result: { message_id: 9901 } });
    }

    if (url.pathname === '/api/admin/orders/remarks') {
      const payload = JSON.parse(await request.text()) as { orderId?: string; remarks?: string[] };
      remarksWrites.push(payload);
      return jsonResponse({ success: true, remarks: payload.remarks || [] });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
    },
    body: JSON.stringify({
      id: '102',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
    }),
  }));

  assert.equal(response.status, 200);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  const completeButton = findTelegramButton(readTelegramSendPayload(telegramCall), '送达');
  assert.ok(telegramCall);
  assert.match(telegramCall.body, /"chatId":"1033472638"/);
  assert.match(telegramCall.body, /状态：配送中/);
  assert.ok(completeButton);
  assert.equal(typeof completeButton.callback_data, 'string');
  assert.ok(completeButton.callback_data.trim().length > 0);
  assert.equal(remarksWrites.length, 1);
  assert.deepEqual(readDispatchMetaFromRemarks(JSON.stringify(remarksWrites[0].remarks || [])).telegramMessageRef, {
    chatId: '1033472638',
    messageId: 9901,
  });
});

test('forwardOrderUpdateStatus keeps delivered action button when order lacks riderId but available rider matches by phone', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/103') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 103,
          orderNo: '103',
          status: 'picked_up',
          shopSlug: 'real-shop',
          courierId: null,
          courierPhone: '0613083888',
          courierName: '骑手888',
          userPhone: '0613000001',
          shopName: '103',
          tableInfo: 'ruma1',
          deliveryAddress: 'ruma1',
          deliveryMapUrl: 'https://maps.example.com/customer',
          shopMapUrl: 'https://maps.example.com/shop',
          remarksJson: JSON.stringify([
            'dispatch_meta:{"currentRiderId":"","acceptedAt":"","pickedUpAt":"","completedAt":"","telegramMessageRef":{"chatId":"1033472638","messageId":306}}',
          ]),
          itemsJson: JSON.stringify([{ name: '香辣蟹', quantity: 1 }]),
        },
      ]);
    }

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        success: true,
        riders: [
          {
            id: 3,
            name: '骑手888',
            phone: '0613083888',
            status: 'available',
            telegramChatId: '1033472638',
            telegram_chat_id: '1033472638',
          },
        ],
      });
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
      cookie: 'admin_session=abc123',
    },
    body: JSON.stringify({
      id: '103',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
    }),
  }));

  assert.equal(response.status, 200);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  const telegramPayload = readTelegramSendPayload(telegramCall);
  const completeButton = findTelegramButton(telegramPayload, '送达');
  assert.equal(telegramPayload.message_id, 306);
  assert.match(telegramPayload.text || '', /状态：配送中/);
  assert.ok(completeButton);
  assert.equal(typeof completeButton.callback_data, 'string');
  assert.ok(completeButton.callback_data.trim().length > 0);
});

test('forwardOrderUpdateStatus keeps delivered action button when rider is no longer available but rider status lookup matches by phone', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/104') {
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/orders') {
      return jsonResponse([
        {
          id: 104,
          orderNo: '104',
          status: 'picked_up',
          shopSlug: 'real-shop',
          courierId: null,
          courierPhone: '0613083999',
          courierName: '骑手999',
          userPhone: '0613000002',
          shopName: '104',
          tableInfo: 'ruma2',
          deliveryAddress: 'ruma2',
          deliveryMapUrl: 'https://maps.example.com/customer-2',
          shopMapUrl: 'https://maps.example.com/shop-2',
          remarksJson: JSON.stringify([
            'dispatch_meta:{"currentRiderId":"","acceptedAt":"","pickedUpAt":"","completedAt":"","telegramMessageRef":{"chatId":"1033472999","messageId":406}}',
          ]),
          itemsJson: JSON.stringify([{ name: '鱼香肉丝', quantity: 1 }]),
        },
      ]);
    }

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({ success: true, riders: [] });
    }

    if (url.pathname === '/api/rider/status' && url.searchParams.get('phone') === '0613083999') {
      return jsonResponse({
        success: true,
        rider: {
          id: 9,
          name: '骑手999',
          phone: '0613083999',
          status: 'busy',
          telegramChatId: '1033472999',
          telegram_chat_id: '1033472999',
        },
      });
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
      cookie: 'admin_session=abc123',
    },
    body: JSON.stringify({
      id: '104',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
    }),
  }));

  assert.equal(response.status, 200);
  const telegramCall = calls.find((call) => call.url === 'https://example.com/api/telegram/send');
  const telegramPayload = readTelegramSendPayload(telegramCall);
  const completeButton = findTelegramButton(telegramPayload, '送达');
  assert.equal(telegramPayload.message_id, 406);
  assert.match(telegramPayload.text || '', /状态：配送中/);
  assert.ok(completeButton);
  assert.equal(typeof completeButton.callback_data, 'string');
  assert.ok(completeButton.callback_data.trim().length > 0);
});
