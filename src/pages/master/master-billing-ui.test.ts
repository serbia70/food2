import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');
const shopTablePath = resolve(process.cwd(), 'src/components/master/MasterShopManagementTable.astro');
const shopPanelsPath = resolve(process.cwd(), 'src/scripts/master/shop-panels.ts');

test('master page source only wires dashboard entry and payload helpers', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import \{ buildMasterDashboardView \} from '\.\.\/\.\.\/lib\/master-dashboard-view';/);
  assert.match(page, /const activeTab = normalizeMasterTab\(Astro\.url\.searchParams\.get\('tab'\)\);/);
  assert.match(
    page,
    /const dashboardView = buildMasterDashboardView\(\{\s*shops,\s*settings: masterSettings,\s*activeTab,\s*isUnauthorized,\s*loadError,\s*\}\);/s,
  );
  assert.match(page, /href="\/master\?tab=shops"/);
  assert.match(page, /href="\/master\?tab=backup"/);
  assert.match(page, /data-master-panel="shops"/);
  assert.match(page, /data-master-panel="backup"/);
  assert.doesNotMatch(page, /tab=management/);
  assert.doesNotMatch(page, /data-master-panel="management"/);
  assert.doesNotMatch(page, /const totals = shops\.reduce\(/);
  assert.doesNotMatch(page, /const settingsView = buildMasterSettingsView\(masterSettings\);/);
  assert.doesNotMatch(page, /const shopViews = shops\.map\(/);
  assert.doesNotMatch(page, /buildMasterShopView\(shop, \{/);
  assert.doesNotMatch(page, /buildMasterSettingsView\(masterSettings\)/);

  assert.match(page, /import \{ buildMasterPricingSettingsPayload \} from '\.\.\/\.\.\/lib\/master-pricing-settings-payload';/);
  assert.match(
    page,
    /import \{[\s\S]*buildMasterShopEditPayload,[\s\S]*MASTER_SHOP_FEE_FALLBACKS,[\s\S]*resetMasterShopFeeOverrides,[\s\S]*\} from '\.\.\/\.\.\/lib\/master-shop-edit-payload';/,
  );
  assert.match(page, /buildMasterPricingSettingsPayload,/);
  assert.match(page, /buildMasterShopEditPayload,/);
  assert.match(page, /dashboardView\.panels\.shopEdit/);
  assert.match(page, /dashboardView\.panels\.shopTopup/);
  assert.match(page, /dashboardView\.panels\.shopDineIn/);
  assert.match(page, /dashboardView\.pageState\.kind === 'ready'/);
  assert.match(page, /const dashboardActions = dashboardView\.actions;/);
  assert.match(page, /const activeNotice = hasDashboardNotices \? dashboardView\.notices\[0\] : null;/);
  assert.match(
    page,
    /<div class="settings-grid" data-master-panel="settings" hidden=\{activeTab !== 'settings' \|\| !shouldShowMasterContent\}>[\s\S]*<MasterSecurityCard \/>[\s\S]*<\/div>/,
  );
  assert.match(
    page,
    /<div class="settings-grid" data-master-panel="backup" hidden=\{activeTab !== 'backup' \|\| !shouldShowMasterContent\}>[\s\S]*<MasterBackupSettingsCard settings=\{dashboardView\.settings\.backup\} \/>[\s\S]*<MasterDataBackupCard \/>[\s\S]*<MasterCodeBackupCard \/>[\s\S]*<\/div>/,
  );
  assert.doesNotMatch(page, /const masterFeeDefaults =/);
  assert.doesNotMatch(page, /type MasterCta/);
  assert.doesNotMatch(page, /const MASTER_CTA =/);
  assert.doesNotMatch(page, /const heroCtas:/);
  assert.doesNotMatch(page, /const noticeCtas:/);
  assert.doesNotMatch(page, /const escapeHtml =/);
  assert.doesNotMatch(page, /const renderMasterCtasHtml =/);
  assert.doesNotMatch(page, /set:html=\{heroCtasHtml\}/);
  assert.doesNotMatch(page, /set:html=\{noticeCtasHtml\}/);
  assert.match(page, /buildMasterPricingSettingsPayload,/);
  assert.doesNotMatch(page, /buildMasterShopEditPayload\(Object\.fromEntries\(formData\.entries\(\)\)\)/);
  assert.match(page, /resetMasterShopFeeOverrides,/);
  assert.match(page, /shopEditPanelDefaults,/);
  assert.match(page, /masterShopFeeFallbacks: MASTER_SHOP_FEE_FALLBACKS/);
  assert.doesNotMatch(page, /shopEditPanelDefaults\.defaults\?\.reservationPlan/);
  assert.doesNotMatch(page, /shopEditPanelDefaults\.defaults\?\.deliveryPlan/);
});

test('shop management table source only consumes typed MasterShopView input', async () => {
  const table = await readFile(shopTablePath, 'utf8');

  assert.match(table, /import type \{ MasterShopView \} from '\.\.\/\.\.\/lib\/master-shop-view';/);
  assert.match(table, /const \{ shops = \[\] \} = Astro\.props as \{ shops: MasterShopView\[\] \};/);

  assert.doesNotMatch(table, /today_revenue/);
  assert.doesNotMatch(table, /billing_balance_rsd/);
  assert.doesNotMatch(table, /settings\./);
});

test('shop panels source saves shop first then syncs reservation plan', async () => {
  const shopPanels = await readFile(shopPanelsPath, 'utf8');

  assert.match(shopPanels, /async function submitShopPanelAction\(\{/);
  assert.match(shopPanels, /await submitShopPanelAction\(\{/);
  assert.match(shopPanels, /finally \{\s*submitBtn\.disabled = false;/s);
  assert.match(shopPanels, /endpoint: `\/api\/master\/shops\/\$\{encodeURIComponent\(String\(payload\.id\)\)\}`/);
  assert.match(
    shopPanels,
    /await submitShopPanelAction\(\{\s*submitBtn,\s*feedback,\s*loadingText: '保存中\.{3}',\s*endpoint: '\/api\/master\/shop-plan',\s*method: 'POST',\s*payload: \{\s*id: payload\.id,\s*planType: payload\.enableReservation \? 'subscription' : 'none',\s*\},/s,
  );
  assert.doesNotMatch(shopPanels, /endpoint: '\/api\/master\/manage'/);
  assert.doesNotMatch(shopPanels, /action: 'update_shop'/);
  assert.doesNotMatch(shopPanels, /action: 'set_shop_plan'/);
});
