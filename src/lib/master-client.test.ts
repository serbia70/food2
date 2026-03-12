import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

test('master SSR init 必须走同域 /api/master/init（不直连 API_BASE_URL）', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const masterIndexPath = resolve(here, '..', 'pages', 'master', 'index.astro');
  const source = readFileSync(masterIndexPath, 'utf8');

  assert.ok(source.includes("/api/master/init"), 'expected SSR to fetch /api/master/init');
  assert.ok(!source.includes('API_BASE_URL'), 'expected no API_BASE_URL usage in master page');
});
