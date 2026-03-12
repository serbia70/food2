import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function readText(relPath) {
  return readFile(join(__dirname, '..', relPath), 'utf8');
}

test('user-order-view should not hide dine_in orders', async () => {
  const content = await readText('src/lib/user-order-view.ts');

  // Some users have only dine_in orders (e.g. table orders). The user-facing order history
  // should not filter those out and show an empty state.
  assert.ok(
    content.includes("t === 'delivery' || t === 'dine_in'") || content.includes("t === 'dine_in' || t === 'delivery'") || content.includes("['delivery', 'dine_in']") || content.includes('[\"delivery\", \"dine_in\"]'),
    'filterUserVisibleOrders still only keeps delivery'
  );
});
