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

test('admin user-chat should not use innerHTML/insertAdjacentHTML', async () => {
  const content = await readText('src/scripts/admin/user-chat.ts');
  assert.ok(!content.includes('.innerHTML'), 'Found .innerHTML usage in user-chat.ts');
  assert.ok(!content.includes('insertAdjacentHTML'), 'Found insertAdjacentHTML usage in user-chat.ts');
});
