import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const riderOrdersApiPath = resolve(process.cwd(), 'src/pages/api/rider/orders.ts');
const adminIndexPath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
const ordersPagePath = resolve(process.cwd(), 'src/pages/orders/index.astro');
const masterDispatchLoaderPath = resolve(process.cwd(), 'src/lib/master-dispatch-loader.ts');
const riderDispatchLibPath = resolve(process.cwd(), 'src/lib/rider-dispatch.ts');
const adminOrdersScriptPath = resolve(process.cwd(), 'src/scripts/admin/orders.ts');
const userCenterPanelPath = resolve(process.cwd(), 'src/components/UserCenterPanel.tsx');
const adminMqttAudioPath = resolve(process.cwd(), 'src/scripts/admin/mqtt-audio.ts');
const adminRiderDispatchApiPath = resolve(process.cwd(), 'src/pages/api/admin/rider-dispatch.ts');
const adminRiderAssignApiPath = resolve(process.cwd(), 'src/pages/api/admin/rider-assign.ts');

test('task2: rider orders BFF removes snake_case normalize fallback', async () => {
  const source = await readFile(riderOrdersApiPath, 'utf8');

  assert.doesNotMatch(source, /function normalizeRiderOrder\(/);
  assert.doesNotMatch(source, /function normalizeRiderRow\(/);
  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /shop_name/);
  assert.doesNotMatch(source, /table_info/);
  assert.doesNotMatch(source, /user_phone/);
  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /total_amount/);
  assert.doesNotMatch(source, /items_json/);
  assert.doesNotMatch(source, /courier_phone/);
  assert.doesNotMatch(source, /pickup_eta_minutes/);
  assert.doesNotMatch(source, /telegram_chat_id/);
});

test('task2: admin index only maps camelCase order fields', async () => {
  const source = await readFile(adminIndexPath, 'utf8');

  assert.match(source, /orderNo: String\(o\?\.orderNo \|\| o\?\.id \|\| ''\)/);
  assert.match(source, /orderType: String\(o\?\.orderType/);
  assert.match(source, /totalAmount: Number\(o\?\.totalAmount/);
  assert.match(source, /itemsJson: normalizeJSONString\(o\?\.itemsJson/);
  assert.match(source, /remarksJson: normalizeRemarkJSONString\(o\?\.remarksJson/);
  assert.match(source, /tableInfo: String\(o\?\.tableInfo/);
  assert.match(source, /userPhone: String\(o\?\.userPhone/);
  assert.match(source, /courierPhone: String\(o\?\.courierPhone/);
  assert.match(source, /createdAt: String\(o\?\.createdAt/);

  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /order_type/);
  assert.doesNotMatch(source, /table_info/);
  assert.doesNotMatch(source, /total_amount/);
  assert.doesNotMatch(source, /items_json/);
  assert.doesNotMatch(source, /remarks_json/);
  assert.doesNotMatch(source, /courier_phone/);
  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /pickup_ready_at/);
  assert.doesNotMatch(source, /rider_broadcasted_at/);
});

test('task2: orders page membership view reads only camelCase shop fields', async () => {
  const source = await readFile(ordersPagePath, 'utf8');

  assert.match(source, /pickFirstString\(order, \['shopName'\]\)/);
  assert.match(source, /pickFirstString\(order, \['shopSlug'\]\)/);
  assert.match(source, /pickFirstNumber\(order, \['points', 'pointsBalance'\]\)/);
  assert.match(source, /order && \(order\.isVip === true \|\| order\.isVip === 1 \|\| order\.isVip === '1'\)/);
  assert.match(source, /order && order\.vipLevel \? order\.vipLevel : ''/);

  assert.doesNotMatch(source, /shop_name/);
  assert.doesNotMatch(source, /restaurant_name/);
  assert.doesNotMatch(source, /merchant_name/);
  assert.doesNotMatch(source, /shop_slug/);
  assert.doesNotMatch(source, /restaurant_slug/);
  assert.doesNotMatch(source, /restaurantId/);
  assert.doesNotMatch(source, /is_vip/);
  assert.doesNotMatch(source, /vip_level/);
  assert.doesNotMatch(source, /user_points/);
});

test('task2: master dispatch loader uses camelCase-only payload/view fields', async () => {
  const source = await readFile(masterDispatchLoaderPath, 'utf8');

  assert.match(source, /orderNo: String\(order\.orderNo \|\| order\.id \|\| '-'\)/);
  assert.match(source, /shopName: String\(order\.shopName \|\| ''\)\.trim\(\)/);
  assert.match(source, /lastDispatchedRiderId: String\(order\.dispatch\?\.lastDispatchedRiderId \|\| ''\)/);

  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /shop_name/);
  assert.doesNotMatch(source, /dispatch_status/);
  assert.doesNotMatch(source, /dispatch_round/);
  assert.doesNotMatch(source, /current_pool_index/);
  assert.doesNotMatch(source, /last_dispatched_rider_id/);
  assert.doesNotMatch(source, /next_escalate_at/);
  assert.doesNotMatch(source, /pool_count/);
  assert.doesNotMatch(source, /available_count/);
  assert.doesNotMatch(source, /busy_count/);
  assert.doesNotMatch(source, /offline_count/);
});

test('task2: runtime order flows stay camelCase-only in targeted files', async () => {
  const [riderDispatchSource, adminOrdersSource, userCenterPanelSource, adminMqttAudioSource, adminRiderDispatchApiSource] = await Promise.all([
    readFile(riderDispatchLibPath, 'utf8'),
    readFile(adminOrdersScriptPath, 'utf8'),
    readFile(userCenterPanelPath, 'utf8'),
    readFile(adminMqttAudioPath, 'utf8'),
    readFile(adminRiderDispatchApiPath, 'utf8'),
  ]);

  assert.doesNotMatch(riderDispatchSource, /courier_phone/);

  assert.doesNotMatch(adminOrdersSource, /order_type/);
  assert.doesNotMatch(adminOrdersSource, /remarks_json/);
  assert.doesNotMatch(adminOrdersSource, /pickup_ready_at/);
  assert.doesNotMatch(adminOrdersSource, /rider_broadcasted_at/);
  assert.doesNotMatch(adminOrdersSource, /courier_phone/);
  assert.doesNotMatch(adminOrdersSource, /created_at/);

  assert.doesNotMatch(userCenterPanelSource, /courier_phone/);
  assert.doesNotMatch(userCenterPanelSource, /courier_name/);

  assert.doesNotMatch(adminMqttAudioSource, /order_type/);

  assert.doesNotMatch(adminRiderDispatchApiSource, /remarks_json/);
  assert.doesNotMatch(adminRiderDispatchApiSource, /payload\.restaurantSlug/);
  assert.doesNotMatch(adminRiderDispatchApiSource, /payload\.restaurantId/);
  assert.doesNotMatch(adminRiderDispatchApiSource, /payload\.restaurantName/);
  assert.doesNotMatch(adminRiderDispatchApiSource, /order\.restaurantSlug/);
  assert.doesNotMatch(adminRiderDispatchApiSource, /order\.restaurantId/);
  assert.doesNotMatch(adminRiderDispatchApiSource, /order\.restaurantName/);
  assert.doesNotMatch(adminRiderDispatchApiSource, /shop_slug/);
});

test('task2: rider dashboard deep-link matcher reads only camelCase shop fields from order', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/pages/rider/dashboard.astro'), 'utf8');

  assert.doesNotMatch(source, /safeOrder\.restaurantSlug/);
  assert.doesNotMatch(source, /safeOrder\.restaurantId/);
});

test('task2: admin rider-assign reads order remarks in camelCase only', async () => {
  const source = await readFile(adminRiderAssignApiPath, 'utf8');

  assert.match(source, /remarksJson: row && typeof row === 'object' \? String\(row\.remarksJson \|\| ''\)\.trim\(\) : ''/);
  assert.doesNotMatch(source, /remarks_json/);
});
