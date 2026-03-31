import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/components/admin/AdminLoginForm.astro');

test('admin login form source accepts canonical login envelope instead of legacy success checks', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /fetch\('\/api\/admin\/login'/);
  assert.match(page, /var isOkEnvelope = data && typeof data === 'object' && 'ok' in data && data\.ok === true;/);
  assert.match(page, /var sessionData = isOkEnvelope && 'data' in data && data\.data && typeof data\.data === 'object' \? data\.data : null;/);
  assert.match(page, /if \(!res\.ok \|\| !sessionData\) \{/);

  assert.doesNotMatch(page, /data && data\.success/);
});
