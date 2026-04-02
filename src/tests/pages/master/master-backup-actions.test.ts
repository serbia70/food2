import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');
const backupActionsPath = resolve(process.cwd(), 'src/scripts/master/backup-actions.ts');

test('master page only initializes backup actions while backup tab is active', async () => {
  const page = await readFile(pagePath, 'utf8');
  const source = await readFile(backupActionsPath, 'utf8');

  assert.match(page, /const activeTab = normalizeMasterTab\(Astro\.url\.searchParams\.get\('tab'\)\);/);
  assert.match(page, /<script define:vars=\{\{ shopViewsData, shopEditPanelData, shopTopupPanelData, shopDineInPanelData, canLoadProtectedMasterActions, activeTab \}\} is:inline>/);
  assert.match(page, /activeTab,/);
  assert.match(page, /if \(runtimeState\.activeTab === 'backup'\) backupActionBindings\.handleDomContentLoaded\(\);/);

  assert.match(source, /async function loadMasterCodeBackups\(\) \{/);
  assert.match(source, /const res = await fetch\('\/api\/master\/backup', \{/);
  assert.match(source, /body: JSON\.stringify\(\{ action: 'list' \}\),/);
});
