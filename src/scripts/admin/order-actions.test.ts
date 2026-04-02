import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/scripts/admin/order-actions.ts');

test('order-actions source removes legacy remind/contact rider entries', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /registerAdminGlobal\('assign-rider'/);
  assert.match(source, /registerAdminGlobal\('auto-assign-rider'/);

  assert.doesNotMatch(source, /registerAdminGlobal\('remind-riders'/);
  assert.doesNotMatch(source, /registerAdminGlobal\('contact-riders'/);
  assert.doesNotMatch(source, /remindAwaitingOrder/);
  assert.doesNotMatch(source, /contactRidersForOrder/);
  assert.doesNotMatch(source, /getReminderCountFromDataset/);
  assert.doesNotMatch(source, /remindRiders\(/);
});
