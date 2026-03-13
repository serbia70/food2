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

test('/orders should show delivery-only history via sessionToken', async () => {
  const content = await readText('src/pages/orders/index.astro');

  // /orders must no longer call the legacy phone-based GET history endpoint.
  assert.ok(
    !content.includes('/api/user/history?phone='),
    'orders/index.astro still calls /api/user/history?phone='
  );

  // /orders must call POST /api/user/history with { sessionToken }.
  assert.ok(
    content.includes("fetch('/api/user/history'") || content.includes('fetch("/api/user/history"'),
    'orders/index.astro does not fetch /api/user/history'
  );
  assert.ok(
    content.includes("method: 'POST'") || content.includes('method: "POST"'),
    'orders/index.astro does not use POST for /api/user/history'
  );
  assert.ok(
    content.includes('sessionToken') && content.includes("localStorage.getItem('user_session") && content.includes('JSON.stringify'),
    'orders/index.astro does not send sessionToken payload'
  );

  // /orders must not allow dine_in orders in the user-visible filter.
  assert.ok(
    !content.includes("|| t === 'dine_in'") && !content.includes("t === 'delivery' || t === 'dine_in'"),
    'orders/index.astro still allows dine_in orders'
  );
});
