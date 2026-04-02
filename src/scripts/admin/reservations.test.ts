import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const reservationsPath = resolve(process.cwd(), 'src/scripts/admin/reservations.ts');

test('reservations source defines retry fetch helper before using it', async () => {
  const source = await readFile(reservationsPath, 'utf8');

  assert.match(source, /async function fetchJSONWithRetry\(url: string, init\?: RequestInit\) \{/);
  assert.match(source, /const res = await fetch\(url, init\);/);
  assert.match(source, /const data = await res\.json\(\);/);
});

test('reservations source uses retry fetch and canonical list extraction', async () => {
  const source = await readFile(reservationsPath, 'utf8');

  assert.match(source, /const today = getLocalTodayISODate\(\);/);
  assert.match(source, /const \{ res, data \} = await fetchJSONWithRetry\(`\/api\/admin\/reservations\?date=\$\{today\}`\);/);
  assert.match(source, /if \(res\.status === 401 \|\| res\.status === 403\)/);
  assert.match(source, /if \(!res\.ok\) throw new Error\(String\(data\?\.error \|\| 'load_reservation_stats_failed'\)\);/);
  assert.match(source, /const items = extractReservations\(data\);/);
  assert.match(source, /const stats = items\.reduce\(/);

  assert.match(source, /const \{ res, data \} = await fetchJSONWithRetry\(`\/api\/admin\/reservations\$\{query\}`\);/);
  assert.match(source, /if \(!res\.ok\) \{/);
  assert.match(source, /throw new Error\(String\(data\?\.error \|\| 'load_reservations_failed'\)\);/);
  assert.match(source, /function extractReservations\(data: any\) \{/);
  assert.match(source, /return Array\.isArray\(data\)/);
  assert.match(source, /: Array\.isArray\(data\?\.reservations\)/);
  assert.match(source, /: Array\.isArray\(data\?\.data\?\.reservations\)/);
  assert.match(source, /const items = extractReservations\(data\);/);
  assert.match(source, /renderReservations\(items\);/);
});
