import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/orders/index.astro');

test('orders page source uses canonical order contract fields', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const orderType = order && order\.orderType \? order\.orderType : '';/);
  assert.match(page, /const shopIdValue = order \? order\.shopId : null;/);
  assert.match(page, /const restaurantIdValue = order \? order\.restaurantId : null;/);
  assert.match(page, /latestOrderAt: String\(order && order\.createdAt \? order\.createdAt : ''\),/);
  assert.match(page, /const createdAt = order && order\.createdAt \? order\.createdAt : '';/);
  assert.match(page, /const items = typeof order\.itemsJson === 'string' \? JSON\.parse\(order\.itemsJson\) : order\.itemsJson;/);
  assert.match(page, /const subName = item && item\.subName \? item\.subName : '';/);
  assert.match(page, /const latestOrder = \[\.\.\.orders\]\.sort\(\(a, b\) => String\(b\.createdAt \|\| ''\)\.localeCompare\(String\(a\.createdAt \|\| ''\)\)\)\[0\];/);
  assert.match(page, /const latestCreatedAt = latestOrder && latestOrder\.createdAt \? latestOrder\.createdAt : '';/);
  assert.match(page, /const latestOrderNo = latestOrder && latestOrder\.orderNo \? latestOrder\.orderNo : '-';/);
  assert.match(page, /const timeText = order\.createdAt/);
  assert.match(page, /const pickupNo = String\(order\.orderNo \|\| order\.id \|\| ''\)\.slice\(-3\);/);
  assert.match(page, /const addressSummary = String\(order\.tableInfo \|\| ''\)/);
  assert.match(page, /chatLink\.href = `\/user\?openChat=1&from=orders&shopId=\$\{encodeURIComponent\(String\(order\.shopId \|\| ''\)\)\}&shop=\$\{encodeURIComponent\(view\.shopSlug \|\| ''\)\}&shopName=\$\{encodeURIComponent\(view\.shopName \|\| ''\)\}`;/);
  assert.match(page, /meta\.textContent = `#\$\{order\.orderNo \|\| order\.id \|\| '-'\} · 取餐号 \$\{pickupNo \|\| '-'\}`;/);
  assert.match(page, /amount\.textContent = `\$\{Number\(order\.totalAmount \|\| 0\)\.toLocaleString\(\)\} RSD`;/);

  assert.doesNotMatch(page, /order\.order_type/);
  assert.doesNotMatch(page, /order\.shop_id/);
  assert.doesNotMatch(page, /order\.restaurant_id/);
  assert.doesNotMatch(page, /order\.created_at/);
  assert.doesNotMatch(page, /order\.items_json/);
  assert.doesNotMatch(page, /item\.sub_name/);
  assert.doesNotMatch(page, /b\.created_at/);
  assert.doesNotMatch(page, /a\.created_at/);
  assert.doesNotMatch(page, /latestOrder\.created_at/);
  assert.doesNotMatch(page, /latestOrder\.order_no/);
  assert.doesNotMatch(page, /order\.order_no/);
  assert.doesNotMatch(page, /order\.table_info/);
  assert.doesNotMatch(page, /order\.total_amount/);
});
