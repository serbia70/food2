import assert from 'node:assert/strict';
import test from 'node:test';

import { forwardOrderUpdateStatus } from '../pages/api/order/update_status.ts';
import { parseTelegramClaimCallback } from './telegram-dispatch.ts';
import {
  findTelegramButton,
  jsonResponse,
  readTelegramSendPayload,
  useMockFetch,
  useTestEnv,
} from './order-update-status-test-helpers.ts';

test('forwardOrderUpdateStatus updates telegram rider message to delivered action after admin marks picked_up', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/order/update_status/101') return jsonResponse({ success: true });
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
    if (pathname === '/api/telegram/send') return jsonResponse({ success: true });
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
  const masterSettingsCall = calls.find((call) => call.url.endsWith('/api/admin/settings/master'));
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

test('forwardOrderUpdateStatus keeps delivered action button when order lacks riderId but available rider matches by phone', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/103') return jsonResponse({ success: true });
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
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true });
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
});

test('forwardOrderUpdateStatus keeps delivered action button when rider is no longer available but rider status lookup matches by phone', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/104') return jsonResponse({ success: true });
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
    if (url.pathname === '/api/telegram/send') return jsonResponse({ success: true });
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
});
