import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');

test('admin index source normalizes legacy and assets upload image URLs against API base', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const normalizeMenuImageUrl = \(raw: unknown\): string => \{/);
  assert.match(page, /if \(img\.startsWith\('\/uploads\/'\)\) return `\$\{API_BASE_URL\}\$\{img\}`;/);
  assert.match(page, /if \(img\.startsWith\('\/assets\/uploads\/'\)\) return `\$\{API_BASE_URL\}\$\{img\}`;/);
  assert.match(page, /img: normalizeMenuImageUrl\(p\?\.img \|\| p\?\.imageUrl\),/);
});
