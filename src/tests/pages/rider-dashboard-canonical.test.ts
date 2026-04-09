import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/rider/dashboard.astro');

test('rider dashboard source only uses camelCase order update fields', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /const dispatchMeta = readDispatchMetaFromRemarks\(o\.remarksJson\);/);
  assert.match(source, /const dispatchMeta = readDispatchMetaFromRemarks\(target\.remarksJson\);/);
  assert.match(source, /expectedCurrentStatus: 'awaiting_courier',/);
  assert.match(source, /expectedCurrentStatus: 'delivering',/);
  assert.match(source, /expectedCurrentStatus: 'picked_up',/);
  assert.match(source, /remarksJson: JSON\.stringify\(nextRemarks\),/);

  assert.doesNotMatch(source, /remarksJson \|\| o\.remarks_json/);
  assert.doesNotMatch(source, /remarksJson \|\| target\.remarks_json/);
  assert.doesNotMatch(source, /expected_current_status/);
  assert.doesNotMatch(source, /remarks_json/);
  assert.doesNotMatch(source, /courier_name/);
  assert.doesNotMatch(source, /courier_phone/);
});
