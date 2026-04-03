import test from 'node:test';
import assert from 'node:assert/strict';

import { assignRider, autoAssignRider } from './orders.ts';
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocation = globalThis.location;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.location = originalLocation;
});

test('assignRider posts manual_assign payload with eta', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.window = { showToast() {}, refreshOrderList() {} } as any;

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await assignRider('470', '7', { shopSlug: 'demo-shop', pickupEtaMinutes: 15 });

  assert.deepEqual(capturedBody, {
    action: 'manual_assign',
    orderId: '470',
    riderId: '7',
    shopSlug: 'demo-shop',
    pickupEtaMinutes: 15,
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

  await autoAssignRider('471', { shopSlug: 'demo-shop', pickupEtaMinutes: 20 });

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
    () => assignRider('470', '7', { shopSlug: 'demo-shop', pickupEtaMinutes: 15 }),
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
    () => autoAssignRider('471', { shopSlug: 'demo-shop', pickupEtaMinutes: 20 }),
    /telegram_chat_id_missing/,
  );
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
  assert.doesNotMatch(source, /telegram_chat_id/);
});

test('table management source uses canonical order fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/table-management.ts'), 'utf8');

  assert.match(source, /orderNo: el\.dataset\.orderNo,/);
  assert.match(source, /createTextElement\('span', ` \(#\$\{order\.orderNo\}\)`,/);
  assert.match(source, /createTextElement\('span', `订单 #\$\{order\.orderNo\}`,/);
  assert.match(source, /\.map\(\(i: any\) => `\$\{i\.name\} /);
  assert.match(source, /i\.subName \? '\('/);
  assert.match(source, /x\$\{i\.quantity\}`\)/);

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

test('table utils source uses canonical order fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/scripts/admin/table-utils.ts'), 'utf8');

  assert.match(source, /id: el\.dataset\.oid, orderNo: el\.dataset\.orderNo, amount: el\.dataset\.total,/);

  assert.doesNotMatch(source, /order_no/);
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
