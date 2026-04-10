import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const tabTablesPath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');
const orderActionsPath = resolve(process.cwd(), 'src/scripts/admin/order-actions.ts');
const ordersScriptPath = resolve(process.cwd(), 'src/scripts/admin/orders.ts');
const riderAssignApiPath = resolve(process.cwd(), 'src/pages/api/admin/rider-assign.ts');

test('admin delivery action source uses canonical picked_up wording and camelCase status fields', async () => {
  const [tabTablesSource, orderActionsSource, ordersSource] = await Promise.all([
    readFile(tabTablesPath, 'utf8'),
    readFile(orderActionsPath, 'utf8'),
    readFile(ordersScriptPath, 'utf8'),
  ]);

  assert.match(tabTablesSource, /data-admin-action="mark-delivered"[\s\S]*?>✅ 确认送达<\/button>/);
  assert.doesNotMatch(tabTablesSource, /data-admin-action="mark-delivered"[\s\S]*?>✅ 已送达<\/button>/);

  assert.match(ordersSource, /data-admin-action="mark-delivered"[^`]*>✅ 确认送达<\/button>/);
  assert.doesNotMatch(ordersSource, /data-admin-action="mark-delivered"[^`]*>✅ 已送达<\/button>/);

  assert.match(orderActionsSource, /expectedCurrentStatus: 'delivering',/);
  assert.match(orderActionsSource, /expectedCurrentStatus: 'picked_up',/);
  assert.doesNotMatch(orderActionsSource, /expected_current_status/);
});

test('task3: admin runtime no longer keeps rider-assign debug branches', async () => {
  const [ordersSource, riderAssignSource, adminIndexSource] = await Promise.all([
    readFile(ordersScriptPath, 'utf8'),
    readFile(riderAssignApiPath, 'utf8'),
    readFile(resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro'), 'utf8'),
  ]);

  assert.doesNotMatch(ordersSource, /debugTelegram/);
  assert.doesNotMatch(ordersSource, /派单调试/);
  assert.doesNotMatch(riderAssignSource, /debugTelegram/);
  assert.doesNotMatch(adminIndexSource, /__debugMasterSettings/);
});
