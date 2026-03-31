import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const menuPath = resolve(process.cwd(), 'src/components/admin/TabMenu.astro');
const settingsPath = resolve(process.cwd(), 'src/components/admin/TabSettings.astro');

test('admin menu and settings source do not force local placeholder images over real data', async () => {
  const [menu, settings] = await Promise.all([
    readFile(menuPath, 'utf8'),
    readFile(settingsPath, 'utf8'),
  ]);

  assert.match(menu, /src=\{p\.img \|\| ''\}/);
  assert.match(menu, /data-fallback-src=""/);
  assert.match(settings, /src=\{settings\?\.logo \|\| shop\.logo \|\| ''\}/);
  assert.doesNotMatch(menu, /\/favicon\.svg/);
});
