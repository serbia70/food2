import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const corePath = resolve(process.cwd(), 'src/scripts/admin/core.ts');

test('admin tab restore source keeps active tab restoration on plain showTab call', async () => {
  const core = await readFile(corePath, 'utf8');

  assert.match(core, /export function showTab\(tabName: string\)/);
  assert.doesNotMatch(core, /skipLoad/);
});

test('admin tab loader source still contains visible-tab loaders only', async () => {
  const core = await readFile(corePath, 'utf8');

  assert.match(core, /if \(tabName === 'reservations'\) \{/);
  assert.match(core, /if \(tabName === 'renew'\) \{/);
  assert.match(core, /if \(tabName === 'marketing'\) \{/);
});
