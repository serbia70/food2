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

test('reservations source reuses shared completed status helper', async () => {
  const source = await readFile(reservationsPath, 'utf8');

  assert.match(source, /import\s+\{\s*CUSTOMER_COMPLETED_STATUSES\s*,\s*isCustomerCompletedStatus\s*\}\s+from\s+['"].*rider-dispatch/);
  assert.doesNotMatch(source, /function isCompletedStatus\(status: string \| null \| undefined\): boolean \{/);
  assert.match(source, /if \(isCustomerCompletedStatus\(status\)\) acc\.today_completed \+= 1;/);
  assert.match(source, /const isCompleted = isCustomerCompletedStatus\(item\.status\);/);
  assert.match(source, /const completedReservationStatus = CUSTOMER_COMPLETED_STATUSES\[0\];/);
  assert.match(source, /if \(typeof updateReservationStatus === 'function'\) updateReservationStatus\(id, completedReservationStatus\);/);
  assert.match(source, /if \(isCustomerCompletedStatus\(s\)\) return 'background:#dcfce7;color:#166534;';/);
  assert.match(source, /\[completedReservationStatus\]: '已到店 \/ Stigao'/);
  assert.doesNotMatch(source, /if \(status === 'completed'\) acc\.today_completed \+= 1;/);
  assert.doesNotMatch(source, /const isCompleted = item\.status === 'completed';/);
  assert.doesNotMatch(source, /updateReservationStatus\(id, 'completed'\)/);
  assert.doesNotMatch(source, /if \(s === 'completed'\) return 'background:#dcfce7;color:#166534;';/);
  assert.doesNotMatch(source, /completed: '已到店 \/ Stigao'/);
});
