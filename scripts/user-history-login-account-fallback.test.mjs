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

test('/user should not require phone-only history loading', async () => {
  const content = await readText('src/components/UserCenterPageIsland.tsx');

  // If the /user page only runs loadHistoryWithFallback when userInfo.phone exists,
  // users who logged in with email/google/id (phone empty, login_account present)
  // will always see an empty history.
  assert.ok(
    !content.includes('if (!userInfo?.phone) return;'),
    'UserCenterPageIsland.tsx still blocks history load on phone only'
  );
});
