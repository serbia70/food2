import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const scriptPath = resolve(process.cwd(), 'src/scripts/admin/settings-ui.ts');

test('settings UI source accepts canonical ok responses when saving settings', async () => {
  const file = await readFile(scriptPath, 'utf8');

  assert.match(file, /const saveSucceeded = Boolean\(data && \(data\.success \|\| data\.ok === true\)\);/);
  assert.match(file, /if \(saveSucceeded\) \{/);
});

test('settings UI source preserves riders response status when loading driver list', async () => {
  const file = await readFile(scriptPath, 'utf8');

  assert.match(file, /async function fetchJSONWithRetry\(url: string, init\?: RequestInit\)/);
  assert.match(file, /const res = await fetch\(url, init\);/);
  assert.match(file, /const data = await res\.json\(\);/);
  assert.match(file, /return \{ res, data \};/);
  assert.match(file, /const \{ res, data \} = await fetchJSONWithRetry\('\/api\/rider\/status\?action=list_available'\);/);
  assert.match(file, /if \(res\.status === 401 \|\| res\.status === 403\)/);
  assert.match(file, /window\.location\.href = `\$\{window\.location\.pathname\.replace\(/);
  assert.match(file, /if \(!res\.ok\)/);
});

test('settings UI source removes legacy notify-rider wording', async () => {
  const file = await readFile(scriptPath, 'utf8');

  assert.doesNotMatch(file, /通知骑手/);
});
