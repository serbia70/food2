import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const orderViewPath = new URL('../../../src/pages/[slug]/order-view/[order_no].astro', import.meta.url);
const ordersPagePath = new URL('../../../src/pages/orders/index.astro', import.meta.url);
const userCenterPanelPath = new URL('../../../src/components/UserCenterPanel.tsx', import.meta.url);

async function readSource(path: URL) {
  return fs.readFile(path, 'utf8');
}

function sliceAround(source: string, anchor: string, before = 260, after = 220) {
  const index = source.indexOf(anchor);
  assert.notEqual(index, -1, `应存在锚点文案: ${anchor}`);
  return source.slice(Math.max(0, index - before), Math.min(source.length, index + anchor.length + after));
}

test('买家订单详情页复用共享配送文案并覆盖 picked_up', async () => {
  const source = await readSource(orderViewPath);

  assert.match(source, /import\s+\{\s*getCustomerOrderStatusCopy\s*,\s*getCustomerDeliveryStatusCopy\s*\}\s+from\s+['"].*rider-dispatch/);

  const pickedUpWindow = sliceAround(source, "picked_up: getCustomerDeliveryStatusCopy('picked_up')", 120, 40).replace(/\s+/g, ' ');
  assert.match(pickedUpWindow, /picked_up:\s*getCustomerDeliveryStatusCopy\(['"]picked_up['"]\)/);

  const deliveringWindow = sliceAround(source, "delivering: getCustomerDeliveryStatusCopy('delivering')", 120, 40).replace(/\s+/g, ' ');
  assert.match(deliveringWindow, /delivering:\s*getCustomerDeliveryStatusCopy\(['"]delivering['"]\)/);

  const completedWindow = sliceAround(source, "completed: getCustomerDeliveryStatusCopy('completed')", 120, 40).replace(/\s+/g, ' ');
  assert.match(completedWindow, /completed:\s*getCustomerDeliveryStatusCopy\(['"]completed['"]\)/);
});


test('买家订单详情页把 pending/confirmed/awaiting_courier/closed 也复用共享状态文案', async () => {
  const source = await readSource(orderViewPath);

  assert.match(source, /getCustomerOrderStatusCopy/);
  assert.match(source, /pending:\s*getCustomerOrderStatusCopy\('pending'\)/);
  assert.match(source, /confirmed:\s*getCustomerOrderStatusCopy\('confirmed'\)/);
  assert.match(source, /awaiting_courier:\s*getCustomerOrderStatusCopy\('awaiting_courier'\)/);
  assert.match(source, /cancelled:\s*getCustomerOrderStatusCopy\('cancelled'\)/);
  assert.match(source, /closed:\s*getCustomerOrderStatusCopy\('closed'\)/);
  assert.doesNotMatch(source, /pending:\s*'待处理\s*\/\s*Pending'/);
  assert.doesNotMatch(source, /confirmed:\s*'已接单\s*\/\s*Confirmed'/);
  assert.doesNotMatch(source, /cancelled:\s*'已取消\s*\/\s*Cancelled'/);
});

test('买家订单中心把 pending/confirmed/awaiting_courier 与配送态一起复用共享状态文案', async () => {
  const source = await readSource(ordersPagePath);

  assert.match(source, /import\s+\{[\s\S]*CUSTOMER_COMPLETED_STATUSES[\s\S]*getCustomerOrderStatusCopy[\s\S]*getCustomerDeliveryStatusCopy[\s\S]*isCustomerActiveStatus[\s\S]*\}\s+from\s+['"].*rider-dispatch/);
  assert.match(source, /getCustomerOrderStatusCopy/);
  assert.match(source, /getCustomerDeliveryStatusCopy/);
  assert.match(source, /pendingStatusCopy:\s*getCustomerOrderStatusCopy\('pending'\)/);
  assert.match(source, /confirmedStatusCopy:\s*getCustomerOrderStatusCopy\('confirmed'\)/);
  assert.match(source, /awaitingCourierStatusCopy:\s*getCustomerOrderStatusCopy\('awaiting_courier'\)/);
  assert.match(source, /deliveringStatusCopy:\s*getCustomerDeliveryStatusCopy\('delivering'\)/);
  assert.match(source, /pickedUpStatusCopy:\s*getCustomerDeliveryStatusCopy\('picked_up'\)/);
  assert.match(source, /completedStatusCopy:\s*getCustomerDeliveryStatusCopy\('completed'\)/);
  assert.match(source, /closedStatusCopy:\s*getCustomerOrderStatusCopy\('closed'\)/);
  assert.doesNotMatch(source, /function getCustomerDeliveryStatusCopy\(/);
  assert.doesNotMatch(source, /function isCustomerActiveStatus\(status\)\s*\{/);

  const pendingWindow = sliceAround(source, "if (status === 'pending') return pendingStatusCopy;", 80, 20).replace(/\s+/g, ' ');
  assert.match(pendingWindow, /status === ['"]pending['"]/);

  const confirmedWindow = sliceAround(source, "if (status === 'confirmed') return confirmedStatusCopy;", 80, 20).replace(/\s+/g, ' ');
  assert.match(confirmedWindow, /status === ['"]confirmed['"]/);

  const awaitingWindow = sliceAround(source, "if (status === 'awaiting_courier') return awaitingCourierStatusCopy;", 80, 20).replace(/\s+/g, ' ');
  assert.match(awaitingWindow, /status === ['"]awaiting_courier['"]/);

  const pickedUpLabelWindow = sliceAround(source, "if (status === 'picked_up') return pickedUpStatusCopy;", 80, 20).replace(/\s+/g, ' ');
  assert.match(pickedUpLabelWindow, /status === ['"]picked_up['"]/);

  const completedLabelWindow = sliceAround(source, "if (isCustomerCompletedStatus(status)) return completedStatusCopy;", 80, 20).replace(/\s+/g, ' ');
  assert.match(completedLabelWindow, /isCustomerCompletedStatus\(status\)/);

  const closedWindow = sliceAround(source, "return closedStatusCopy;", 80, 20).replace(/\s+/g, ' ');
  assert.match(closedWindow, /closedStatusCopy/);

  const activeClassWindow = sliceAround(source, "if (isCustomerActiveStatus(status)) return 'status-active';", 80, 20).replace(/\s+/g, ' ');
  assert.match(activeClassWindow, /isCustomerActiveStatus\(status\)/);

  assert.match(source, /CUSTOMER_COMPLETED_STATUSES/);
  assert.match(source, /customerCompletedStatuses:\s*CUSTOMER_COMPLETED_STATUSES/);
  assert.match(source, /function isCustomerCompletedStatus\(status\)\s*\{\s*return customerCompletedStatuses\.includes\(String\(status \|\| ''\)\.trim\(\)\);\s*\}/);

  const doneClassWindow = sliceAround(source, "if (isCustomerCompletedStatus(status)) return 'status-done';", 80, 20).replace(/\s+/g, ' ');
  assert.match(doneClassWindow, /isCustomerCompletedStatus\(status\)/);

  const activeGroupWindow = sliceAround(source, "if (isCustomerActiveStatus(order.status)) {", 80, 120).replace(/\s+/g, ' ');
  assert.match(activeGroupWindow, /active\.push\(order\)/);

  const completedGroupWindow = sliceAround(source, "} else if (isCustomerCompletedStatus(order.status)) {", 80, 120).replace(/\s+/g, ' ');
  assert.match(completedGroupWindow, /completed\.push\(order\)/);

  const activeCountWindow = sliceAround(source, "orders.filter((order) => isCustomerActiveStatus(order.status)).length", 40, 40).replace(/\s+/g, ' ');
  assert.match(activeCountWindow, /isCustomerActiveStatus\(order\.status\)/);
  assert.doesNotMatch(source, /if \(status === 'completed'\) return completedStatusCopy;/);
  assert.doesNotMatch(source, /if \(status === 'completed'\) return 'status-done';/);
  assert.doesNotMatch(source, /else if \(order\.status === 'completed'\) \{/);
});

test('用户中心订单卡片复用共享状态文案并覆盖 pending 到 completed', async () => {
  const source = await readSource(userCenterPanelPath);

  assert.match(source, /getCustomerOrderStatusCopy/);
  assert.match(source, /getCustomerDeliveryStatusCopy/);
  assert.match(source, /isCustomerActiveStatus/);
  assert.match(source, /isCustomerDeliveryStatus/);
  assert.match(source, /isCustomerCompletedStatus/);
  assert.doesNotMatch(source, /派送中\s*\/\s*Delivering/);
  assert.doesNotMatch(source, /已送达\s*\/\s*Completed/);
  assert.doesNotMatch(source, /等待接单\s*\/\s*Pending/);
  assert.doesNotMatch(source, /商家已接单\s*\/\s*Confirmed/);

  const deliveringWindow = sliceAround(source, "if (isCustomerDeliveryStatus(status)) {", 40, 320).replace(/\s+/g, ' ');
  assert.match(deliveringWindow, /isCustomerDeliveryStatus\(status\)/);
  assert.match(deliveringWindow, /getCustomerDeliveryStatusCopy\(status\)/);
  const completedWindow = sliceAround(source, "const isCompleted = isCustomerCompletedStatus(status);", 40, 220).replace(/\s+/g, ' ');
  assert.match(completedWindow, /isCustomerCompletedStatus\(status\)/);
  assert.doesNotMatch(source, /const isCompleted = status === 'completed';/);
  assert.doesNotMatch(source, /function isCustomerCompletedStatus\(status: string \| null \| undefined\): boolean \{/);

  const pendingWindow = sliceAround(source, "const label = getCustomerOrderStatusCopy(status);", 40, 220).replace(/\s+/g, ' ');
  assert.match(pendingWindow, /getCustomerOrderStatusCopy\(status\)/);
  assert.match(pendingWindow, /isCustomerActiveStatus\(status\)/);

  const activeStatusWindow = sliceAround(source, "if (isCustomerActiveStatus(s)) return 'status-active';", 40, 40).replace(/\s+/g, ' ');
  assert.match(activeStatusWindow, /isCustomerActiveStatus\(s\)/);
});

test('订单详情 helper 复用共享状态文案并覆盖 picked_up', async () => {
  const detailSource = await readSource(new URL('../../../src/lib/order-detail-state.ts', import.meta.url));
  const chatSource = await readSource(new URL('../../../src/components/ShopChatModal.tsx', import.meta.url));

  assert.match(detailSource, /import\s+\{\s*getCustomerOrderStatusCopy\s*,\s*getCustomerDeliveryStatusCopy\s*,\s*isCustomerDeliveryCompleteStatus\s*\}\s+from\s+['"].*rider-dispatch/);
  assert.doesNotMatch(detailSource, /配送中/);
  assert.doesNotMatch(detailSource, /已完成/);
  assert.match(detailSource, /isCustomerDeliveryCompleteStatus\(status\)\s*\?\s*getCustomerDeliveryStatusCopy\(status\)/);
  assert.doesNotMatch(detailSource, /status === ['"]delivering['"] \|\| status === ['"]picked_up['"] \|\| status === ['"]completed['"]/);
  assert.match(detailSource, /getCustomerOrderStatusCopy\(status\)/);

  assert.match(chatSource, /import\s+\{\s*buildOrderDetailState\s*\}\s+from\s+['"].*order-detail-state/);
  assert.match(chatSource, /selectedOrderDetail = selectedOrder \? buildOrderDetailState\(selectedOrder\) : null/);
});
