import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/master/login/index.astro');

test('master login page source accepts canonical login envelope instead of legacy success/token checks', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /fetch\('\/api\/master\/login'/);
  assert.match(page, /const isOkEnvelope = data && typeof data === 'object' && 'ok' in data && data\.ok === true;/);
  assert.match(page, /const sessionData = isOkEnvelope && 'data' in data && data\.data && typeof data\.data === 'object' \? data\.data : null;/);
  assert.match(page, /if \(!res\.ok \|\| !sessionData\) \{/);

  assert.doesNotMatch(page, /data && data\.success/);
  assert.doesNotMatch(page, /data && data\.token/);
});
