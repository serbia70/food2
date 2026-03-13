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

test('shop page footer uses public /api/home master settings', async () => {
  const content = await readText('src/pages/[slug]/index.astro');

  // Footer should come from public master settings exposed via /api/home.
  assert.ok(
    content.includes('fetch(`${API_BASE_URL}/api/home`)'),
    'expected shop page to fetch /api/home for public master settings'
  );

  // Ensure footer fields read from the public settings object (not just hardcoded defaults).
  assert.ok(
    content.includes('publicMasterSettings.footer_phone') && content.includes('publicMasterSettings.footer_text'),
    'expected footer fields to read from publicMasterSettings'
  );
});
