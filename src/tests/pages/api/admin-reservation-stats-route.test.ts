import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const routePath = resolve(process.cwd(), 'src/pages/api/admin/reservation-stats.ts');

test('admin reservation stats route exists and proxies canonical upstream path', async () => {
  const source = await readFile(routePath, 'utf8');

  assert.match(source, /export const prerender = false;/);
  assert.match(source, /export const GET: APIRoute = async \(\{ request, cookies \}\) => \{/);
  assert.match(source, /url: `\$\{API_BASE_URL\}\/api\/admin\/reservation-stats`,/);
  assert.doesNotMatch(source, /reservations\/stats/);
});
