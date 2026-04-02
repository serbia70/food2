import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/admin/TabOrders.astro');

test('tab orders source removes legacy remind/contact rider buttons', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.doesNotMatch(source, /data-admin-action="remind-riders"/);
  assert.doesNotMatch(source, /data-admin-action="contact-riders"/);
});
