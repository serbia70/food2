import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { readDispatchMetaFromRemarks, buildDispatchMetaRemarks } from './rider-dispatch.ts';
import { POST as riderActionPost } from '../pages/api/rider/action.ts';

const TEST_API_BASE = 'https://api.example.com';
const TEST_SECRET = 'test-secret';
const TEST_ORDER_ID = 101;
const TEST_RIDER_ID = 202;
const TEST_RIDER_NAME = 'Rider 1';
const TEST_RIDER_PHONE = '381641234567';

type FetchHandler = (request: Request) => Promise<Response>;

interface MockFetchCall {
  url: string;
  method: string;
  body: string;
}

interface OrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone?: string;
  shopSlug?: string;
}

interface MockDateConstructor extends DateConstructor {
  new (): Date;
  now(): number;
}

function useTestEnv(t: TestContext): void {
  const originalApiUrl = process.env.PUBLIC_API_URL;
  const originalCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.PUBLIC_API_URL = TEST_API_BASE;
  process.env.TELEGRAM_CALLBACK_SECRET = TEST_SECRET;

  t.after(() => {
    if (typeof originalApiUrl === 'string') {
      process.env.PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.PUBLIC_API_URL;
    }
    if (typeof originalCallbackSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalCallbackSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
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

function createRemarksJson(overrides: Partial<{
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

function createOrderRow(snapshot: OrderSnapshot): Record<string, unknown> {
  return {
    id: String(TEST_ORDER_ID),
    orderNo: 'A101',
    status: snapshot.status,
    remarksJson: snapshot.remarksJson,
    courierPhone: snapshot.courierPhone ?? TEST_RIDER_PHONE,
    shopName: 'Pizza One',
    deliveryAddress: 'Test Address 1',
    userPhone: '38160111222',
    shopSlug: snapshot.shopSlug ?? 'real-shop',
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function createActionRequest(body: Record<string, unknown>): Request {
  return new Request('https://example.com/api/rider/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function useMockNowIso(t: TestContext, iso: string): void {
  const fixedTime = new Date(iso).getTime();
  const OriginalDate = Date;
  const MockDate = class extends OriginalDate {
    constructor(value?: string | number | Date) {
      super(value ?? fixedTime);
    }

    static now(): number {
      return fixedTime;
    }
  } as MockDateConstructor;

  MockDate.parse = OriginalDate.parse;
  MockDate.UTC = OriginalDate.UTC;
  globalThis.Date = MockDate;

  t.after(() => {
    globalThis.Date = OriginalDate;
  });
}

function createFetchHandler(
  snapshot: OrderSnapshot,
  options?: {
    updateStatusOk?: boolean;
    updateStatusBody?: unknown;
    updateStatusStatus?: number;
  },
): FetchHandler {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

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

test('accept 主链路先写 admin remarks 再 update_status，并把 Telegram 原消息切到待取餐', async (t) => {
  useTestEnv(t);
  const currentAssignedAt = new Date(Date.now() - 60_000).toISOString();
  const currentExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const existingRemarksJson = createRemarksJson({
    currentAssignedAt,
    currentExpiresAt,
    invalidatedRiderIds: ['303'],
    declinedRiderIds: ['404'],
    telegramMessageRef: { chatId: '123456789', messageId: 7788 },
  });
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: existingRemarksJson,
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'accept',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
      shopSlug: 'real-shop',
    }),
  } as never);
  const body = await readJson(response);
  const remarksIndex = calls.findIndex((call) => call.url.endsWith('/api/admin/orders/remarks'));
  const updateIndex = calls.findIndex((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'accept');
  assert.ok(remarksIndex >= 0);
  assert.ok(updateIndex >= 0);
  assert.ok(remarksIndex < updateIndex);

  const remarksPayload = JSON.parse(calls[remarksIndex].body) as { remarks?: string[] };
  assert.ok(Array.isArray(remarksPayload.remarks), 'remarks must be a string array');
  const nextMeta = readDispatchMetaFromRemarks(JSON.stringify(remarksPayload.remarks));

  assert.equal(nextMeta.lastRiderDecision?.action, 'accepted');
  assert.equal(nextMeta.lastRiderDecision?.riderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.currentRiderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.currentAssignedAt, currentAssignedAt);
  assert.equal(nextMeta.currentExpiresAt, currentExpiresAt);
  assert.deepEqual(nextMeta.invalidatedRiderIds, ['303']);
  assert.equal(nextMeta.lastInvalidationReason, null);
  assert.deepEqual(nextMeta.declinedRiderIds, []);

  const updatePayload = JSON.parse(calls[updateIndex].body) as {
    expectedCurrentStatus?: string;
    status?: string;
  };
  assert.equal(updatePayload.expectedCurrentStatus, 'awaiting_courier');
  assert.equal(updatePayload.status, 'delivering');
  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0]?.body || '', /"message_id":7788/);
  assert.match(telegramCalls[0]?.body || '', /状态：待取餐/);
  assert.match(telegramCalls[0]?.body || '', /取餐/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /送达/);
});

test('picked_up 复用单次 nowIso 并同步编辑 telegram 原消息为送达按钮', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const fixedNowIso = '2026-04-14T10:25:30.000Z';
  useMockNowIso(t, fixedNowIso);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt,
      telegramMessageRef: { chatId: '123456789', messageId: 7788 },
    }),
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'picked_up',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.ok(updateCall);

  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.equal(nextMeta.pickedUpAt, fixedNowIso);
  assert.equal(nextMeta.completedAt, '');
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: '123456789', messageId: 7788 });

  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0]?.body || '', /"message_id":7788/);
  assert.match(telegramCalls[0]?.body || '', /"chat_id":"123456789"/);
  assert.match(telegramCalls[0]?.body || '', /"shopSlug":"real-shop"/);
  assert.match(telegramCalls[0]?.body || '', /状态：配送中/);
  assert.match(telegramCalls[0]?.body || '', /接单时间：2026-04-14T10:03:00.000Z/);
  assert.match(telegramCalls[0]?.body || '', /取餐时间：2026-04-14T10:25:30.000Z/);
  assert.match(telegramCalls[0]?.body || '', /送达/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /已送达/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /"inline_keyboard":\[\]/);
});

test('picked_up 缺少订单 shopSlug 时使用请求体回退 shop slug 保留送达按钮', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const fixedNowIso = '2026-04-14T10:40:00.000Z';
  useMockNowIso(t, fixedNowIso);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson({
      acceptedAt,
      telegramMessageRef: { chatId: '123456789', messageId: 7788 },
    }),
    shopSlug: '',
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'picked_up',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
      shopSlug: 'dashboard-shop',
    }),
  } as never);
  const body = await readJson(response);
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0]?.body || '', /"shopSlug":"dashboard-shop"/);
  assert.match(telegramCalls[0]?.body || '', /取餐时间：2026-04-14T10:40:00.000Z/);
  assert.match(telegramCalls[0]?.body || '', /送达/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /"inline_keyboard":\[\]/);
});

test('complete 写入 completedAt 并同步编辑 telegram 原消息为只读送达态', async (t) => {
  useTestEnv(t);
  const acceptedAt = '2026-04-14T10:03:00.000Z';
  const pickedUpAt = '2026-04-14T10:19:00.000Z';
  const fixedNowIso = '2026-04-14T10:55:00.000Z';
  useMockNowIso(t, fixedNowIso);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'picked_up',
    remarksJson: createRemarksJson({
      acceptedAt,
      pickedUpAt,
      telegramMessageRef: { chatId: '123456789', messageId: 7788 },
    }),
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'complete',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));
  const telegramCalls = calls.filter((call) => call.url.endsWith('/api/telegram/send'));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'complete');
  assert.ok(updateCall);

  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
  assert.equal(nextMeta.acceptedAt, acceptedAt);
  assert.equal(nextMeta.pickedUpAt, pickedUpAt);
  assert.equal(nextMeta.completedAt, fixedNowIso);
  assert.deepEqual(nextMeta.telegramMessageRef, { chatId: '123456789', messageId: 7788 });

  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0]?.body || '', /"message_id":7788/);
  assert.match(telegramCalls[0]?.body || '', /"chat_id":"123456789"/);
  assert.match(telegramCalls[0]?.body || '', /状态：已送达/);
  assert.match(telegramCalls[0]?.body || '', /接单时间：2026-04-14T10:03:00.000Z/);
  assert.match(telegramCalls[0]?.body || '', /取餐时间：2026-04-14T10:19:00.000Z/);
  assert.match(telegramCalls[0]?.body || '', /送达时间：2026-04-14T10:55:00.000Z/);
  assert.match(telegramCalls[0]?.body || '', /"inline_keyboard":\[\]/);
  assert.doesNotMatch(telegramCalls[0]?.body || '', /"callback_data":/);
  assert.equal(calls.some((call) => call.url.endsWith('/api/admin/orders/remarks')), false);
});

test('decline 主链路只走 update_status + remarksJson', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'decline',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'decline');
  assert.ok(updateCall);
  assert.equal(calls.some((call) => call.url.endsWith('/api/admin/orders/remarks')), false);

  const updatePayload = JSON.parse(updateCall.body) as {
    expectedCurrentStatus?: string;
    status?: string;
    remarksJson?: string;
    courierName?: string;
    courierPhone?: string;
  };
  assert.equal(updatePayload.expectedCurrentStatus, 'awaiting_courier');
  assert.equal(updatePayload.status, 'awaiting_courier');
  assert.equal(typeof updatePayload.remarksJson, 'string');
  assert.equal(updatePayload.courierName, undefined);
  assert.equal(updatePayload.courierPhone, undefined);

  const nextMeta = readDispatchMetaFromRemarks(String(updatePayload.remarksJson || ''));
  assert.equal(nextMeta.lastRiderDecision?.action, 'declined');
  assert.equal(nextMeta.lastRiderDecision?.riderId, String(TEST_RIDER_ID));
  assert.equal(nextMeta.lastRiderDecision?.riderPhone, TEST_RIDER_PHONE);
  assert.equal(nextMeta.currentRiderId, '');
  assert.deepEqual(nextMeta.declinedRiderIds, ['404', String(TEST_RIDER_ID)]);
  assert.deepEqual(nextMeta.invalidatedRiderIds, [String(TEST_RIDER_ID)]);
  assert.equal(nextMeta.lastInvalidationReason, 'declined');
});

test('无效入参返回 400 invalid_rider_action', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async () => {
    throw new Error('fetch should not be called');
  });

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'invalid',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'invalid_rider_action');
  assert.equal(calls.length, 0);
});
