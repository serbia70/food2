import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const tabOrdersPath = resolve(process.cwd(), 'src/components/admin/TabOrders.astro');
const orderActionsPath = resolve(process.cwd(), 'src/scripts/admin/order-actions.ts');

function sliceAround(source: string, anchor: string, before = 260, after = 260) {
  const index = source.indexOf(anchor);
  assert.notEqual(index, -1, `应存在锚点: ${anchor}`);
  return source.slice(Math.max(0, index - before), Math.min(source.length, index + anchor.length + after));
}

test('TabOrders source shows latest rider decision feedback for delivery cards', async () => {
  const source = await readFile(tabOrdersPath, 'utf8');

  assert.match(source, /readDispatchMetaFromRemarks/);
  assert.match(source, /const dispatchMeta = readDispatchMetaFromRemarks\(o\.remarksJson\);/);
  assert.match(source, /const lastRiderDecision = dispatchMeta\.lastRiderDecision;/);

  const feedbackWindow = sliceAround(source, '骑手反馈：', 240, 320).replace(/\s+/g, ' ');
  assert.match(feedbackWindow, /lastRiderDecision\?\.action === 'declined' \? '已拒单' : '已接单'/);
  assert.match(feedbackWindow, /lastRiderDecision\?\.riderName/);
  assert.match(feedbackWindow, /formatBelgradeHHmm\(lastRiderDecision\?\.at\)/);
});

test('assign rider action source filters declined riders before prompting', async () => {
  const source = await readFile(orderActionsPath, 'utf8');

  assert.match(source, /readDispatchMetaFromRemarks/);
  assert.match(source, /const declinedRiderIds = new Set\(readDispatchMetaFromRemarks\(String\(hidden\?\.dataset\?\.remarks \|\| ''\)\)\.declinedRiderIds\);/);
  assert.match(source, /const riders = \(await fetchAvailableRiders\(\)\)\.filter\(\(rider\) => !declinedRiderIds\.has\(String\(rider\.id \|\| ''\)\.trim\(\)\)\);/);
  assert.match(source, /showAdminToast\('当前无可接单骑手'\)/);
});
