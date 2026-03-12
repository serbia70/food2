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

test('orders page should not require phone-only login', async () => {
  const content = await readText('src/pages/orders/index.astro');

  // If orders logic only considers user.phone and ignores login_account/user_session,
  // it will force users who logged in with email/google/id into a login loop.
  assert.ok(
    !content.includes('const primaryPhone = phoneLike(rawPhone);\n      if (!primaryPhone) {\n        setView(\'auth\');'),
    'orders/index.astro still gates auth on phone only'
  );
});
