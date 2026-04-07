import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/[slug]/index.astro');

test('shop page source uses single-retry fetch helper for info menu and home requests', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /import \{ fetchJsonWithSingleRetry \} from '\.\.\/\.\.\/lib\/public-page-fetch\.ts';/);
  assert.match(source, /const \[shopFetch, menuFetch\] = await Promise\.all\(\[\s*fetchJsonWithSingleRetry\(`\$\{API_BASE_URL\}\/\$\{encodeURIComponent\(slug\)\}\/info`\),\s*fetchJsonWithSingleRetry\(`\$\{API_BASE_URL\}\/\$\{encodeURIComponent\(slug\)\}\/menu`\),\s*\]\);/s);
  assert.match(source, /const homeFetch = await fetchJsonWithSingleRetry\(`\$\{API_BASE_URL\}\/api\/home`\);/);
  assert.match(source, /let shop: any = shopFetch\.data;/);
  assert.match(source, /const parsed = menuFetch\.data;/);
  assert.doesNotMatch(source, /const homeRes = await fetch\(`\$\{API_BASE_URL\}\/api\/home`\);/);
  assert.doesNotMatch(source, /fetch\(`\$\{API_BASE_URL\}\/\$\{encodeURIComponent\(slug\)\}\/info`\)/);
  assert.doesNotMatch(source, /fetch\(`\$\{API_BASE_URL\}\/\$\{encodeURIComponent\(slug\)\}\/menu`\)/);
});

test('shop page source only loads all table occupancy during tables mode', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /if \(mode === 'tables' && allTables\.length > 0\) \{/);
  assert.match(source, /await Promise\.all\(/);
  assert.match(source, /\$\{API_BASE_URL\}\/api\/order\/by_table\?slug=\$\{encodeURIComponent\(slug\)\}&table=\$\{encodeURIComponent\(key\)\}/);
});
