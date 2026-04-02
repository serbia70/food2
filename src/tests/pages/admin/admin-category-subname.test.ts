import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');

test('admin index source preserves category subName from canonical menu payload', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /subName: String\(c\?\.subName \|\| ''\),/);
  assert.doesNotMatch(page, /sub_name: String\(c\?\.sub_name \|\| c\?\.subName \|\| ''\),/);
});
