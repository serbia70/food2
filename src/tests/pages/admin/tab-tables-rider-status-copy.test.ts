import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const tabTablesPath = new URL('../../../../src/components/admin/TabTables.astro', import.meta.url);

async function readTabTablesSource() {
  return fs.readFile(tabTablesPath, 'utf8');
}

function sliceAround(source: string, anchor: string, before = 260, after = 140) {
  const index = source.indexOf(anchor);
  assert.notEqual(index, -1, `应存在锚点文案: ${anchor}`);
  return source.slice(Math.max(0, index - before), Math.min(source.length, index + anchor.length + after));
}

test('admin 外卖状态文案覆盖骑手相关语义映射', async () => {
  const source = await readTabTablesSource();

  const awaitingWindow = sliceAround(source, '待骑手确认');
  assert.match(awaitingWindow, /['"]awaiting_courier['"]/);

  const deliveringWindow = sliceAround(source, '骑手已接单');
  assert.match(deliveringWindow, /['"]delivering['"]/);
});

test('admin 外卖卡片在 delivering 场景展示骑手兜底链路', async () => {
  const source = await readTabTablesSource();

  const assignedRiderWindow = sliceAround(source, '已指派骑手：', 220, 220).replace(/\s+/g, ' ');
  assert.match(assignedRiderWindow, /['"]delivering['"]/);
  assert.match(assignedRiderWindow, /未命名骑手/);

  const courierNameIndex = assignedRiderWindow.indexOf('courierName');
  const courierPhoneIndex = assignedRiderWindow.indexOf('courierPhone');
  const fallbackNameIndex = assignedRiderWindow.indexOf('未命名骑手');

  assert.ok(courierNameIndex >= 0, '应优先使用骑手姓名');
  assert.ok(courierPhoneIndex > courierNameIndex, '姓名缺失时应回退到骑手电话');
  assert.ok(fallbackNameIndex > courierPhoneIndex, '电话缺失时应回退为未命名骑手');
});

test('admin 外卖卡片在 awaiting_courier 且骑手拒单时展示拒单反馈', async () => {
  const source = await readTabTablesSource();

  assert.match(source, /readDispatchMetaFromRemarks/);

  assert.match(source, /const riderDeclinedAwaitingCourier = o\.status === ['"]awaiting_courier['"] && lastRiderDecision\?\.action === ['"]declined['"];/);

  const declinedStatusWindow = sliceAround(source, '骑手已拒单', 320, 260).replace(/\s+/g, ' ');
  assert.match(declinedStatusWindow, /riderDeclinedAwaitingCourier \? ['"]骑手已拒单['"]/);

  const feedbackWindow = sliceAround(source, '骑手反馈：', 320, 260).replace(/\s+/g, ' ');
  assert.match(feedbackWindow, /lastRiderDecision\?\.riderName/);
  assert.match(feedbackWindow, /已拒单/);
  assert.match(feedbackWindow, /formatBelgradeHHmm\(lastRiderDecision\?\.at\)/);

  const hiddenDataWindow = sliceAround(source, 'data-remarks=', 120, 180).replace(/\s+/g, ' ');
  assert.match(hiddenDataWindow, /data-remarks=\{o\.remarksJson\}/);
});
