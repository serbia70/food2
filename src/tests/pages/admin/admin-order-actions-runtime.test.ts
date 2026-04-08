import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const orderActionsPath = resolve(process.cwd(), 'src/scripts/admin/order-actions.ts');
const ordersPath = resolve(process.cwd(), 'src/scripts/admin/orders.ts');
const mqttAudioPath = resolve(process.cwd(), 'src/scripts/admin/mqtt-audio.ts');
const adminEntryPath = resolve(process.cwd(), 'src/scripts/admin/admin-entry.ts');

test('assign rider source does not force telegram debug alerts during normal admin dispatch', async () => {
  const source = await readFile(orderActionsPath, 'utf8');

  assert.doesNotMatch(source, /debugTelegram:\s*true/);
  assert.match(source, /await assignRider\(orderId, String\(target\.id \|\| ''\), \{/);
});

test('assign rider source falls back to data-oid when data-order-id is missing', async () => {
  const source = await readFile(orderActionsPath, 'utf8');

  assert.match(source, /const orderId = String\(el\?\.dataset\?\.orderId \|\| el\?\.dataset\?\.oid \|\| ''\)\.trim\(\);/);
  assert.match(source, /const hidden = document\.querySelector\(`\.hidden-data\[data-order-id="\$\{orderId\}"\]`\) as HTMLElement \| null\s*\|\| document\.querySelector\(`\.hidden-data\[data-oid="\$\{orderId\}"\]`\) as HTMLElement \| null;/);
});

test('admin orders source does not use delayed full page reload for refreshOrderList', async () => {
  const source = await readFile(ordersPath, 'utf8');

  assert.doesNotMatch(source, /window\.refreshOrderList = function \(\) \{\s*setTimeout\(\(\) => location\.reload\(\), 1500\);\s*\}/s);
  assert.doesNotMatch(source, /setTimeout\(\(\) => location\.reload\(\), 1500\)/);
});

test('admin mqtt audio source suppresses awaiting_courier status update toast and reload churn', async () => {
  const source = await readFile(mqttAudioPath, 'utf8');

  assert.match(source, /if \(payload\.event === 'status_update' && String\(payload\.status \|\| ''\) === 'awaiting_courier'\) \{/);
  assert.match(source, /return;/);
  assert.doesNotMatch(source, /toast\(`订单 #\$\{payload\.order_id \|\| ''\} 状态更新: \$\{payload\.status\}`\);/);
});

test('admin entry source refreshes orders tab when page returns to foreground', async () => {
  const source = await readFile(adminEntryPath, 'utf8');

  assert.match(source, /document\.addEventListener\('visibilitychange', \(\) => \{/);
  assert.match(source, /if \(document\.visibilityState !== 'visible'\) return;/);
  assert.match(source, /const lastTab = localStorage\.getItem\('adminLastTab'\) \|\| 'orders';/);
  assert.match(source, /if \(lastTab !== 'orders'\) return;/);
  assert.match(source, /if \(window\.__adminAssignInFlight\) return;/);
  assert.match(source, /location\.reload\(\);/);
});
