import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = dirname(__dirname);
const PAGE_PATH = join(REPO_ROOT, 'src/pages/[slug]/index.astro');

const astroContent = await readFile(PAGE_PATH, 'utf-8');

test('check that normalizeMenuImageUrl is present in [slug]/index.astro', () => {
  assert.match(astroContent, /normalizeMenuImageUrl/);
  assert.match(astroContent, /API_BASE_URL/);
  assert.match(astroContent, /img:\s*normalizeMenuImageUrl\(/);
});
