import test from 'node:test';
import assert from 'node:assert/strict';

import * as orders from './orders.ts';
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocation = globalThis.location;
const originalAlert = globalThis.alert;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.location = originalLocation;
  globalThis.alert = originalAlert;
});

test('assignRider posts manual_assign payload with eta selected rider telegram chat id and order summary', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await orders.assignRider('470', '7', {
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 15,
    riderTelegramChatId: 'tg-7',
  });

  assert.deepEqual(capturedBody, {
    action: 'manual_assign',
    orderId: '470',
    riderId: '7',
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 15,
    riderTelegramChatId: 'tg-7',
    telegramBotToken: '',
    debugTelegram: false,
  });
});

test('autoAssignRider posts auto_assign payload without frontend cursor and with eta', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await orders.autoAssignRider('471', { shopSlug: 'demo-shop', pickupEtaMinutes: 20 });

  assert.deepEqual(capturedBody, {
    action: 'auto_assign',
    orderId: '471',
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 20,
  });
});

test('assignRider throws telegram notification failure details when assignment succeeded but notify failed', async () => {
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    telegram_notification: {
      success: false,
      error: '{"success":false,"error":"telegram_bot_token_not_configured"}',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(
    () => orders.assignRider('470', '7', { shopSlug: 'demo-shop', pickupEtaMinutes: 15 }),
    /telegram_bot_token_not_configured/,
  );
});

test('autoAssignRider throws telegram notification failure details when assignment succeeded but notify failed', async () => {
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    telegram_notification: {
      success: false,
      error: 'telegram_chat_id_missing',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(
    () => orders.autoAssignRider('471', { shopSlug: 'demo-shop', pickupEtaMinutes: 20 }),
    /telegram_chat_id_missing/,
  );
});

test('assignRider emits preflight debug alert before request when debugTelegram is enabled', async () => {
  const alertMessages: string[] = [];
  let fetchStarted = false;
  globalThis.alert = ((message?: string) => {
    alertMessages.push(String(message || ''));
  }) as typeof alert;
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.fetch = async () => {
    fetchStarted = true;
    assert.deepEqual(alertMessages, ['派单调试: 已进入 assignRider，准备请求 /api/admin/rider-assign']);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await orders.assignRider('470', '7', {
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 15,
    riderTelegramChatId: 'tg-7',
    debugTelegram: true,
  });

  assert.equal(fetchStarted, true);
});

test('assignRider shows response-stage debug alerts when debugTelegram is enabled and notify succeeds', async () => {
  const toastMessages: string[] = [];
  const alertMessages: string[] = [];
  let refreshed = false;
  globalThis.alert = ((message?: string) => {
    alertMessages.push(String(message || ''));
  }) as typeof alert;
  globalThis.window = {
    showToast(message: string) {
      toastMessages.push(message);
    },
    refreshOrderList() {
      refreshed = true;
    },
  } as any;

  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    telegram_notification: {
      success: true,
      chatId: 'tg-7',
      chatIdSource: 'request',
      shopSlug: 'demo-shop',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  await orders.assignRider('470', '7', {
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 15,
    riderTelegramChatId: 'tg-7',
    debugTelegram: true,
  });

  assert.deepEqual(alertMessages, [
    '派单调试: 已进入 assignRider，准备请求 /api/admin/rider-assign',
    '派单调试: /api/admin/rider-assign 已返回 200',
    '派单调试: /api/admin/rider-assign 响应 {"success":true,"telegram_notification":{"success":true,"chatId":"tg-7","chatIdSource":"request","shopSlug":"demo-shop"}}',
    '派单Telegram: success chat=tg-7 source=request shop=demo-shop',
  ]);
  assert.deepEqual(toastMessages, []);
  assert.equal(refreshed, true);
});

test('assignRider aborts hanging rider-assign request and shows timeout debug alert', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const alertMessages: string[] = [];
  globalThis.alert = ((message?: string) => {
    alertMessages.push(String(message || ''));
  }) as typeof alert;
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.setTimeout = ((handler: TimerHandler) => {
    queueMicrotask(() => {
      if (typeof handler === 'function') handler();
    });
    return 1 as any;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal | undefined;
    await new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason || new Error('aborted')), { once: true });
    });
    throw new Error('unreachable');
  };

  await assert.rejects(
    () => orders.assignRider('470', '7', {
      shopSlug: 'demo-shop',
      pickupEtaMinutes: 15,
      riderTelegramChatId: 'tg-7',
      debugTelegram: true,
    }),
    /request timeout/i,
  );

  assert.deepEqual(alertMessages, [
    '派单调试: 已进入 assignRider，准备请求 /api/admin/rider-assign',
    '派单调试: /api/admin/rider-assign 请求失败 request timeout',
  ]);

  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

test('assignRider treats aborted fetch with browser Failed to fetch message as request timeout', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const alertMessages: string[] = [];
  globalThis.alert = ((message?: string) => {
    alertMessages.push(String(message || ''));
  }) as typeof alert;
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.setTimeout = ((handler: TimerHandler) => {
    queueMicrotask(() => {
      if (typeof handler === 'function') handler();
    });
    return 1 as any;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal | undefined;
    await new Promise((resolve) => {
      signal?.addEventListener('abort', resolve, { once: true });
    });
    throw new TypeError('Failed to fetch');
  };

  await assert.rejects(
    () => orders.assignRider('470', '7', {
      shopSlug: 'demo-shop',
      pickupEtaMinutes: 15,
      riderTelegramChatId: 'tg-7',
      debugTelegram: true,
    }),
    /request timeout/i,
  );

  assert.deepEqual(alertMessages, [
    '派单调试: 已进入 assignRider，准备请求 /api/admin/rider-assign',
    '派单调试: /api/admin/rider-assign 请求失败 request timeout',
  ]);

  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

test('assignRider keeps plain Failed to fetch when request was not aborted', async () => {
  const alertMessages: string[] = [];
  globalThis.alert = ((message?: string) => {
    alertMessages.push(String(message || ''));
  }) as typeof alert;
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  await assert.rejects(
    () => orders.assignRider('470', '7', {
      shopSlug: 'demo-shop',
      pickupEtaMinutes: 15,
      riderTelegramChatId: 'tg-7',
      debugTelegram: true,
    }),
    /Failed to fetch/i,
  );

  assert.deepEqual(alertMessages, [
    '派单调试: 已进入 assignRider，准备请求 /api/admin/rider-assign',
    '派单调试: /api/admin/rider-assign 请求失败 Failed to fetch',
  ]);
});

test('assignRider flushes deferred order refresh after request finishes', async () => {
  let refreshCount = 0;
  globalThis.window = {
    showToast() {},
    refreshOrderList() {
      refreshCount++;
    },
    __adminAssignInFlight: false,
    __adminPendingOrderRefresh: false,
  } as any;

  globalThis.fetch = async () => {
    assert.equal(globalThis.window.__adminAssignInFlight, true);
    globalThis.window.__adminPendingOrderRefresh = true;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await orders.assignRider('470', '7', {
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 15,
    riderTelegramChatId: 'tg-7',
  });

  assert.equal(globalThis.window.__adminAssignInFlight, false);
  assert.equal(globalThis.window.__adminPendingOrderRefresh, false);
  assert.equal(refreshCount, 1);
});

test('loadOrders fetches admin orders and updates hidden-data without full reload', async () => {
  let reloadCount = 0;
  const hiddenNodes: Array<{ dataset: Record<string, string> }> = [
    { dataset: { orderId: '1', oid: '1', status: 'awaiting_courier', remarks: '[]' } },
  ];
  const deliveryContainer = { innerHTML: '<div>old delivery</div>' };
  const orderList = { innerHTML: '<div>old order list</div>' };
  const tableConfigNode = { textContent: JSON.stringify([{ name: '大厅', prefix: '', count: 2 }]) };

  globalThis.location = {
    reload() {
      reloadCount++;
    },
  } as any;

  globalThis.document = {
    getElementById(id: string) {
      if (id === 'delivery-list-container') return deliveryContainer;
      if (id === 'tab-orders') return { querySelector: (selector: string) => selector === '.order-list' ? orderList : null };
      if (id === 'table-config-data') return tableConfigNode;
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === '.hidden-data') return hiddenNodes as any;
      return [] as any;
    },
  } as any;

  globalThis.window = {
    __adminHandlers: {},
    __adminRuntime: {
      shopId: 103,
      shopSlug: 'demo-shop',
      currentSettings: {},
    },
    showToast() {},
  } as any;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    assert.equal(String(input), '/api/admin/orders');
    return new Response(JSON.stringify([
      {
        id: 2,
        orderNo: 'A1002',
        orderType: 'delivery',
        status: 'delivering',
        totalAmount: 88,
        itemsJson: '[{"name":"米饭","quantity":1}]',
        remarksJson: '[]',
        tableInfo: 'Kralja Petra 1',
        userPhone: '381611111111',
        scheduledFor: '',
        pickupEtaMinutes: 15,
        pickupReadyAt: '',
        riderBroadcastedAt: '',
        riderRemindCount: 0,
        riderLastRemindedAt: '',
        riderContactAttemptedAt: '',
        courierName: 'Rider A',
        courierPhone: '381620000000',
        createdAt: '2026-04-09 10:00:00',
        isDeleted: 0,
      },
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.equal(typeof orders.loadOrders, 'function');
  await orders.loadOrders();

  assert.equal(reloadCount, 0);
  assert.equal(hiddenNodes.length, 1);
  assert.equal(hiddenNodes[0]?.dataset?.orderId, '2');
  assert.equal(hiddenNodes[0]?.dataset?.status, 'delivering');
});

test('loadOrders normalizes snake_case admin orders payload before rendering', async () => {
  const hiddenNodes: Array<{ dataset: Record<string, string> }> = [
    { dataset: { orderId: '1', oid: '1', status: 'awaiting_courier', remarks: '[]' } },
  ];
  const deliveryContainer = { innerHTML: '' };
  const orderList = { innerHTML: '' };
  const tableConfigNode = { textContent: JSON.stringify([{ name: '大厅', prefix: '', count: 2 }]) };

  globalThis.location = { reload() {} } as any;
  globalThis.document = {
    getElementById(id: string) {
      if (id === 'delivery-list-container') return deliveryContainer;
      if (id === 'tab-orders') return { querySelector: (selector: string) => selector === '.order-list' ? orderList : null };
      if (id === 'table-config-data') return tableConfigNode;
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === '.hidden-data') return hiddenNodes as any;
      return [] as any;
    },
  } as any;
  globalThis.window = {
    __adminHandlers: {},
    __adminRuntime: {
      shopId: 103,
      shopSlug: 'demo-shop',
      currentSettings: {},
    },
    showToast() {},
  } as any;

  globalThis.fetch = async () => new Response(JSON.stringify([
    {
      id: 615,
      order_no: '615',
      order_type: 'delivery',
      status: 'awaiting_courier',
      total_amount: 123,
      items_json: '[{"name":"炒饭","quantity":2}]',
      remarks_json: '[]',
      table_info: 'Test Address 15',
      user_phone: '381611111111',
      scheduled_for: '18:30',
      rider_broadcasted_at: '2026-04-09 18:00:00',
      rider_remind_count: 1,
      courier_name: 'Rider Snake',
      courier_phone: '381620000000',
      created_at: '2026-04-09 17:50:00',
      is_deleted: 0,
    },
  ]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  await orders.loadOrders();

  assert.equal(hiddenNodes[0]?.dataset?.orderId, '615');
  assert.equal(hiddenNodes[0]?.dataset?.orderNo, '615');
  assert.equal(hiddenNodes[0]?.dataset?.table, 'Test Address 15');
  assert.equal(hiddenNodes[0]?.dataset?.userPhone, '381611111111');
  assert.equal(hiddenNodes[0]?.dataset?.total, '123');
  assert.match(deliveryContainer.innerHTML, /Test Address 15/);
  assert.match(deliveryContainer.innerHTML, /381611111111/);
  assert.match(deliveryContainer.innerHTML, /123 RSD/);
  assert.match(deliveryContainer.innerHTML, /炒饭/);
});

test('assignRider does not flush deferred order refresh before debug alerts are emitted', async () => {
  const alertMessages: string[] = [];
  let refreshCount = 0;
  globalThis.alert = ((message?: string) => {
    alertMessages.push(String(message || ''));
  }) as typeof alert;
  globalThis.window = {
    showToast() {},
    refreshOrderList() {
      refreshCount++;
    },
    __adminAssignInFlight: false,
    __adminPendingOrderRefresh: false,
  } as any;

  globalThis.fetch = async () => {
    globalThis.window.__adminPendingOrderRefresh = true;
    return new Response(JSON.stringify({
      success: true,
      telegram_notification: {
        success: true,
        chatId: 'tg-7',
        chatIdSource: 'request',
        shopSlug: 'demo-shop',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await orders.assignRider('470', '7', {
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 15,
    riderTelegramChatId: 'tg-7',
    debugTelegram: true,
  });

  assert.deepEqual(alertMessages, [
    '派单调试: 已进入 assignRider，准备请求 /api/admin/rider-assign',
    '派单调试: /api/admin/rider-assign 已返回 200',
    '派单调试: /api/admin/rider-assign 响应 {"success":true,"telegram_notification":{"success":true,"chatId":"tg-7","chatIdSource":"request","shopSlug":"demo-shop"}}',
    '派单Telegram: success chat=tg-7 source=request shop=demo-shop',
  ]);
  assert.equal(refreshCount, 1);
});

test('orders source keeps assign APIs and removes broadcast helper', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/orders.ts'), 'utf8');

  assert.match(source, /import \{ buildContactableRiderRows \} from '\.\.\/\.\.\/lib\/rider-dispatch\.ts';/);
  assert.match(source, /export async function fetchAvailableRiders\(\)/);
  assert.match(source, /export async function assignRider\(/);
  assert.match(source, /export async function autoAssignRider\(/);
  assert.doesNotMatch(source, /export async function broadcastRiderDispatch\(/);

  assert.doesNotMatch(source, /fetch\('\/api\/admin\/rider-dispatch'/);
  assert.doesNotMatch(source, /lastAssignedRiderId/);
  assert.doesNotMatch(source, /publishRiderDispatch\s*\(/);
  assert.doesNotMatch(source, /remindRiders\s*\(/);
});

test('admin orders page reuses shared helper for active delivery filter', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro'), 'utf8');

  assert.match(source, /import\s+\{[^}]*isAdminActiveDeliveryStatus[^}]*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/lib\/rider-dispatch\.ts['"]/);
  assert.match(source, /const activeDeliveryOrders = orders\.filter\([\s\S]*isAdminActiveDeliveryStatus\(o\.status\)[\s\S]*o\.isDeleted !== 1/);
  assert.doesNotMatch(source, /o\.status === 'pending' \|\| o\.status === 'confirmed' \|\| o\.status === 'awaiting_courier' \|\| o\.status === 'delivering' \|\| o\.status === 'picked_up' \|\| o\.status === 'completed'/);
});

test('order-actions source uses canonical dispatch and courier fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/order-actions.ts'), 'utf8');

  assert.doesNotMatch(source, /getReminderCountFromDataset\(/);
  assert.doesNotMatch(source, /remindRiders\(/);
  assert.match(source, /payload\.courierName = driverInfo\.name;/);
  assert.match(source, /payload\.courierPhone = driverInfo\.phone;/);
  assert.match(source, /registerAdminGlobal\('assign-rider'/);
  assert.match(source, /registerAdminGlobal\('auto-assign-rider'/);

  assert.doesNotMatch(source, /openDeliveryModal/);
  assert.doesNotMatch(source, /closeDeliveryModal/);
  assert.doesNotMatch(source, /confirmDelivery/);
  assert.doesNotMatch(source, /publishRiderDispatch/);
  assert.doesNotMatch(source, /rider_remind_count/);
  assert.doesNotMatch(source, /courier_name/);
  assert.doesNotMatch(source, /courier_phone/);
});

test('admin orders api source uses canonical itemsJson repair fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/api/admin/orders.ts'), 'utf8');

  assert.match(source, /待后端稳定输出订单 itemsJson 后删除/);
  assert.match(source, /if \(!order \|\| typeof order\.itemsJson !== 'string'\) return order;/);
  assert.match(source, /const parsed = JSON\.parse\(order\.itemsJson\);/);
  assert.match(source, /return \{ \.\.\.order, itemsJson: JSON\.stringify\(arr\) \};/);

  assert.doesNotMatch(source, /items_json/);
});

test('admin orders api source uses proxy admin request instead of raw upstream fetch', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/api/admin/orders.ts'), 'utf8');

  assert.match(source, /import \{ proxyAdminRequest \} from '\.\.\/\.\.\/\.\.\/lib\/admin-api-route';/);
  assert.match(source, /const res = await proxyAdminRequest\(\{/);
  assert.match(source, /request,/);
  assert.match(source, /cookies,/);
  assert.match(source, /url: `\$\{API_BASE_URL\}\/api\/admin\/orders\$\{q\}`,/);
  assert.doesNotMatch(source, /buildAdminAuthHeader/);
  assert.doesNotMatch(source, /await fetch\(`\$\{API_BASE_URL\}\/api\/admin\/orders\$\{q\}`/);
});

test('billing ui source uses canonical order record fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/billing-ui.ts'), 'utf8');

  assert.match(source, /const orderNo = String\(r\.orderNo \|\| ''\);/);
  assert.match(source, /const orderLabel = orderDisplay \? `#\$\{orderDisplay\}` : '-';/);
  assert.match(source, /const totalAmount = Number\.isFinite\(Number\(r\.totalAmount\)\) \? String\(r\.totalAmount\) : '-';/);
  assert.match(source, /const commissionAmount = Number\.isFinite\(Number\(r\.commissionAmount\)\) \? `-\$\{r\.commissionAmount\}` : '-';/);
  assert.match(source, /const balanceAfter = Number\.isFinite\(Number\(r\.balanceAfter\)\) \? String\(r\.balanceAfter\) : '-';/);
  assert.match(source, /createCell\('td', orderLabel,/);
  assert.match(source, /const createdAt = new Date\(r\.createdAt\);/);
  assert.match(source, /const date = Number\.isNaN\(createdAt\.getTime\(\)\) \? '--' : createdAt\.toLocaleString\('sr-RS'/);

  assert.doesNotMatch(source, /createCell\('td', `#\$\{orderDisplay\}`,/);
  assert.doesNotMatch(source, /createCell\('td', `-\$\{r\.commissionAmount\}`,/);
  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /total_amount/);
  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /commission_amount/);
  assert.doesNotMatch(source, /balance_after/);
});

test('settings ui source uses canonical rider telegram and settings payload fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/settings-ui.ts'), 'utf8');

  assert.match(source, /contact: \{\s*mapUrl: mapUrlNode\?\.value \|\| '',\s*\},/m);
  assert.match(source, /mqttSecret: mqttSecretNode\?\.value \|\| '',/);
  assert.match(source, /wechatQr: wechatNode\?\.value \|\| '',/);
  assert.match(source, /menuTextMode: menuTextModeNode\?\.checked === true,/);
  assert.match(source, /chatId: chatIdNode\?\.value \|\| '',/);
  assert.match(source, /deliveryType: String\(deliveryTypeNode\?\.value \|\| 'merchant'\) === 'platform' \? 'platform' : 'merchant',/);
  assert.match(source, /freeThreshold: Number\(freeThresholdNode\?\.value \|\| 0\),/);
  assert.match(source, /type RiderInfo = \{ name\?: string; phone\?: string; status\?: string; telegramChatId\?: string \};/);
  assert.match(source, /telegramChatId: typeof rider\.telegramChatId === 'string' \? rider\.telegramChatId : undefined,/);
  assert.match(source, /const eligibleCount = riders\.filter\(\(rider\) => String\(rider\?\.telegramChatId \|\| ''\)\.trim\(\) !== ''\)\.length;/);
  assert.match(source, /const tgBound = String\(rider\?\.telegramChatId \|\| ''\)\.trim\(\) !== '';/);

  assert.doesNotMatch(source, /map_url:/);
  assert.doesNotMatch(source, /mqtt_secret/);
  assert.doesNotMatch(source, /menu_text_mode/);
  assert.doesNotMatch(source, /chat_id:/);
  assert.doesNotMatch(source, /delivery_type:/);
  assert.doesNotMatch(source, /free_threshold:/);
  assert.doesNotMatch(source, /telegram_chat_id:/);
});

test('admin page source injects merged admin settings into runtime scripts', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro'), 'utf8');

  assert.match(source, /<AdminScripts[\s\S]*settings=\{mergedAdminSettings\}/);
  assert.doesNotMatch(source, /<AdminScripts[\s\S]*settings=\{settings\}/);
});

test('admin page source loads protected master settings instead of public home settings', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro'), 'utf8');

  assert.match(source, /async function loadProtectedMasterSettings\(\)/);
  assert.match(source, /const adminSettingsUrl = new URL\('\/api\/admin\/settings\/master', Astro\.url\);/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /'success' in adminMasterRaw/);
  assert.match(source, /\.success === true/);
  assert.match(source, /adminMasterRaw as \{ data\?: unknown; settings\?: unknown \}/);
  assert.match(source, /const resolvedAdminSettings = asObject\(adminMasterData\.settings \|\| adminMasterData\);/);
  assert.match(source, /resolvedAdminSettings\.__adminSettingsDebug = \{/);
  assert.match(source, /const adminMethod = 'POST';/);
  assert.match(source, /return resolvedAdminSettings;/);
  assert.match(source, /const masterSettingsDiagnostics = \{/);
  assert.match(source, /adminMethod:/);
  assert.match(source, /adminResponsePreview:/);
  assert.match(source, /mergedAdminSettings\.__debugMasterSettings = masterSettingsDiagnostics;/);
  assert.match(source, /const \[statusResp, shopResp, menuResp, ordersResp, billingResp, homeResp, masterSettings\] = await Promise\.all\([\s\S]*loadProtectedMasterSettings\(\),[\s\S]*\]\);/);
  assert.doesNotMatch(source, /fetch\(new URL\('\/api\/master\/init', Astro\.url\), \{/);
  assert.doesNotMatch(source, /method: 'GET'[\s\S]*\/api\/admin\/settings\/master/);
  assert.doesNotMatch(source, /const masterSettings = asObject\(homeData\?\.settings \|\| \{\}\);/);
});

test('admin page source does not turn failed orders fetch into fake empty delivery list', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro'), 'utf8');
  const tablesSource = await readFile(resolve(process.cwd(), 'src/components/admin/TabTables.astro'), 'utf8');

  assert.match(source, /const ordersApiUrl = new URL\(`\/api\/admin\/orders\?_\=\$\{Date\.now\(\)\}`, Astro\.url\);/);
  assert.match(source, /const ordersLoadFailed = !ordersResp\.ok \|\| !Array\.isArray\(ordersResp\.data\);/);
  assert.match(source, /const rawOrders = Array\.isArray\(ordersResp\.data\) \? ordersResp\.data : \[\];/);
  assert.match(source, /const ordersLoadErrorDetail = String\(ordersResp\.errorDetail \|\| ordersResp\.error \|\| ordersResp\.code \|\| ordersResp\.status \|\| ''\)\.trim\(\);/);
  assert.match(source, /fetchJSON\(ordersApiUrl, \{ headers: authHeaders \}\)/);
  assert.match(source, /<TabTables[\s\S]*adminOrdersUnavailable=\{ordersLoadFailed\}[\s\S]*adminOrdersErrorDetail=\{ordersLoadErrorDetail\}/);
  assert.match(tablesSource, /adminOrdersUnavailable = false,/);
  assert.match(tablesSource, /adminOrdersErrorDetail = '',/);
  assert.match(tablesSource, /\{adminOrdersUnavailable \? \(/);
  assert.match(tablesSource, /外卖订单加载失败，请刷新重试/);
  assert.match(tablesSource, /\{adminOrdersErrorDetail && \(/);
  assert.match(tablesSource, /订单接口诊断：\{adminOrdersErrorDetail\}/);
  assert.doesNotMatch(tablesSource, /\{activeDeliveryOrders\.length === 0 \? \(/);
});

test('table management source uses canonical order fields and shared active dine-in status helper', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/table-management.ts'), 'utf8');

  assert.match(source, /import\s+\{\s*isActiveDineInOrder\s*\}\s+from\s+['"].*admin-dashboard-utils/);
  assert.match(source, /orderNo: el\.dataset\.orderNo,/);
  assert.match(source, /createTextElement\('span', ` \(#\$\{order\.orderNo\}\)`,/);
  assert.match(source, /createTextElement\('span', `订单 #\$\{order\.orderNo\}`,/);
  assert.match(source, /\.map\(\(i: any\) => `\$\{i\.name\} /);
  assert.match(source, /i\.subName \? '\('/);
  assert.match(source, /x\$\{i\.quantity\}`\)/);
  assert.match(source, /if \(!isActiveDineInOrder\(\{ orderType: 'dine_in', status \}\)\) return;/);

  assert.doesNotMatch(source, /status === "completed" \|\|/);
  assert.doesNotMatch(source, /status === "cancelled" \|\|/);
  assert.doesNotMatch(source, /status === "archived"/);
  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /sub_name/);
});

test('user chat source uses canonical chat and order fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/user-chat.ts'), 'utf8');

  assert.match(source, /ts\.textContent = new Date\(message\?\.createdAt\)\.toLocaleString\('zh-CN'\);/);
  assert.match(source, /buildConversationList\(unique\.map\(\(phone\) => \(\{ senderPhone: phone, createdAt: '', message: '' \}\)\), unreadByPhone\)/);
  assert.match(source, /latestOrder \? `#\$\{latestOrder\.orderNo\}` : '暂无外卖订单 \/ Nema porudzbine'/);
  assert.match(source, /Number\(latestOrder\.totalAmount \|\| 0\)\.toLocaleString\(\)}/);
  assert.match(source, /cleanAddress\(latestOrder\.tableInfo\)/);
  assert.match(source, /no\.textContent = `#\$\{order\.orderNo \|\| '-'\}`;/);
  assert.match(source, /Number\(order\.totalAmount \|\| 0\)\.toLocaleString\(\)/);
  assert.match(source, /cleanAddress\(order\.tableInfo\)/);
  assert.match(source, /Number\(payload\.shopId \|\| 0\) !== Number\(shopId\)/);
  assert.match(source, /const phone = String\(payload\.senderPhone \|\| ''\)\.trim\(\);/);
  assert.match(source, /fetch\(`\/api\/user\/chat\?userPhone=\$\{encodeURIComponent\(userPhone\)\}`\)/);
  assert.match(source, /if \(res\.status === 401 \|\| res\.status === 403\) \{/);
  assert.match(source, /if \(!res\.ok\) return \{ success: false, error: 'request_failed' \};/);
  assert.match(source, /body: JSON\.stringify\(\{ userPhone: userPhone, message: message \}\)/);
  assert.match(source, /fetch\(`\/api\/admin\/chat\?senderPhone=\$\{encodeURIComponent\(currentChatUserPhone\)\}`\)/);
  assert.match(source, /const res = await fetch\('\/api\/admin\/chat'\);/);
  assert.match(source, /if \(res\.status === 401 \|\| res\.status === 403\) \{/);
  assert.match(source, /if \(!res\.ok\) \{/);
  assert.match(source, /const res = await fetch\(`\/api\/admin\/chat\?senderPhone=\$\{encodeURIComponent\(currentChatUserPhone\)\}`\);/);
  assert.match(source, /body: JSON\.stringify\(\{ senderPhone: currentChatUserPhone, message: message \}\)/);
  assert.match(source, /if \(res\.status === 401 \|\| res\.status === 403\) \{/);
  assert.match(source, /if \(!res\.ok\) \{/);
  assert.match(source, /Number\(payload\?\.shopId \|\| 0\) !== Number\(shopId\)/);
  assert.match(source, /const phone = String\(payload\?\.senderPhone \|\| ''\)\.trim\(\);/);
  assert.match(source, /String\(summary\.latestReservation\.reservationTime \|\| '有预约'\)/);

  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /sender_phone/);
  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /total_amount/);
  assert.doesNotMatch(source, /table_info/);
  assert.doesNotMatch(source, /shop_id/);
  assert.doesNotMatch(source, /user_phone/);
  assert.doesNotMatch(source, /reservation_time/);
});

test('mqtt audio source uses canonical realtime payload fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/mqtt-audio.ts'), 'utf8');

  assert.match(source, /Expected shape: \{ shopId, senderRole, senderPhone, message, createdAt \}/);
  assert.match(source, /const maybePhone = String\(payload\?\.senderPhone \|\| ''\)\.trim\(\);/);
  assert.match(source, /const maybeRole = String\(payload\?\.senderRole \|\| ''\)\.trim\(\);/);
  assert.match(source, /const maybeShop = Number\(payload\?\.shopId \|\| 0\);/);
  assert.match(source, /const orderType = String\(payload\?\.orderType \|\| payload\?\.order_type \|\| ''\)\.trim\(\);/);
  assert.match(source, /playAudio\(payload\.status, orderType\);/);

  assert.doesNotMatch(source, /shop_id/);
  assert.doesNotMatch(source, /sender_role/);
  assert.doesNotMatch(source, /sender_phone/);
  assert.doesNotMatch(source, /created_at/);
});

test('order edit ui source uses canonical order edit payload fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/order-edit-ui.ts'), 'utf8');

  assert.match(source, /body: JSON\.stringify\(\{ itemsJson: JSON\.stringify\(itemsArray\), totalAmount: newTotal \}\),/);

  assert.doesNotMatch(source, /items_json/);
  assert.doesNotMatch(source, /total_amount/);
});

test('reservations source uses canonical reservation order fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/reservations.ts'), 'utf8');

  assert.match(source, /const parsed = JSON\.parse\(item\.itemsJson \|\| '\[\]'\);/);
  assert.match(source, /span\.dataset\.items = item\.itemsJson \|\| '\[\]';/);
  assert.match(source, /span\.dataset\.total = String\(item\.totalAmount \|\| 0\);/);
  assert.match(source, /body: JSON\.stringify\(\{ id: Number\(resId\), action: 'checkin', tableInfo: tableName \}\)/);

  assert.doesNotMatch(source, /items_json/);
  assert.doesNotMatch(source, /total_amount/);
  assert.doesNotMatch(source, /table_info/);
});

test('table utils source uses canonical order fields and shared active dine-in status helper', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/table-utils.ts'), 'utf8');

  assert.match(source, /import\s+\{\s*isActiveDineInOrder\s*\}\s+from\s+['"].*admin-dashboard-utils/);
  assert.match(source, /id: el\.dataset\.oid, orderNo: el\.dataset\.orderNo, amount: el\.dataset\.total,/);
  assert.match(source, /if \(!isActiveDineInOrder\(\{ orderType: 'dine_in', status \}\)\) return;/);

  assert.doesNotMatch(source, /status === "completed" \|\| status === "cancelled" \|\| status === "archived"/);
  assert.doesNotMatch(source, /order_no/);
});

test('cart modal source reuses shared buyer active status helper for ended order cleanup', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/components/CartModal.tsx'), 'utf8');

  assert.match(source, /import\s+\{\s*isCustomerActiveStatus\s*\}\s+from\s+['"].*rider-dispatch/);
  assert.match(source, /if \(data\.status === "cancelled"\) \{/);
  assert.match(source, /else if \(!isCustomerActiveStatus\(data\.status\)\) \{/);
  assert.match(source, /localStorage\.removeItem\("last_order_id"\);/);

  assert.doesNotMatch(source, /data\.status === "completed" \|\|/);
  assert.doesNotMatch(source, /data\.status === "archived" \|\|/);
  assert.doesNotMatch(source, /data\.status === "paid"/);
});

test('tab orders source uses canonical item fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/components/admin/TabOrders.astro'), 'utf8');

  assert.match(source, /<span class="item-subname">\{i\.subName\}<\/span>/);
  assert.doesNotMatch(source, /sub_name/);
});

test('tab tables source uses canonical order surface fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/components/admin/TabTables.astro'), 'utf8');

  assert.match(source, /const pickupNo = String\(o\.orderNo \|\| o\.id \|\| ''\)\.slice\(-3\);/);
  assert.match(source, /桌号: \{formatUnmatchedTableLabel\(o\.tableInfo\)\}/);
  assert.match(source, /\{formatBelgradeHHmm\(o\.createdAt\)\}/);
  assert.match(source, /\{o\.totalAmount\} RSD/);
  assert.match(source, /const orderNo = String\(o\.orderNo \|\| o\.id \|\| ''\);/);
  assert.match(source, /const oTime = new Date\(o\.createdAt\)\.getTime\(\);/);
  assert.match(source, /const deliveryItems = parseItems\(o\.itemsJson\);/);
  assert.match(source, /📍 \{o\.tableInfo\}/);
  assert.match(source, /\(Tel: \{o\.userPhone \|\| '-'\}\)/);
  assert.match(source, /\{formatScheduledLabel\(o\.scheduledFor\)\}/);
  assert.match(source, /\(i\.subName\) && <span style="color:#666; font-size:12px; margin-left:4px;">\(\{i\.subName\}\)<\/span>/);
  assert.match(source, /\{o\.totalAmount\} RSD/);
  assert.match(source, /data-order-no=\{o\.orderNo\} data-items=\{o\.itemsJson\} data-total=\{o\.totalAmount\} data-table=\{o\.tableInfo\} data-status=\{o\.status\}/);
  assert.match(source, /data-user-phone=\{o\.userPhone\}/);
  assert.match(source, /data-rider-broadcasted-at=\{o\.riderBroadcastedAt\}/);
  assert.match(source, /data-rider-remind-count=\{o\.riderRemindCount\}/);
  assert.match(source, /<button class="btn-xs" type="button" data-admin-action="assign-rider"/);
  assert.match(source, /<button class="btn-xs" type="button" data-admin-action="auto-assign-rider"/);

  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /table_info/);
  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /total_amount/);
  assert.doesNotMatch(source, /items_json/);
  assert.doesNotMatch(source, /user_phone/);
  assert.doesNotMatch(source, /scheduled_for/);
});

test('tab menu source uses canonical category and product fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/components/admin/TabMenu.astro'), 'utf8');

  assert.match(source, /\{cat\.name\} <small>\(\{cat\.subName\}\)<\/small>/);
  assert.match(source, /data-product-count=\{products\.filter\(\(p: any\) => p\.categoryId === cat\.id\)\.length\}/);
  assert.match(source, /products\.filter\(\(p: any\) => p\.categoryId === cat\.id\)\.sort\(\(a: any, b: any\) => \(a\.sortOrder\|\|0\) - \(b\.sortOrder\|\|0\)\)/);
  assert.match(source, /<div class="p-sub">\{p\.subName\}<\/div>/);
  assert.match(source, /➕ 添加新菜品到 "\{cat\.subName\}"/);

  assert.doesNotMatch(source, /sub_name/);
  assert.doesNotMatch(source, /category_id/);
  assert.doesNotMatch(source, /sort_order/);
});

test('admin modals source uses canonical category fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/components/admin/AdminModals.astro'), 'utf8');

  assert.match(source, /\{categories && categories\.map\(\(c: any\) => <option value=\{c\.id\}>\{c\.name\} \(\{c\.subName\}\)<\/option>\)\}/);

  assert.doesNotMatch(source, /id="delivery-modal"/);
  assert.doesNotMatch(source, /data-admin-action="confirm-delivery"/);
  assert.doesNotMatch(source, /data-admin-action="close-delivery-modal"/);
  assert.doesNotMatch(source, /sub_name/);
});

test('admin data source uses canonical category and product fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/data.ts'), 'utf8');

  assert.match(source, /body: JSON\.stringify\(\{ name, subName: subName \|\| name \}\),/);
  assert.match(source, /subName: String\(c\?\.subName \|\| ""\),/);
  assert.match(source, /categoryId: Number\(p\?\.categoryId \|\| c\?\.id \|\| 0\),/);
  assert.match(source, /\.filter\(\(p: any\) => Number\(p\?\.categoryId \|\| 0\) === Number\(cat\?\.id \|\| 0\)\)/);
  assert.match(source, /subName: String\(p\?\.subName \|\| ""\),/);
  assert.match(source, /categorySub: String\(cat\?\.subName \|\| ""\),/);
  assert.match(source, /const subName = String\(c\?\.categorySub \|\| ""\)\.trim\(\) \|\| name;/);
  assert.match(source, /subName: String\(item\?\.subName \|\| ""\)\.trim\(\) \|\| productName,/);
  assert.match(source, /isAvailable: Number\(item\?\.isAvailable \?\? 1\),/);
  assert.match(source, /categoryId: categoryId,/);

  assert.doesNotMatch(source, /sub_name/);
  assert.doesNotMatch(source, /category_id/);
  assert.doesNotMatch(source, /category_sub/);
  assert.doesNotMatch(source, /is_available/);
});

test('admin reservations source uses canonical reservation fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/reservations.ts'), 'utf8');

  assert.match(source, /title\.textContent = `\$\{item\.customerName \|\| '客人'\} \(\$\{item\.guestCount\}人\)`;/);
  assert.match(source, /time\.textContent = `📅 预约时间: \$\{item\.reservationTime\}`;/);
  assert.match(source, /phone\.textContent = `📞 联系电话: \$\{item\.customerPhone\}`;/);

  assert.doesNotMatch(source, /customer_name/);
  assert.doesNotMatch(source, /guest_count/);
  assert.doesNotMatch(source, /reservation_time/);
  assert.doesNotMatch(source, /customer_phone/);
});

test('tab settings source uses canonical telegram and settings fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/components/admin/TabSettings.astro'), 'utf8');

  assert.match(source, /value=\{settings\?\.contact\?\.mapUrl \|\| settings\?\.mapUrl \|\| shop\?\.contact\?\.mapUrl \|\| shop\.mapUrl \|\| ''\}/);
  assert.match(source, /value=\{settings\.currency\?\.wechatQr \|\| ''\}/);
  assert.match(source, /checked=\{settings\.menuTextMode \|\| false\}/);
  assert.match(source, /restaurant\/\{shop\?\.slug \|\| 'default'\}\/\{settings\?\.mqttSecret \|\| shop\?\.mqttSecret \|\| 'default'\}\/order/);
  assert.match(source, /id="mqttSecretInput" value=\{settings\?\.mqttSecret \|\| shop\?\.mqttSecret \|\| ''\}/);
  assert.match(source, /checked=\{settings\.printOnCheckout \|\| false\}/);
  assert.match(source, /value=\{settings\.telegram\?\.chatId \|\| shop\.telegramChatId \|\| ''\}/);
  assert.match(source, /selected=\{!\(settings\?\.deliveryType \|\| shop\.deliveryType\) \|\| \(settings\?\.deliveryType \|\| shop\.deliveryType\) === 'merchant'\}/);
  assert.match(source, /selected=\{\(settings\?\.deliveryType \|\| shop\.deliveryType\) === 'platform'\}/);
  assert.match(source, /value=\{settings\.delivery\?\.fee \|\| shop\.deliveryFee \|\| ''\}/);
  assert.match(source, /value=\{settings\.delivery\?\.freeThreshold \|\| shop\.freeThreshold \|\| ''\}/);

  assert.doesNotMatch(source, /telegram_chat_id/);
  assert.doesNotMatch(source, /delivery_type/);
  assert.doesNotMatch(source, /delivery_fee/);
  assert.doesNotMatch(source, /map_url \|\|/);
  assert.doesNotMatch(source, /wechat_qr \|\|/);
  assert.doesNotMatch(source, /menu_text_mode \|\|/);
  assert.doesNotMatch(source, /mqtt_secret \|\|/);
  assert.doesNotMatch(source, /print_on_checkout \|\|/);
});

test('admin page source injects merged admin settings into runtime scripts', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro'), 'utf8');

  assert.match(source, /const mergedAdminSettings = \{[\s\S]*telegram: \{[\s\S]*\.\.\.asObject\(masterSettings\.telegram\)[\s\S]*\.\.\.asObject\(settings\.telegram\)[\s\S]*\}[\s\S]*server: \{[\s\S]*\.\.\.asObject\(masterSettings\.server\)[\s\S]*\.\.\.asObject\(settings\.server\)[\s\S]*\}[\s\S]*\};/);
  assert.match(source, /<AdminScripts[\s\S]*settings=\{mergedAdminSettings\}/);
  assert.doesNotMatch(source, /<AdminScripts[\s\S]*settings=\{settings\}/);
});

test('settings payload source uses canonical settings fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/settings-payload.ts'), 'utf8');

  assert.match(source, /mqttSecret: String\(options\.mqttSecret \|\| ''\)\.trim\(\),/);
  assert.match(source, /menuTextMode: options\.menuTextMode === true,/);
  assert.match(source, /wechatQr: String\(options\.wechatQr \|\| ''\)\.trim\(\),/);
  assert.match(source, /mapUrl: String\(options\.mapUrl \|\| ''\)\.trim\(\),/);
  assert.match(source, /chatId: String\(options\.telegramChatId \|\| ''\)\.trim\(\),/);
  assert.match(source, /closedDates: formData\.get\('closed_dates'\),/);
  assert.match(source, /deliveryType: deliveryType,/);
  assert.match(source, /freeThreshold: toNumber\(formData\.get\('freeThreshold'\)\),/);
  assert.match(source, /printOnCheckout: formData\.get\('print_on_checkout'\) === 'on',/);

  assert.doesNotMatch(source, /mqtt_secret/);
  assert.doesNotMatch(source, /menu_text_mode/);
  assert.doesNotMatch(source, /wechat_qr/);
  assert.doesNotMatch(source, /map_url/);
  assert.doesNotMatch(source, /chat_id/);
  assert.doesNotMatch(source, /delivery_type/);
  assert.doesNotMatch(source, /free_threshold/);
});

test('table config payload source uses backend table config field', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/table-config-payload.ts'), 'utf8');

  assert.match(source, /return \{\s*table_config: \{/m);
  assert.doesNotMatch(source, /tableConfig/);
});

test('products source uses canonical category and subname fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/products.ts'), 'utf8');

  assert.match(source, /subName: \(document\.getElementById\("edit-sub"\) as HTMLInputElement\)\.value,/);
  assert.match(source, /categoryId: parseInt\(\(document\.getElementById\("edit-cat"\) as HTMLSelectElement\)\.value, 10\)/);
  assert.match(source, /shopId: Number\.parseInt\(String\(shopId \|\| '0'\), 10\) \|\| 0,/);
  assert.match(source, /categoryId: cid,/);
  assert.match(source, /subName: sub,/);
  assert.match(source, /body: JSON\.stringify\(\{ direction, categoryId: cid \}\),/);
  assert.match(source, /const subName = prompt\('新分类名称 \(中文\)'\) \|\| '';/);
  assert.match(source, /const finalSub = String\(subName\)\.trim\(\) \|\| name;/);
  assert.match(source, /body: JSON\.stringify\(\{ name, subName: finalSub \}\),/);

  assert.doesNotMatch(source, /sub_name/);
  assert.doesNotMatch(source, /category_id/);
  assert.doesNotMatch(source, /shop_id/);
});

test('click delegation source uses canonical admin payload fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/click-delegation.ts'), 'utf8');

  assert.match(source, /body: JSON\.stringify\(\{ newPassword: newPassword \}\),/);
  assert.match(source, /const payload = \{ name, subName: sub \|\| name \};/);
  assert.match(source, /else if \(action === 'assign-rider' \|\| action === 'auto-assign-rider'\) \{/);
  assert.match(source, /await invokeAdminAction\(getAdminHandlers\(\), action, el, e\);/);

  assert.doesNotMatch(source, /open-delivery/);
  assert.doesNotMatch(source, /confirm-delivery/);
  assert.doesNotMatch(source, /close-delivery-modal/);
  assert.doesNotMatch(source, /openDeliveryModal/);
  assert.doesNotMatch(source, /closeDeliveryModal/);
  assert.doesNotMatch(source, /confirmDelivery/);
  assert.doesNotMatch(source, /sub_name/);
});

test('tab marketing source uses canonical promotion and points fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/components/admin/TabMarketing.astro'), 'utf8');

  assert.match(source, /const pointsPerSpend = pointsSettings\.pointsPerSpend \|\| 20;/);
  assert.match(source, /const pointsValue = pointsSettings\.pointsValue \|\| 1;/);
  assert.match(source, /subName: String\(p\.subName \|\| ''\),/);
  assert.match(source, /displayNameSecondary: String\(p\.subName \|\| ''\),/);
  assert.match(source, /return Number\(value\.id \|\| value\.productId \|\| value\.value \|\| 0\);/);
  assert.match(source, /return safePromotion\.startsAt \|\| safePromotion\.startAt \|\| safePromotion\.startTime \|\| '';/);
  assert.match(source, /return safePromotion\.endsAt \|\| safePromotion\.endAt \|\| safePromotion\.endTime \|\| '';/);
  assert.match(source, /if \(p\.promoType === 'spend_discount'\) \{/);
  assert.match(source, /return `满 \$\{p\.minSpendRsd \|\| 0\} RSD 减 \$\{p\.discountAmountRsd \|\| 0\} RSD \$\{p\.stackable \? '\(可叠加\)' : ''\}`;/);
  assert.match(source, /const ids = parsePromotionProductIds\(p\.selectedProducts\);/);
  assert.match(source, /return `今日特价: \$\{productNames\} → \$\{p\.specialPriceRsd \|\| 0\} RSD\$\{timeText\}`;/);
  assert.match(source, /promoType: document\.getElementById\('promotion-type'\)\.value,/);
  assert.match(source, /payload\.minSpendRsd = parseInt\(document\.getElementById\('promotion-min-spend'\)\.value\) \|\| 0;/);
  assert.match(source, /payload\.discountAmountRsd = parseInt\(document\.getElementById\('promotion-discount'\)\.value\) \|\| 0;/);
  assert.match(source, /payload\.selectedProducts = getSelectedProductIds\(\);/);
  assert.match(source, /payload\.specialPriceRsd = parseInt\(document\.getElementById\('promotion-special-price'\)\.value\) \|\| 0;/);
  assert.match(source, /payload\.startsAt = startVal;/);
  assert.match(source, /payload\.endsAt = endVal;/);
  assert.match(source, /pointsPerSpend: pointsPerSpend,/);
  assert.match(source, /pointsValue: pointsValue/);

  assert.doesNotMatch(source, /points_per_spend/);
  assert.doesNotMatch(source, /points_value/);
  assert.doesNotMatch(source, /sub_name/);
  assert.doesNotMatch(source, /product_id/);
  assert.doesNotMatch(source, /starts_at/);
  assert.doesNotMatch(source, /start_at/);
  assert.doesNotMatch(source, /start_time/);
  assert.doesNotMatch(source, /ends_at/);
  assert.doesNotMatch(source, /end_at/);
  assert.doesNotMatch(source, /end_time/);
  assert.doesNotMatch(source, /promo_type/);
  assert.doesNotMatch(source, /min_spend_rsd/);
  assert.doesNotMatch(source, /discount_amount_rsd/);
  assert.doesNotMatch(source, /selected_products/);
  assert.doesNotMatch(source, /special_price_rsd/);
});
