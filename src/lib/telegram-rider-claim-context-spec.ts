import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCallback,
  createFetchHandler,
  createRemarksJson,
  createRequest,
  readJson,
  TEST_CHAT_ID,
  TEST_ORDER_ID,
  TEST_RIDER_ID,
  TEST_RIDER_NAME,
  TEST_RIDER_PHONE,
  useMockFetch,
  useTestEnv,
} from './telegram-rider-claim-spec-helpers.ts';
import {
  buildDefaultTelegramClaimActionDecision,
  buildTelegramClaimActionDecisionFailureResponse,
  buildTelegramClaimCallbackIdentityFailureResult,
  buildTelegramClaimContextFailureResult,
  buildTelegramClaimContextFailureWithCallback,
  buildTelegramClaimContextFailureWithChatId,
  buildTelegramClaimContextFailureWithEmptyChatId,
  buildTelegramClaimEmptyContextResult,
  buildTelegramClaimFailureResponse,
  buildTelegramClaimIdentityFailureResponse,
  buildTelegramClaimIdentityFailureResult,
  buildTelegramClaimInvalidCallbackFailureResponse,
  buildTelegramClaimProgressContext,
  buildTelegramClaimProgressSuccessResponse,
  buildTelegramClaimRequestBodyFailureResult,
  resolveTelegramClaimCallbackOrFailureResponse,
  resolveTelegramClaimContextCallbackContextOrFailureResult,
  resolveTelegramClaimContextCallbackOrFailureResult,
  resolveTelegramClaimContextCallbackResolutionOrFailureResult,
  resolveTelegramClaimContextCallbackToFinalContextOrFailureResult,
  resolveTelegramClaimContextCallbackToIdentityContextOrFailureResult,
  resolveTelegramClaimContextIdentityContextOrFailureResult,
  resolveTelegramClaimContextIdentityResolutionOrFailureResult,
  resolveTelegramClaimContextOrFailureResponse,
  resolveTelegramClaimContextProgressContextSuccessResult,
  resolveTelegramClaimContextRequestBodyContextOrFailureResult,
  resolveTelegramClaimContextRequestBodyResolutionOrFailureResult,
  resolveTelegramClaimIdentityOrFailureResponse,
  resolveTelegramClaimRequestBodyOrFailureResponse,
} from '../pages/api/telegram/rider-claim.ts';

function createParsedCallback(overrides: Partial<{
  orderId: number;
  riderId: number;
  riderName: string;
  riderPhone: string;
  telegramChatId: string;
  restaurantId: string;
  expiresAt: number;
  action: 'accept' | 'decline' | 'picked_up' | 'complete';
  sig: string;
}> = {}) {
  return {
    orderId: TEST_ORDER_ID,
    riderId: TEST_RIDER_ID,
    riderName: TEST_RIDER_NAME,
    riderPhone: TEST_RIDER_PHONE,
    telegramChatId: TEST_CHAT_ID,
    restaurantId: 'shop-1',
    expiresAt: Date.now() + 60_000,
    action: 'picked_up' as const,
    sig: 'test',
    ...overrides,
  };
}

type TelegramClaimContextAssertion = {
  chatId: string;
  callback: unknown;
  resolvedName: string;
  resolvedPhone: string;
  orderIdText: string;
  riderIdText: string;
  nowIso: string;
  orderDetailForProgress: unknown;
  isDeclineAction: boolean;
  response: Response | null;
  actionDecision: {
    allowed: boolean;
  };
};

function assertEmptyTelegramClaimContext(
  result: TelegramClaimContextAssertion,
  options: {
    response: Response | null;
    chatId?: string;
    callback?: unknown;
    resolvedName?: string;
    resolvedPhone?: string;
  },
): void {
  assert.equal(result.chatId, options.chatId ?? '');
  assert.equal(result.callback, options.callback ?? null);
  assert.equal(result.resolvedName, options.resolvedName ?? '');
  assert.equal(result.resolvedPhone, options.resolvedPhone ?? '');
  assert.equal(result.orderIdText, '');
  assert.equal(result.riderIdText, '');
  assert.equal(result.nowIso, '');
  assert.equal(result.orderDetailForProgress, null);
  assert.equal(result.isDeclineAction, false);
  assert.equal(result.response, options.response);
  assert.equal(result.actionDecision.allowed, false);
}

test('resolveTelegramClaimCallbackOrFailureResponse 在 short callback chatId 不匹配时统一返回 public error response', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/rider/status' && url.searchParams.get('action') === 'list_available') {
      return jsonResponse({
        riders: [
          {
            id: TEST_RIDER_ID,
            name: TEST_RIDER_NAME,
            phone: TEST_RIDER_PHONE,
            telegram_chat_id: TEST_CHAT_ID,
            status: 'available',
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const resolved = await resolveTelegramClaimCallbackOrFailureResponse({
    request: createRequest(createCallback('picked_up', Date.now() - 1_000)),
    callbackData: createCallback('picked_up', Date.now() - 1_000),
    chatId: '999999999',
  });
  const riderStatusCalls = calls.filter((call) => call.url.includes('/api/rider/status?action=list_available'));

  assert.ok(resolved.response);
  assert.equal(resolved.callback, null);
  assert.equal(riderStatusCalls.length, 0);

  const body = await readJson(resolved.response);
  assert.equal(resolved.response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'rider_identity_mismatch');
});

test('buildTelegramClaimCallbackIdentityFailureResult 统一输出 callback rider_identity_mismatch 失败骨架', async () => {
  const result = buildTelegramClaimCallbackIdentityFailureResult();
  const body = await readJson(result.response);

  assert.equal(result.callback, null);
  assert.equal(result.response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'rider_identity_mismatch');
});

test('buildTelegramClaimIdentityFailureResponse 统一输出 rider_identity_mismatch 响应', async () => {
  const response = buildTelegramClaimIdentityFailureResponse();
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'rider_identity_mismatch');
});

test('buildTelegramClaimIdentityFailureResult 统一输出 identity 失败骨架', async () => {
  const result = buildTelegramClaimIdentityFailureResult();
  const body = await readJson(result.response);

  assert.equal(result.resolvedName, '');
  assert.equal(result.resolvedPhone, '');
  assert.equal(result.response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'rider_identity_mismatch');
});

test('resolveTelegramClaimIdentityOrFailureResponse 在 callback 缺失 telegramChatId 时统一回 rider_identity_mismatch', async () => {
  const resolved = resolveTelegramClaimIdentityOrFailureResponse({
    callback: {
      ...createParsedCallback(),
      telegramChatId: '',
      action: 'picked_up',
    },
    chatId: TEST_CHAT_ID,
  });

  assert.ok(resolved.response);
  assert.equal(resolved.resolvedName, '');
  assert.equal(resolved.resolvedPhone, '');

  const body = await readJson(resolved.response);
  assert.equal(resolved.response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'rider_identity_mismatch');
});

test('buildTelegramClaimRequestBodyFailureResult 统一输出 request body 失败骨架', async () => {
  const result = buildTelegramClaimRequestBodyFailureResult('chat_id_required');
  const body = await readJson(result.response);

  assert.equal(result.callbackData, '');
  assert.equal(result.chatId, '');
  assert.equal(result.response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'chat_id_required');
});

test('resolveTelegramClaimRequestBodyOrFailureResponse 在缺失 chatId 时统一回 chat_id_required', async (t) => {
  useTestEnv(t);
  const resolved = await resolveTelegramClaimRequestBodyOrFailureResponse(new Request('https://example.com/api/telegram/rider-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callbackData: createCallback('picked_up', Date.now() - 1_000) }),
  }));

  assert.ok(resolved.response);
  assert.equal(resolved.callbackData, '');
  assert.equal(resolved.chatId, '');

  const body = await readJson(resolved.response);
  assert.equal(resolved.response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'chat_id_required');
});

test('buildTelegramClaimActionDecisionFailureResponse 统一输出 409 业务拒绝错误', async () => {
  const response = buildTelegramClaimActionDecisionFailureResponse({
    allowed: false,
    error: 'dispatch_invalidated',
    reason: '已改派',
  });
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error, 'dispatch_invalidated');
  assert.equal(body.reason, '已改派');
});

test('buildDefaultTelegramClaimActionDecision 返回统一默认拒绝决策', () => {
  const actionDecision = buildDefaultTelegramClaimActionDecision();

  assert.equal(actionDecision.allowed, false);
  assert.equal(actionDecision.error, 'order_status_updated');
});

test('buildTelegramClaimInvalidCallbackFailureResponse 统一输出 invalid_callback_data 响应', async () => {
  const response = buildTelegramClaimInvalidCallbackFailureResponse();
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'invalid_callback_data');
});

test('buildTelegramClaimProgressSuccessResponse 统一输出配送进度成功回包', async () => {
  const response = buildTelegramClaimProgressSuccessResponse('picked_up', 200);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.action, 'picked_up');
});

test('buildTelegramClaimContextFailureWithEmptyChatId 统一输出空 chatId 的 context 失败骨架', async () => {
  const response = buildTelegramClaimRequestBodyFailureResult('invalid_json').response;
  const result = buildTelegramClaimContextFailureWithEmptyChatId(response);

  assertEmptyTelegramClaimContext(result, { response });
});

test('buildTelegramClaimContextFailureWithChatId 统一输出带 chatId 的空 context 骨架', async () => {
  const response = buildTelegramClaimFailureResponse(new Error('invalid_callback_data'));
  const result = buildTelegramClaimContextFailureWithChatId(TEST_CHAT_ID, response);

  assertEmptyTelegramClaimContext(result, {
    response,
    chatId: TEST_CHAT_ID,
  });
});

test('buildTelegramClaimContextFailureWithChatId 在省略 chatId 时回退到空字符串默认值', () => {
  const response = buildTelegramClaimFailureResponse(new Error('invalid_callback_data'));
  const result = buildTelegramClaimContextFailureWithChatId(response);

  assertEmptyTelegramClaimContext(result, { response });
});

test('buildTelegramClaimContextFailureWithCallback 统一输出带 callback 的空 context 骨架', async () => {
  const response = buildTelegramClaimIdentityFailureResponse();
  const callback = createParsedCallback();
  const result = buildTelegramClaimContextFailureWithCallback(TEST_CHAT_ID, callback, response);

  assertEmptyTelegramClaimContext(result, {
    response,
    chatId: TEST_CHAT_ID,
    callback,
  });
});

test('buildTelegramClaimContextFailureWithCallback 在省略 chatId 时回退到空字符串默认值', () => {
  const response = buildTelegramClaimIdentityFailureResponse();
  const callback = createParsedCallback();
  const result = buildTelegramClaimContextFailureWithCallback(callback, response);

  assertEmptyTelegramClaimContext(result, {
    response,
    callback,
  });
});

test('buildTelegramClaimEmptyContextResult 统一输出可复用空 context 骨架', () => {
  const callback = createParsedCallback();
  const response = buildTelegramClaimFailureResponse(new Error('invalid_callback_data'));
  const result = buildTelegramClaimEmptyContextResult({
    chatId: TEST_CHAT_ID,
    callback,
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
    response,
  });

  assertEmptyTelegramClaimContext(result, {
    response,
    chatId: TEST_CHAT_ID,
    callback,
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
  });
});

test('buildTelegramClaimEmptyContextResult 在省略 chatId 与 callback 时回退到统一默认值', () => {
  const response = buildTelegramClaimFailureResponse(new Error('invalid_callback_data'));
  const result = buildTelegramClaimEmptyContextResult({ response });

  assertEmptyTelegramClaimContext(result, { response });
});

test('buildTelegramClaimContextFailureResult 在省略 chatId 与 callback 时回退到空 context 默认值', () => {
  const response = buildTelegramClaimFailureResponse(new Error('invalid_callback_data'));
  const result = buildTelegramClaimContextFailureResult({ response });

  assertEmptyTelegramClaimContext(result, { response });
});

test('buildTelegramClaimContextFailureResult 统一输出空 context 骨架', async () => {
  const response = buildTelegramClaimFailureResponse(new Error('invalid_callback_data'));
  const result = buildTelegramClaimContextFailureResult({
    chatId: TEST_CHAT_ID,
    callback: null,
    response,
  });

  assertEmptyTelegramClaimContext(result, {
    response,
    chatId: TEST_CHAT_ID,
  });
});

test('resolveTelegramClaimContextCallbackOrFailureResult 统一处理 callback 为空与存在两种结果', async () => {
  const response = buildTelegramClaimInvalidCallbackFailureResponse();
  const missing = resolveTelegramClaimContextCallbackOrFailureResult(TEST_CHAT_ID, null);
  const existingCallback = createParsedCallback();
  const existing = resolveTelegramClaimContextCallbackOrFailureResult(TEST_CHAT_ID, existingCallback);

  assert.equal(missing.response?.status, response.status);
  assert.equal(missing.chatId, TEST_CHAT_ID);
  assert.equal(missing.callback, null);
  assert.equal(existing.response, null);
  assert.equal(existing.chatId, TEST_CHAT_ID);
  assert.equal(existing.callback, existingCallback);
});

test('resolveTelegramClaimContextCallbackOrFailureResult 在省略 chatId 时回退到空字符串默认值', () => {
  const existingCallback = createParsedCallback();
  const existing = resolveTelegramClaimContextCallbackOrFailureResult(existingCallback);

  assert.equal(existing.response, null);
  assert.equal(existing.chatId, '');
  assert.equal(existing.callback, existingCallback);
});

test('resolveTelegramClaimContextRequestBodyContextOrFailureResult 统一串起 requestBodyResolution 到 callbackNextContext', async (t) => {
  useTestEnv(t);
  const callbackData = createCallback('picked_up', Date.now() - 1_000);
  const callback = createParsedCallback();
  const calls = useMockFetch(t, async () => {
    throw new Error('fetch should not be called');
  });

  const failed = await resolveTelegramClaimContextRequestBodyContextOrFailureResult({
    request: createRequest(callbackData),
    requestBodyResolution: buildTelegramClaimRequestBodyFailureResult('invalid_json'),
  });
  const passed = await resolveTelegramClaimContextRequestBodyContextOrFailureResult({
    request: createRequest(callbackData),
    requestBodyResolution: {
      callbackData,
      chatId: TEST_CHAT_ID,
      response: null,
    },
  });

  assert.equal(failed.response?.status, 400);
  assert.equal(failed.chatId, '');
  assert.equal(failed.callback, null);
  assert.equal(passed.response, null);
  assert.equal(passed.chatId, TEST_CHAT_ID);
  assert.equal(String(passed.callback?.orderId || ''), String(callback.orderId));
  assert.equal(calls.length, 0);
});

test('resolveTelegramClaimContextRequestBodyResolutionOrFailureResult 统一串起 requestBodyResolution 到 callbackContext', async (t) => {
  useTestEnv(t);
  const callbackData = createCallback('picked_up', Date.now() - 1_000);
  const callback = createParsedCallback();
  const calls = useMockFetch(t, async () => {
    throw new Error('fetch should not be called');
  });

  const failed = await resolveTelegramClaimContextRequestBodyResolutionOrFailureResult({
    request: createRequest(callbackData),
    requestBodyResolution: buildTelegramClaimRequestBodyFailureResult('invalid_json'),
  });
  const passed = await resolveTelegramClaimContextRequestBodyResolutionOrFailureResult({
    request: createRequest(callbackData),
    requestBodyResolution: {
      callbackData,
      chatId: TEST_CHAT_ID,
      response: null,
    },
  });

  assert.equal(failed.response?.status, 400);
  assert.equal(failed.chatId, '');
  assert.equal(failed.callback, null);
  assert.equal(passed.response, null);
  assert.equal(passed.chatId, TEST_CHAT_ID);
  assert.equal(String(passed.callback?.orderId || ''), String(callback.orderId));
  assert.equal(calls.length, 0);
});

test('resolveTelegramClaimContextCallbackContextOrFailureResult 统一串起 callbackContext 到下一层 context', async () => {
  const callback = createParsedCallback();
  const failed = resolveTelegramClaimContextCallbackContextOrFailureResult({
    chatId: TEST_CHAT_ID,
    callbackContext: buildTelegramClaimContextFailureWithChatId(
      TEST_CHAT_ID,
      buildTelegramClaimInvalidCallbackFailureResponse(),
    ),
  });
  const passed = resolveTelegramClaimContextCallbackContextOrFailureResult({
    chatId: TEST_CHAT_ID,
    callbackContext: resolveTelegramClaimContextCallbackOrFailureResult(TEST_CHAT_ID, callback),
  });

  assert.equal(failed.response?.status, 400);
  assert.equal(failed.chatId, TEST_CHAT_ID);
  assert.equal(failed.callback, null);
  assert.equal(passed.response, null);
  assert.equal(passed.chatId, TEST_CHAT_ID);
  assert.equal(passed.callback, callback);
});

test('resolveTelegramClaimContextCallbackContextOrFailureResult 在省略 chatId 时回退到空字符串默认值', () => {
  const callback = createParsedCallback();
  const passed = resolveTelegramClaimContextCallbackContextOrFailureResult({
    callbackContext: resolveTelegramClaimContextCallbackOrFailureResult(callback),
  });

  assert.equal(passed.response, null);
  assert.equal(passed.chatId, '');
  assert.equal(passed.callback, callback);
});

test('resolveTelegramClaimContextCallbackResolutionOrFailureResult 统一串起 callbackResolution 到 context 结果', async () => {
  const response = buildTelegramClaimCallbackIdentityFailureResult().response;
  const callback = createParsedCallback();

  const failed = resolveTelegramClaimContextCallbackResolutionOrFailureResult(TEST_CHAT_ID, {
    callback: null,
    response,
  });
  const passed = resolveTelegramClaimContextCallbackResolutionOrFailureResult(TEST_CHAT_ID, {
    callback,
    response: null,
  });

  assert.equal(failed.response, response);
  assert.equal(failed.chatId, TEST_CHAT_ID);
  assert.equal(failed.callback, null);
  assert.equal(passed.response, null);
  assert.equal(passed.chatId, TEST_CHAT_ID);
  assert.equal(passed.callback, callback);
});

test('resolveTelegramClaimContextCallbackResolutionOrFailureResult 在省略 chatId 时回退到空字符串默认值', () => {
  const callback = createParsedCallback();
  const passed = resolveTelegramClaimContextCallbackResolutionOrFailureResult({
    callback,
    response: null,
  });

  assert.equal(passed.response, null);
  assert.equal(passed.chatId, '');
  assert.equal(passed.callback, callback);
});

test('resolveTelegramClaimContextIdentityResolutionOrFailureResult 统一串起 identityResolution 到 context 结果', async () => {
  const callback = createParsedCallback();
  const response = buildTelegramClaimIdentityFailureResponse();

  const failed = resolveTelegramClaimContextIdentityResolutionOrFailureResult(TEST_CHAT_ID, callback, {
    resolvedName: '',
    resolvedPhone: '',
    response,
  });
  const passed = resolveTelegramClaimContextIdentityResolutionOrFailureResult(TEST_CHAT_ID, callback, {
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
    response: null,
  });

  assert.equal(failed.response, response);
  assert.equal(failed.chatId, TEST_CHAT_ID);
  assert.equal(failed.callback, callback);
  assert.equal(passed.response, null);
  assert.equal(passed.chatId, TEST_CHAT_ID);
  assert.equal(passed.callback, callback);
});

test('resolveTelegramClaimContextIdentityResolutionOrFailureResult 在省略 chatId 时回退到空字符串默认值', () => {
  const callback = createParsedCallback();
  const passed = resolveTelegramClaimContextIdentityResolutionOrFailureResult(callback, {
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
    response: null,
  });

  assert.equal(passed.response, null);
  assert.equal(passed.chatId, '');
  assert.equal(passed.callback, callback);
  assert.equal(passed.resolvedName, TEST_RIDER_NAME);
  assert.equal(passed.resolvedPhone, TEST_RIDER_PHONE);
});

test('resolveTelegramClaimContextCallbackToIdentityContextOrFailureResult 统一串起 callbackNextContext 到 identityContext', async () => {
  const callback = createParsedCallback();
  const failed = resolveTelegramClaimContextCallbackToIdentityContextOrFailureResult({
    chatId: TEST_CHAT_ID,
    callbackNextContext: buildTelegramClaimContextFailureWithChatId(
      TEST_CHAT_ID,
      buildTelegramClaimInvalidCallbackFailureResponse(),
    ),
  });
  const passed = resolveTelegramClaimContextCallbackToIdentityContextOrFailureResult({
    chatId: TEST_CHAT_ID,
    callbackNextContext: resolveTelegramClaimContextCallbackOrFailureResult(TEST_CHAT_ID, callback),
  });

  assert.equal(failed.response?.status, 400);
  assert.equal(failed.chatId, TEST_CHAT_ID);
  assert.equal(failed.callback, null);
  assert.equal(passed.response, null);
  assert.equal(passed.chatId, TEST_CHAT_ID);
  assert.equal(passed.callback, callback);
  assert.equal(passed.resolvedName, TEST_RIDER_NAME);
  assert.equal(passed.resolvedPhone, TEST_RIDER_PHONE);
});

test('resolveTelegramClaimContextProgressContextSuccessResult 统一串起 progressContext 到成功 context', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const callback = createParsedCallback();
  const progressContext = await buildTelegramClaimProgressContext({
    request: createRequest(createCallback('picked_up', Date.now() - 1_000)),
    callback,
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
  });

  const result = resolveTelegramClaimContextProgressContextSuccessResult({
    chatId: TEST_CHAT_ID,
    callback,
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
    progressContext,
  });

  assert.equal(result.chatId, TEST_CHAT_ID);
  assert.equal(String(result.callback?.orderId || ''), String(TEST_ORDER_ID));
  assert.equal(result.resolvedName, TEST_RIDER_NAME);
  assert.equal(result.resolvedPhone, TEST_RIDER_PHONE);
  assert.equal(result.orderIdText, String(TEST_ORDER_ID));
  assert.equal(result.riderIdText, String(TEST_RIDER_ID));
  assert.equal(result.isDeclineAction, false);
  assert.equal(result.orderDetailForProgress?.status, 'delivering');
  assert.equal(result.actionDecision.allowed, true);
  assert.equal(result.response, null);
  assert.match(result.nowIso, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(calls.some((call) => call.url.includes('/api/admin/orders')), true);
});

test('buildTelegramClaimProgressContext 统一组装 order/action context', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const context = await buildTelegramClaimProgressContext({
    request: createRequest(createCallback('picked_up', Date.now() - 1_000)),
    callback: {
      ...createParsedCallback(),
      action: 'picked_up',
    },
    resolvedName: TEST_RIDER_NAME,
    resolvedPhone: TEST_RIDER_PHONE,
  });

  assert.equal(context.orderIdText, String(TEST_ORDER_ID));
  assert.equal(context.riderIdText, String(TEST_RIDER_ID));
  assert.equal(context.isDeclineAction, false);
  assert.equal(context.orderDetailForProgress?.status, 'delivering');
  assert.equal(context.actionDecision.allowed, true);
  assert.match(context.nowIso, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(calls.some((call) => call.url.includes('/api/admin/orders')), true);
});

test('resolveTelegramClaimContextIdentityContextOrFailureResult 统一串起 identityContext 到最终 context', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const callback = createParsedCallback();
  const failed = await resolveTelegramClaimContextIdentityContextOrFailureResult({
    request: createRequest(createCallback('picked_up', Date.now() - 1_000)),
    chatId: TEST_CHAT_ID,
    callback,
    identityContext: buildTelegramClaimContextFailureWithCallback(
      TEST_CHAT_ID,
      callback,
      buildTelegramClaimIdentityFailureResponse(),
    ),
  });
  const passed = await resolveTelegramClaimContextIdentityContextOrFailureResult({
    request: createRequest(createCallback('picked_up', Date.now() - 1_000)),
    chatId: TEST_CHAT_ID,
    callback,
    identityContext: resolveTelegramClaimContextIdentityResolutionOrFailureResult(TEST_CHAT_ID, callback, {
      resolvedName: 'Rider_1',
      resolvedPhone: TEST_RIDER_PHONE,
      response: null,
    }),
  });

  assert.equal(failed.response?.status, 400);
  assert.equal(failed.chatId, TEST_CHAT_ID);
  assert.equal(failed.callback, callback);
  assert.equal(passed.response, null);
  assert.equal(passed.chatId, TEST_CHAT_ID);
  assert.equal(String(passed.callback?.orderId || ''), String(TEST_ORDER_ID));
  assert.equal(passed.resolvedName, 'Rider_1');
  assert.equal(passed.resolvedPhone, TEST_RIDER_PHONE);
  assert.equal(passed.orderIdText, String(TEST_ORDER_ID));
  assert.equal(passed.riderIdText, String(TEST_RIDER_ID));
  assert.equal(passed.isDeclineAction, false);
  assert.equal(passed.actionDecision.allowed, true);
  assert.equal(passed.orderDetailForProgress?.status, 'delivering');
  assert.match(passed.nowIso, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(calls.some((call) => call.url.includes('/api/admin/orders')), true);
});

test('resolveTelegramClaimContextCallbackToFinalContextOrFailureResult 统一串起 callbackNextContext 到最终 context', async (t) => {
  useTestEnv(t);
  const callback = createParsedCallback();
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const failed = await resolveTelegramClaimContextCallbackToFinalContextOrFailureResult({
    request: createRequest(createCallback('picked_up', Date.now() - 1_000)),
    callbackNextContext: buildTelegramClaimContextFailureWithChatId(
      TEST_CHAT_ID,
      buildTelegramClaimInvalidCallbackFailureResponse(),
    ),
  });
  const passed = await resolveTelegramClaimContextCallbackToFinalContextOrFailureResult({
    request: createRequest(createCallback('picked_up', Date.now() - 1_000)),
    callbackNextContext: resolveTelegramClaimContextCallbackOrFailureResult(TEST_CHAT_ID, callback),
  });

  assert.equal(failed.response?.status, 400);
  assert.equal(failed.chatId, TEST_CHAT_ID);
  assert.equal(failed.callback, null);
  assert.equal(passed.response, null);
  assert.equal(passed.chatId, TEST_CHAT_ID);
  assert.equal(String(passed.callback?.orderId || ''), String(TEST_ORDER_ID));
  assert.equal(passed.resolvedName, TEST_RIDER_NAME);
  assert.equal(passed.resolvedPhone, TEST_RIDER_PHONE);
  assert.equal(passed.orderIdText, String(TEST_ORDER_ID));
  assert.equal(passed.riderIdText, String(TEST_RIDER_ID));
  assert.equal(passed.isDeclineAction, false);
  assert.equal(passed.actionDecision.allowed, true);
  assert.equal(passed.orderDetailForProgress?.status, 'delivering');
  assert.match(passed.nowIso, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(calls.some((call) => call.url.includes('/api/admin/orders')), true);
});

test('resolveTelegramClaimContextOrFailureResponse 统一串起 requestBody、callback、identity、progressContext', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'delivering',
    remarksJson: createRemarksJson(),
  }));

  const resolved = await resolveTelegramClaimContextOrFailureResponse(createRequest(createCallback('picked_up', Date.now() - 1_000)));

  assert.equal(resolved.response, null);
  assert.equal(resolved.chatId, TEST_CHAT_ID);
  assert.equal(String(resolved.callback?.orderId || ''), String(TEST_ORDER_ID));
  assert.equal(resolved.resolvedName, 'Rider_1');
  assert.equal(resolved.resolvedPhone, TEST_RIDER_PHONE);
  assert.equal(resolved.orderIdText, String(TEST_ORDER_ID));
  assert.equal(resolved.riderIdText, String(TEST_RIDER_ID));
  assert.equal(resolved.isDeclineAction, false);
  assert.equal(resolved.actionDecision.allowed, true);
  assert.equal(resolved.orderDetailForProgress?.status, 'delivering');
  assert.match(resolved.nowIso, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(calls.some((call) => call.url.includes('/api/admin/orders')), true);
});
