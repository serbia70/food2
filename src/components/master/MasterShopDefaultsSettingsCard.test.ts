import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cardPath = resolve(process.cwd(), 'src/components/master/MasterShopDefaultsSettingsCard.astro');

test('MasterShopDefaultsSettingsCard keeps canonical shop defaults form fields and submit hook', async () => {
  const source = await readFile(cardPath, 'utf8');

  assert.match(source, /submitMasterShopDefaultsSettings/);
  assert.match(source, /name="defaultCity"/);
  assert.match(source, /name="defaultOpenTime"/);
  assert.match(source, /name="defaultCloseTime"/);
  assert.match(source, /value=\{settings\.city\}/);
  assert.match(source, /value=\{settings\.hours\.open\}/);
  assert.match(source, /value=\{settings\.hours\.close\}/);
  assert.doesNotMatch(source, /shop_defaults/);
  assert.doesNotMatch(source, /default_city/);
  assert.doesNotMatch(source, /default_open_time/);
  assert.doesNotMatch(source, /default_close_time/);
});
