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

test('phoneLike should accept short numeric ids used as phone', async () => {
  const orders = await readText('src/pages/orders/index.astro');
  const userCenter = await readText('src/components/UserCenterPageIsland.tsx');

  // Some deployments use short numeric IDs like "888" as the "phone" identifier.
  // The UI should not block history/orders loading just because the value is < 7 digits.
  assert.ok(!orders.includes('\\d{7,15}'), 'orders/index.astro still requires 7+ digits');
  assert.ok(!userCenter.includes('\\d{7,15}'), 'UserCenterPageIsland.tsx still requires 7+ digits');
});
