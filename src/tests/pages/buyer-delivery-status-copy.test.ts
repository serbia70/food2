import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const orderViewPath = new URL('../../../src/pages/[slug]/order-view/[order_no].astro', import.meta.url);
const ordersPagePath = new URL('../../../src/pages/orders/index.astro', import.meta.url);

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

  assert.match(source, /import\s+\{\s*getCustomerDeliveryStatusCopy\s*\}\s+from\s+['"].*rider-dispatch/);

  const pickedUpWindow = sliceAround(source, "picked_up: getCustomerDeliveryStatusCopy('picked_up')", 120, 40).replace(/\s+/g, ' ');
  assert.match(pickedUpWindow, /picked_up:\s*getCustomerDeliveryStatusCopy\(['"]picked_up['"]\)/);

  const deliveringWindow = sliceAround(source, "delivering: getCustomerDeliveryStatusCopy('delivering')", 120, 40).replace(/\s+/g, ' ');
  assert.match(deliveringWindow, /delivering:\s*getCustomerDeliveryStatusCopy\(['"]delivering['"]\)/);

  const completedWindow = sliceAround(source, "completed: getCustomerDeliveryStatusCopy('completed')", 120, 40).replace(/\s+/g, ' ');
  assert.match(completedWindow, /completed:\s*getCustomerDeliveryStatusCopy\(['"]completed['"]\)/);
});

test('买家订单中心把 picked_up 视为进行中并使用同步文案', async () => {
  const source = await readSource(ordersPagePath);

  assert.match(source, /import\s+\{\s*getCustomerDeliveryStatusCopy\s*\}\s+from\s+['"].*rider-dispatch/);
  assert.match(source, /define:vars=\{\{[\s\S]*deliveringStatusCopy:\s*getCustomerDeliveryStatusCopy\('delivering'\),[\s\S]*pickedUpStatusCopy:\s*getCustomerDeliveryStatusCopy\('picked_up'\),[\s\S]*completedStatusCopy:\s*getCustomerDeliveryStatusCopy\('completed'\)/);
  assert.doesNotMatch(source, /function getCustomerDeliveryStatusCopy\(/);

  const pickedUpLabelWindow = sliceAround(source, "if (status === 'picked_up') return pickedUpStatusCopy;", 80, 20).replace(/\s+/g, ' ');
  assert.match(pickedUpLabelWindow, /status === ['"]picked_up['"]/);

  const activeGroupWindow = sliceAround(source, "order.status === 'picked_up'", 180, 180).replace(/\s+/g, ' ');
  assert.match(activeGroupWindow, /active\.push\(order\)/);

  const activeCountWindow = sliceAround(source, "['pending', 'confirmed', 'delivering', 'picked_up'].includes(order.status)", 40, 40).replace(/\s+/g, ' ');
  assert.match(activeCountWindow, /\['pending', 'confirmed', 'delivering', 'picked_up'\]\.includes\(order\.status\)/);
});
