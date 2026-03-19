import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const panelPath = resolve(process.cwd(), 'src/components/master/MasterShopDineInPanel.astro');
const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');
const tablePath = resolve(process.cwd(), 'src/components/master/MasterShopManagementTable.astro');

test('dine-in panel source exposes required ids, fields and actions', async () => {
  const panel = await readFile(panelPath, 'utf8');

  assert.match(panel, /id="master-shop-dinein-panel"/);
  assert.match(panel, /id="master-shop-dinein-form"/);
  assert.match(panel, /id="master-shop-dinein-feedback"/);
  assert.match(panel, /data-close-shop-dinein/);
  assert.match(panel, /name="shopId"/);
  assert.match(panel, /name="expiresAt"/);
  assert.match(panel, /type="date"/);
  assert.match(panel, /onsubmit="return window\.submitMasterShopDineIn \? window\.submitMasterShopDineIn\(this, event\) : false;"/);

  assert.match(panel, /value="extend_one_year"/);
  assert.match(panel, /value="set_expiry"/);
  assert.match(panel, /value="manual_stop"/);
  assert.match(panel, /value="restore"/);
});

test('master page source wires dine-in panel open/submit/close flow', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import MasterShopDineInPanel from '\.\.\/\.\.\/components\/master\/MasterShopDineInPanel\.astro';/);
  assert.match(page, /<MasterShopDineInPanel \/>/);

  assert.match(page, /window\.openMasterShopDineIn = function \(shopId\)/);
  assert.match(page, /openShopDineInPanel\(shopId\)/);
  assert.match(page, /function openShopDineInPanel\(shopId\)/);
  assert.match(page, /master-shop-dinein-panel/);
  assert.match(page, /master-shop-dinein-form/);
  assert.match(page, /master-shop-dinein-feedback/);

  assert.match(page, /dineInStatusLabel/);
  assert.match(page, /dineInBillingStartAt/);
  assert.match(page, /dineInExpiresAt/);
  assert.match(page, /dineInGraceUntil/);
  assert.match(page, /enableDineIn/);

  assert.match(page, /window\.submitMasterShopDineIn = (async )?function \(form, event\)/);
  assert.match(page, /fetch\('\/api\/master\/shop-renew'/);
  assert.match(page, /action/);
  assert.match(page, /expiresAt/);
  assert.match(page, /window\.location\.reload\(\)/);
  assert.match(page, /data-close-shop-dinein/);
});

test('management table source exposes dine-in subscription action button', async () => {
  const table = await readFile(tablePath, 'utf8');

  assert.match(table, />堂食订阅<\/button>/);
  assert.match(table, /window\.openMasterShopDineIn\(/);
});
