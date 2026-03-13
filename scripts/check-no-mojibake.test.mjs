import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_ROOT = join(__dirname, '..', 'src');

async function readText(relPath) {
  return readFile(join(SRC_ROOT, relPath), 'utf8');
}

test('source should not contain obvious mojibake in comments', async () => {
  const content = await readText('lib/db.ts');

  // This exact mojibake snippet is known to exist and should be fixed.
  // Keep the check very specific to avoid false positives.
  assert.ok(!content.includes('浼樺厛'), 'Found mojibake text "浼樺厛" in src/lib/db.ts');
});
