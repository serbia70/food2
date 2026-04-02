import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/[slug]/index.astro');
const tableDetailsPath = resolve(process.cwd(), 'src/scripts/shop/table-details.ts');
const userChatPath = resolve(process.cwd(), 'src/components/UserChat.astro');
const adminPagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
const homePagePath = resolve(process.cwd(), 'src/pages/index.astro');

test('shop page source reads canonical shop and menu envelopes and normalizes both upload path variants', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const isOkShopEnvelope = shop && typeof shop === 'object' && 'ok' in shop && shop\.ok === true;/);
  assert.match(page, /const shopData = isOkShopEnvelope && 'data' in shop && shop\.data && typeof shop\.data === 'object' \? shop\.data : null;/);
  assert.match(page, /const parsedMenuData = parsed && typeof parsed === 'object' && 'ok' in parsed && parsed\.ok === true && 'data' in parsed \? parsed\.data : parsed;/);
  assert.match(page, /rawMenu = Array\.isArray\(parsedMenuData\) \? parsedMenuData : \[];/);
  assert.match(page, /if \(img\.startsWith\('\/uploads\/'\)\) return `\$\{API_BASE_URL\}\$\{img\}`;/);
  assert.match(page, /if \(img\.startsWith\('\/assets\/uploads\/'\)\) return `\$\{API_BASE_URL\}\$\{img\}`;/);
  assert.match(page, /img: normalizeMenuImageUrl\(p\?\.img \|\| p\?\.imageUrl\) \|\| '\/favicon\.svg',/);
  assert.match(page, /const menuLayout = settings\?\.menuLayout \|\| 'image-2col';/);
  assert.match(page, /const isMenuTextMode = settings\?\.menuTextMode === true \|\| menuLayout\.startsWith\('text'\);/);
  assert.match(page, /const footerPhone =\s*publicMasterSettings\.footer_phone \|\| publicMasterSettings\.footerPhone \|\| masterSettings\.footerPhone \|\| '000000000';/);
  assert.match(page, /const footerCopyright =\s*publicMasterSettings\.footer_copyright \|\| publicMasterSettings\.footerCopyright \|\| masterSettings\.footerCopyright \|\| '© Fast Food';/);
  assert.match(page, /const footerText =\s*publicMasterSettings\.footer_text \|\| publicMasterSettings\.footerText \|\| masterSettings\.footerText \|\| '订餐热线';/);
  assert.match(page, /subName: cat\?\.subName \|\| '',/);
  assert.match(page, /subName: p\?\.subName \|\| '',/);
  assert.match(page, /const mqttBroker = String\(settings\?\.mqttBroker \|\| masterSettings\?\.mqttBroker \|\| publicMasterSettings\?\.mqtt_broker \|\| 'mqtt\.serbia70\.com'\);/);
  assert.match(page, /const mqttSecret = String\(shop\?\.mqttSecret \|\| ''\);/);
  assert.match(page, /const reservationEnabled = Number\(shop\?\.reservationEnabled \?\? settings\?\.reservationEnabled \?\? 1\) !== 0;/);
  assert.match(page, /let isDeliveryLocked = Boolean\(shop\?\.deliveryLocked\);/);
  assert.match(page, /shop\?\.deliveryLockReason \|\|/);
  assert.match(page, /const parsedTableConfig = parseJSON<any>\(shop\?\.tableConfig, null\);/);
  assert.match(page, /tableConfig = normalizeZones\(settings\?\.tableConfig\);/);
  assert.match(page, /const total = active\.reduce\(\(sum: number, o: any\) => sum \+ Number\(o\?\.totalAmount \|\| 0\), 0\);/);
  assert.match(page, /const firstOrder = \[\.\.\.active\]\.sort\(\(a: any, b: any\) => parseDbTimeMs\(a\?\.createdAt\) - parseDbTimeMs\(b\?\.createdAt\)\)\[0\];/);
  assert.match(page, /const firstMs = parseDbTimeMs\(firstOrder\?\.createdAt\);/);
  assert.match(page, /const enableDelivery = Number\(shop\?\.enableDelivery \?\? 1\) !== 0;/);
  assert.match(page, /const enableDineIn = Number\(shop\?\.enableDineIn \?\? 1\) !== 0 && !dineInSubscriptionBlocked;/);

  assert.doesNotMatch(page, /rawMenu = Array\.isArray\(parsed\) \? parsed : \[];/);
  assert.match(page, /publicMasterSettings\.footer_phone/);
  assert.match(page, /publicMasterSettings\.footer_text/);
  assert.match(page, /publicMasterSettings\.footer_copyright/);
  assert.match(page, /publicMasterSettings\?\.mqtt_broker/);
  assert.doesNotMatch(page, /menu_layout/);
  assert.doesNotMatch(page, /menu_text_mode/);
  assert.doesNotMatch(page, /reservation_enabled/);
  assert.doesNotMatch(page, /enable_reservation/);
  assert.doesNotMatch(page, /subscription_enabled/);
  assert.doesNotMatch(page, /delivery_locked/);
  assert.doesNotMatch(page, /delivery_lock_reason/);
  assert.doesNotMatch(page, /table_config/);
  assert.doesNotMatch(page, /total_amount/);
  assert.doesNotMatch(page, /created_at/);
  assert.doesNotMatch(page, /enable_delivery/);
  assert.doesNotMatch(page, /enable_dine_in/);
});

test('shop table details source uses canonical order and item fields', async () => {
  const source = await readFile(tableDetailsPath, 'utf8');

  assert.match(source, /const raw = String\(\(o && o\.createdAt\) \|\| ''\)\.replace\(' ', 'T'\);/);
  assert.match(source, /const t = Number\.isNaN\(d\.getTime\(\)\) \? String\(\(o && o\.createdAt\) \|\| '--'\) : fmt\.format\(d\);/);
  assert.match(source, /const parsed = JSON\.parse\(String\(\(o && o\.itemsJson\) \|\| '\[\]'\)\);/);
  assert.match(source, /const n = String\(\(it && \(it\.name \|\| it\.productName\)\) \|\| ''\)\.trim\(\);/);
  assert.match(source, /const sub = String\(\(it && \(it\.subName\)\) \|\| ''\)\.trim\(\);/);
  assert.match(source, /const base = `\$\{idx \+ 1\}\. #\$\{\(o && \(o\.orderNo \|\| o\.id\)\) \|\| ''\} \| \$\{\(o && o\.totalAmount\) \|\| 0\} RSD \| \$\{t\}`;/);
  assert.match(source, /const total = active\.reduce\(\(sum, o\) => sum \+ Number\(\(o && o\.totalAmount\) \|\| 0\), 0\);/);

  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /items_json/);
  assert.doesNotMatch(source, /product_name/);
  assert.doesNotMatch(source, /sub_name/);
  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /total_amount/);
});

test('shop user chat source uses canonical realtime chat fields', async () => {
  const source = await readFile(userChatPath, 'utf8');

  assert.match(source, /const created = String\(p && p\.createdAt \? p\.createdAt : ''\)\.trim\(\);/);
  assert.match(source, /const role = String\(p && p\.senderRole \? p\.senderRole : ''\)\.trim\(\);/);
  assert.match(source, /const phone = String\(p && p\.senderPhone \? p\.senderPhone : ''\)\.trim\(\);/);
  assert.match(source, /if \(Number\(payload\.shopId \|\| 0\) !== Number\(shopId \|\| 0\)\) return;/);
  assert.match(source, /const role = String\(payload\.senderRole \|\| ''\)\.trim\(\);/);
  assert.match(source, /const isUser = String\(payload\.senderRole \|\| ''\) === 'user';/);
  assert.match(source, /const createdAt = payload\.createdAt \? new Date\(payload\.createdAt\) : new Date\(\);/);

  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /sender_role/);
  assert.doesNotMatch(source, /sender_phone/);
  assert.doesNotMatch(source, /shop_id/);
});

test('admin page source uses canonical shop contract fields', async () => {
  const source = await readFile(adminPagePath, 'utf8');

  assert.match(source, /const statusShopId = Number\(statusResp\.data\?\.shopId \|\| 0\);/);
  assert.match(source, /tableConfig:/);
  assert.match(source, /typeof rawShop\.tableConfig === 'string'/);
  assert.match(source, /JSON\.stringify\(rawShop\.tableConfig \|\| \{\}\),/);
  assert.match(source, /const dineInToggleLabel = Number\(shop\.enableDineIn \?\? 1\) !== 0 \? '堂食开关：开启' : '堂食开关：关闭';/);
  assert.match(source, /const billingPlanTier = String\(rawShop\?\.billingPlanType \|\| ''\)\.trim\(\);/);
  assert.match(source, /const hasTierMode = String\(rawShop\?\.shopTierMode \?\? ''\)\.trim\(\) !== '';/);
  assert.match(source, /const hasTierOverride = String\(rawShop\?\.shopTierOverride \?\? ''\)\.trim\(\) !== '';/);
  assert.match(source, /shopTierMode: hasTierMode \|\| hasTierOverride \? rawShop\?\.shopTierMode : billingPlanTier \? 'override' : rawShop\?\.shopTierMode,/);
  assert.match(source, /shopTierOverride: hasTierMode \|\| hasTierOverride \? rawShop\?\.shopTierOverride : billingPlanTier \|\| rawShop\?\.shopTierOverride,/);
  assert.match(source, /subName: String\(c\?\.subName \|\| ''\),/);
  assert.match(source, /sortOrder: Number\(c\?\.sortOrder \|\| 0\),/);
  assert.match(source, /categoryId: Number\(p\?\.categoryId \|\| c\?\.id \|\| 0\),/);
  assert.match(source, /sortOrder: Number\(p\?\.sortOrder \|\| 0\),/);
  assert.match(source, /subName: String\(p\?\.subName \|\| ''\),/);
  assert.match(source, /const lastMonthRevenue = Number\(billingData\.lastMonthRevenue \|\| 0\);/);
  assert.match(source, /const thisMonthRevenue = Number\(billingData\.thisMonthRevenue \|\| 0\);/);
  assert.match(source, /\.filter\(\(o: any\) => !orderMatchesAnyConfiguredTable\(o\.tableInfo, tableConfig\)\);/);
  assert.match(source, /o\.orderType === 'delivery' &&/);
  assert.match(source, /o\.isDeleted !== 1,/);
  assert.match(source, /const brokerIp = String\(settings\.mqttBroker \|\| masterSettings\.mqttBroker \|\| masterSettings\.mqtt_broker \|\| 'mqtt\.serbia70\.com'\);/);
  assert.match(source, /data-order-no=\{o\.orderNo\}/);
  assert.match(source, /data-items=\{o\.itemsJson\}/);
  assert.match(source, /data-total=\{o\.totalAmount\}/);
  assert.match(source, /data-table=\{o\.tableInfo\}/);
  assert.match(source, /data-remarks=\{o\.remarksJson\}/);

  assert.doesNotMatch(source, /shop_id/);
  assert.doesNotMatch(source, /table_config/);
  assert.doesNotMatch(source, /enable_dine_in/);
  assert.doesNotMatch(source, /billing_plan_type/);
  assert.doesNotMatch(source, /shop_tier_mode/);
  assert.doesNotMatch(source, /shop_tier_override/);
  assert.doesNotMatch(source, /sub_name/);
  assert.doesNotMatch(source, /sort_order/);
  assert.doesNotMatch(source, /category_id/);
  assert.doesNotMatch(source, /last_month_revenue/);
  assert.doesNotMatch(source, /this_month_revenue/);
});

test('menu route source uses shared proxy fetch retry chain and still shields upstream HTML failure pages', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/[slug]/menu.ts'), 'utf8');

  assert.match(source, /import \{ proxyFetch \} from '\.\.\/lib\/api-proxy\.ts';|import \{ proxyFetch \} from '\.\.\/\.\.\/lib\/api-proxy\.ts';/);
  assert.match(source, /const res = await proxyFetch\(`\$\{API_BASE_URL\}\/\$\{encodeURIComponent\(slug\)\}\/menu`, \{ method: 'GET' \}\);/);
  assert.match(source, /const contentType = res\.headers\.get\('content-type'\) \|\| 'application\/json';/);
  assert.match(source, /if \(!res\.ok && !contentType\.toLowerCase\(\)\.includes\('application\/json'\)\) \{/);
  assert.match(source, /return Response\.json\(\{\s*ok: false,\s*error: 'Menu backend unavailable',\s*code: 'menu_backend_unavailable',\s*items: \[],\s*\}, \{ status: res\.status \|\| 502 \}\);/s);
  assert.doesNotMatch(source, /const res = await fetch\(`\$\{API_BASE_URL\}\/\$\{encodeURIComponent\(slug\)\}\/menu`\);/);
});

test('home page source uses canonical shop list fields', async () => {
  const source = await readFile(homePagePath, 'utf8');

  assert.match(source, /deliveryType: 'merchant' \| 'platform';/);
  assert.match(source, /deliveryType: shopSettings\.deliveryType === 'platform' \? 'platform' : 'merchant',/);
  assert.match(source, /class=\{`delivery-tag \$\{shop\.deliveryType === 'platform' \? 'platform' : 'merchant'\}`\}/);
  assert.match(source, /\{shop\.deliveryType === 'platform' \? '平台' : '商家'\}/);

  assert.doesNotMatch(source, /delivery_type/);
});
