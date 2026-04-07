import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const orderActionsPath = resolve(process.cwd(), 'src/scripts/admin/order-actions.ts');
const ordersPath = resolve(process.cwd(), 'src/scripts/admin/orders.ts');
const mqttAudioPath = resolve(process.cwd(), 'src/scripts/admin/mqtt-audio.ts');

test('assign rider source does not force telegram debug alerts during normal admin dispatch', async () => {
  const source = await readFile(orderActionsPath, 'utf8');

  assert.doesNotMatch(source, /debugTelegram:\s*true/);
  assert.match(source, /await assignRider\(orderId, String\(target\.id \|\| ''\), \{/);
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
