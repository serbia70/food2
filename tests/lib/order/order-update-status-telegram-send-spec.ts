import assert from 'node:assert/strict';
import test from 'node:test';

import { forwardOrderUpdateStatus } from '../../../src/pages/api/order/update_status.ts';
import { readDispatchMetaFromRemarks } from '../../../src/lib/rider-dispatch.ts';
import {
  findTelegramButton,
  jsonResponse,
  readTelegramSendPayload,
  useMockFetch,
  useTestEnv,
} from './order-update-status-test-helpers.ts';

test('forwardOrderUpdateStatus sends new telegram rider message and persists message ref when order lacks telegramMessageRef', async (t) => {
  useTestEnv(t);
  const remarksWrites: Array<{ orderId?: string; remarks?: string[] }> = [];
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/order/update_status/101') return jsonResponse({ success: true });
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

    if (url.pathname === '/api/order/update_status/102') return jsonResponse({ success: true });
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
  assert.equal(remarksWrites.length, 1);
  assert.deepEqual(readDispatchMetaFromRemarks(JSON.stringify(remarksWrites[0].remarks || [])).telegramMessageRef, {
    chatId: '1033472638',
    messageId: 9901,
  });
});

