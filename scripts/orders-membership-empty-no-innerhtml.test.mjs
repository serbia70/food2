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

test('orders membership empty-state should not set innerHTML', async () => {
  const content = await readText('src/pages/orders/index.astro');

  assert.ok(
    !content.includes("membershipListEl.innerHTML = '<div class=\"membership-empty\""),
    'Found membership empty-state innerHTML assignment in orders/index.astro'
  );
});
