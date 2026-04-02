import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/[slug]/order-view/[order_no].astro');

test('order view source reads canonical master settings footer and mqtt keys only', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const phone =\s*String\(settings\?\.contact\?\.phone \|\| settings\?\.phone \|\| shop\?\.phone \|\| masterSettings\?\.footerPhone \|\| ''\);/);
  assert.match(page, /const mqttBroker = String\(settings\?\.mqttBroker \|\| masterSettings\?\.mqttBroker \|\| 'mqtt\.serbia70\.com'\);/);
  assert.match(page, /const itemsRaw = parseJSON<any>\(order\?\.itemsJson, \[] as any\);/);
  assert.match(page, /let riderName = String\(order\?\.courierName \|\| ''\)\.trim\(\);/);
  assert.match(page, /let riderPhone = String\(order\?\.courierPhone \|\| ''\)\.trim\(\);/);
  assert.match(page, /const mqttSecret = String\(shop\?\.mqttSecret \|\| ''\);/);
  assert.match(page, /const createdAt = String\(order\?\.createdAt \|\| ''\)/);
  assert.match(page, /const scheduledFor = String\(order\?\.scheduledFor \|\| ''\)/);
  assert.match(page, /const isDeliveryOrder = String\(order\?\.orderType \|\| ''\)\.toLowerCase\(\) === 'delivery';/);
  assert.match(page, /const tableToken = String\(order\?\.tableInfo \|\| ''\)\.split\(' '\)\[0\] \|\| '';/);
  assert.match(page, /#\{order\?\.orderNo \|\| order_no\}/);
  assert.match(page, /order\?\.tableInfo && <div class="line"><span>地址\/桌号 \/ Adresa\/Sto:<\/span><b>\{order\.tableInfo\}<\/b><\/div>/);
  assert.match(page, /const n = String\(it\?\.name \|\| it\?\.productName \|\| '商品'\);/);
  assert.match(page, /const sub = String\(it\?\.subName \|\| ''\)\.trim\(\);/);
  assert.match(page, /Number\(order\?\.totalAmount \|\| 0\)/);
  assert.match(page, /const pid = Number\(\(payload && \(payload\.orderId \|\| payload\.id\)\) \|\| 0\);/);
  assert.match(page, /const pno = String\(\(payload && payload\.orderNo\) \|\| ''\)\.trim\(\);/);

  assert.doesNotMatch(page, /footer_phone/);
  assert.doesNotMatch(page, /mqtt_broker/);
  assert.doesNotMatch(page, /items_json/);
  assert.doesNotMatch(page, /courier_name/);
  assert.doesNotMatch(page, /courier_phone/);
  assert.doesNotMatch(page, /mqtt_secret/);
  assert.doesNotMatch(page, /created_at/);
  assert.doesNotMatch(page, /scheduled_for/);
  assert.doesNotMatch(page, /order_type/);
  assert.doesNotMatch(page, /table_info/);
  assert.doesNotMatch(page, /product_name/);
  assert.doesNotMatch(page, /sub_name/);
  assert.doesNotMatch(page, /total_amount/);
  assert.doesNotMatch(page, /order_id/);
});
