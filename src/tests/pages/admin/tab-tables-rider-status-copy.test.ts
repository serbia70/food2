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

test('admin 外卖状态文案改为复用共享 helper', async () => {
  const source = await readTabTablesSource();

  const statusWindow = sliceAround(source, 'status-tag status-', 40, 320).replace(/\s+/g, ' ');
  assert.match(statusWindow, /riderDeclinedAwaitingCourier \? ['"]骑手已拒单['"] : getAdminDispatchStatusCopy\(o\.status\)/);
  assert.doesNotMatch(statusWindow, /o\.status === ['"]awaiting_courier['"] \? ['"]待骑手/);
  assert.doesNotMatch(statusWindow, /o\.status === ['"]delivering['"] \? ['"]骑手已接单['"]/);
  assert.doesNotMatch(statusWindow, /o\.status === ['"]picked_up['"] \? ['"]骑手已取餐['"]/);
});


test('admin 外卖状态文案复用共享 helper 并覆盖 completed', async () => {
  const source = await readTabTablesSource();

  assert.match(source, /getAdminDispatchStatusCopy/);

  const statusWindow = sliceAround(source, 'status-tag status-', 40, 320).replace(/\s+/g, ' ');
  assert.match(statusWindow, /getAdminDispatchStatusCopy\(o\.status\)/);
});

test('admin 外卖卡片在已指派骑手分支展示骑手兜底链路', async () => {
  const source = await readTabTablesSource();

  const deliveringAssignedRiderWindow = sliceAround(source, 'deliveryActionFlags.showAssignedRider && (', 80, 420).replace(/\s+/g, ' ');
  assert.match(deliveringAssignedRiderWindow, /已指派骑手：/);
  assert.match(deliveringAssignedRiderWindow, /未命名骑手/);

  const courierNameIndex = deliveringAssignedRiderWindow.indexOf('courierName');
  const courierPhoneIndex = deliveringAssignedRiderWindow.indexOf('courierPhone');
  const fallbackNameIndex = deliveringAssignedRiderWindow.indexOf('未命名骑手');

  assert.ok(courierNameIndex >= 0, '应优先使用骑手姓名');
  assert.ok(courierPhoneIndex > courierNameIndex, '姓名缺失时应回退到骑手电话');
  assert.ok(fallbackNameIndex > courierPhoneIndex, '电话缺失时应回退为未命名骑手');
});

test('admin 外卖卡片在 awaiting_courier 且骑手拒单时展示拒单反馈', async () => {
  const source = await readTabTablesSource();

  assert.match(source, /readDispatchMetaFromRemarks/);
  assert.match(source, /isAwaitingCourierOrder/);

  assert.match(source, /const riderDeclinedAwaitingCourier = isAwaitingCourierOrder\(o\) && lastRiderDecision\?\.action === ['"]declined['"];/);
  assert.doesNotMatch(source, /const riderDeclinedAwaitingCourier = o\.status === ['"]awaiting_courier['"] && lastRiderDecision\?\.action === ['"]declined['"];/);

  const declinedStatusWindow = sliceAround(source, '骑手已拒单', 320, 260).replace(/\s+/g, ' ');
  assert.match(declinedStatusWindow, /riderDeclinedAwaitingCourier \? ['"]骑手已拒单['"]/);

  const feedbackWindow = sliceAround(source, '骑手反馈：', 320, 260).replace(/\s+/g, ' ');
  assert.match(feedbackWindow, /lastRiderDecision\?\.riderName/);
  assert.match(feedbackWindow, /已拒单/);
  assert.match(feedbackWindow, /formatBelgradeHHmm\(lastRiderDecision\?\.at\)/);

  const hiddenDataWindow = sliceAround(source, 'data-remarks=', 120, 180).replace(/\s+/g, ' ');
  assert.match(hiddenDataWindow, /data-remarks=\{o\.remarksJson\}/);
});

test('admin 外卖卡片动作分支复用共享 helper', async () => {
  const source = await readTabTablesSource();

  assert.match(source, /getAdminDeliveryActionFlags/);
  assert.match(source, /const deliveryActionFlags = getAdminDeliveryActionFlags\(o\.status\);/);

  const assignWindow = sliceAround(source, 'data-admin-action="assign-rider"', 260, 220).replace(/\s+/g, ' ');
  assert.match(assignWindow, /deliveryActionFlags\.canAssign/);
  assert.doesNotMatch(assignWindow, /o\.status === ['"]pending['"] \|\| o\.status === ['"]confirmed['"] \|\| o\.status === ['"]awaiting_courier['"]/);

  const markPickedUpWindow = sliceAround(source, 'data-admin-action="mark-picked-up"', 240, 220).replace(/\s+/g, ' ');
  assert.match(markPickedUpWindow, /deliveryActionFlags\.canMarkPickedUp/);
  assert.doesNotMatch(markPickedUpWindow, /o\.status === ['"]delivering['"]/);
  assert.match(markPickedUpWindow, /✅ 已取餐/);

  const markDeliveredWindow = sliceAround(source, 'data-admin-action="mark-delivered"', 240, 220).replace(/\s+/g, ' ');
  assert.match(markDeliveredWindow, /deliveryActionFlags\.canMarkDelivered/);
  assert.doesNotMatch(markDeliveredWindow, /o\.status === ['"]picked_up['"]/);
  assert.match(markDeliveredWindow, /✅ 已送达/);

  const riderWindow = sliceAround(source, '已指派骑手：', 220, 120).replace(/\s+/g, ' ');
  assert.match(riderWindow, /deliveryActionFlags\.showAssignedRider/);

  const editWindow = sliceAround(source, 'data-admin-action="edit-order"', 220, 120).replace(/\s+/g, ' ');
  assert.match(editWindow, /deliveryActionFlags\.canEdit/);
  assert.doesNotMatch(editWindow, /o\.status === ['"]pending['"] \|\| o\.status === ['"]confirmed['"] \|\| o\.status === ['"]delivering['"]/);
});
