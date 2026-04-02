import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');
const shopTablePath = resolve(process.cwd(), 'src/components/master/MasterShopManagementTable.astro');
const shopPanelsPath = resolve(process.cwd(), 'src/scripts/master/shop-panels.ts');
const shopDineInPanelPath = resolve(process.cwd(), 'src/components/master/MasterShopDineInPanel.astro');

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
  assert.match(page, /submitMasterShopTier: shopPanelBindings\.submitMasterShopTier,/);
  assert.match(page, /const shouldKeepMasterTabVisible = activeTab === 'dispatch' \|\| activeTab === 'riders';/);
  assert.match(page, /const shouldShowMasterContent = dashboardView\.pageState\.kind === 'ready' \|\| shouldKeepMasterTabVisible;/);
  assert.match(page, /if \(activeTab === 'riders' && shops\.length === 0 && !isUnauthorized\) \{/);
  assert.match(page, /const retryInitUrl = new URL\(MASTER_INIT_PROXY_PATH, Astro\.url\);/);
  assert.match(page, /const retryInitRes = await fetch\(retryInitUrl, \{/);
  assert.match(page, /if \(retryInitRes\.ok\) \{/);
  assert.match(page, /shops = Array\.isArray\(retryDataShops\) \? retryDataShops : shops;/);
  assert.match(page, /masterSettings = retryDataSettings && typeof retryDataSettings === 'object' \? retryDataSettings : masterSettings;/);
  assert.doesNotMatch(page, /if \(shouldKeepMasterTabVisible && shops\.length === 0 && !isUnauthorized\) \{/);
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
  assert.match(page, /dashboardView\.panels\.shopEdit/);
  assert.doesNotMatch(page, /shopEditPanelDefaults\.defaults\?\.reservationPlan/);
  assert.doesNotMatch(page, /shopEditPanelDefaults\.defaults\?\.deliveryPlan/);
});

test('shop management table source only consumes typed MasterShopView input', async () => {
  const table = await readFile(shopTablePath, 'utf8');

  assert.match(table, /import type \{ MasterShopView \} from '\.\.\/\.\.\/lib\/master-shop-view';/);
  assert.match(table, /const \{ shops = \[\] \} = Astro\.props as \{ shops: MasterShopView\[\] \};/);
  assert.match(table, /<th>版本<\/th>/);
  assert.match(table, /shop\.shopTier\.displayText/);
  assert.match(table, /shop\.shopTier\.sourceLabel/);
  assert.match(table, /data-status=\{shop\.shopStateLabel\}/);
  assert.match(table, /shop\.shopStateLabel/);
  assert.match(table, /shop\.shopStateReason && <div class="shop-state-reason">\{shop\.shopStateReason\}<\/div>/);

  assert.doesNotMatch(table, /today_revenue/);
  assert.doesNotMatch(table, /billing_balance_rsd/);
  assert.doesNotMatch(table, /settings\./);
  assert.doesNotMatch(table, /data-status=\{shop\.statusLabel\}/);
});

test('shop dine-in panel source exposes explicit shop tier save action and larger typography', async () => {
  const dineInPanel = await readFile(shopDineInPanelPath, 'utf8');

  assert.match(dineInPanel, /保存版本设置/);
  assert.match(dineInPanel, /submitMasterShopTier/);
  assert.match(dineInPanel, /font-size: 16px;/);
  assert.match(dineInPanel, /font-size: 15px;/);
  assert.match(dineInPanel, /side-feedback-strong/);
});

test('shop panels source saves shop first then syncs reservation plan', async () => {
  const shopPanels = await readFile(shopPanelsPath, 'utf8');

  assert.match(shopPanels, /form\.elements\.shopTierMode\.value = shop\.shopTier\?\.source === 'override' \? 'override' : 'global';/);
  assert.match(shopPanels, /form\.elements\.shopTierOverride\.value = shop\.shopTier\?\.effectiveTier \|\| 'subscription';/);
  assert.match(shopPanels, /form\.elements\.shopTierModeSelect\.value = form\.elements\.shopTierMode\.value;/);
  assert.match(shopPanels, /form\.elements\.shopTierOverrideSelect\.value = form\.elements\.shopTierOverride\.value;/);
  assert.match(shopPanels, /shopEditPanelDefaults\.defaults\?\.defaultShopTier === 'business' \? '商务版' : '会员版'/);
  assert.match(shopPanels, /const selectedTierMode = String\(form\.elements\.shopTierModeSelect\.value \|\| 'global'\);/);
  assert.match(shopPanels, /const selectedTierOverride = String\(form\.elements\.shopTierOverrideSelect\.value \|\| 'subscription'\);/);
  assert.match(shopPanels, /form\.elements\.shopTierMode\.value = selectedTierOverride === 'business' \? 'override' : selectedTierMode;/);
  assert.match(shopPanels, /form\.elements\.shopTierOverride\.value = selectedTierOverride;/);
  assert.match(shopPanels, /async function submitMasterShopTier\(form: HTMLFormElement, submitButton: HTMLButtonElement\)/);
  assert.match(shopPanels, /loadingText: '保存版本中\.\.\.'/);
  assert.match(shopPanels, /errorText: '保存版本失败'/);
  assert.match(shopPanels, /feedback\.textContent = toDebugErrorMessage\(data, errorText, res\.status\);/);
  assert.match(shopPanels, /function toDebugErrorMessage\(data: unknown, fallback: string, status: number\)/);
  assert.match(shopPanels, /submitMasterShopTier,/);
  assert.match(shopPanels, /const shop = findMasterShopById\(shopViews, shopId\);/);
  assert.match(shopPanels, /const payload = buildMasterShopEditPayload\(\{/);
  assert.match(shopPanels, /shopTierMode: form\.elements\.shopTierMode\.value,/);
  assert.match(shopPanels, /shopTierOverride: form\.elements\.shopTierOverride\.value,/);
  assert.match(shopPanels, /const selectedTier = String\(payload\.billing_plan_type \|\| payload\.billingPlanType \|\| 'subscription'\);/);
  assert.match(shopPanels, /payload\.subscription_enabled = selectedTier === 'subscription' \? 1 : 0;/);
  assert.match(shopPanels, /payload\.business_enabled = selectedTier === 'business' \? 1 : 0;/);
  assert.match(shopPanels, /endpoint: `\/api\/master\/shops\/\$\{encodeURIComponent\(String\(shopId\)\)\}`/);
  assert.match(shopPanels, /method: 'PUT'/);
  assert.match(shopPanels, /payload,/);
  assert.match(shopPanels, /async function submitShopPanelAction\(\{/);
  assert.match(shopPanels, /await submitShopPanelAction\(\{/);
  assert.match(shopPanels, /finally \{\s*submitBtn\.disabled = false;/s);
  assert.match(shopPanels, /action: String\(action \|\| ''\)\.trim\(\),/);
  assert.match(shopPanels, /const currentExpireDate = String\(shop\.dineInExpiresAt \|\| ''\)\.trim\(\) \|\| addYearsToDateOnly\(shop\.dineInBillingStartAt \|\| '', 1\);/);
  assert.match(shopPanels, /const expireDate =/);
  assert.match(shopPanels, /const updatePayload = buildMasterShopEditPayload\(\{/);
  assert.match(shopPanels, /enableDineIn: payload\.action === 'manual_stop' \? '0' : '1',/);
  assert.match(shopPanels, /const renewPayload = \{/);
  assert.match(shopPanels, /shopId: payload\.shopId,/);
  assert.match(shopPanels, /action: payload\.action,/);
  assert.match(shopPanels, /expiresAt: expireDate,/);
  assert.match(shopPanels, /expireDate,/);
  assert.match(shopPanels, /expire_date: expireDate,/);
  assert.match(shopPanels, /dine_in_expires_at: expireDate,/);
  assert.match(shopPanels, /endpoint: `\/api\/master\/shops\/\$\{encodeURIComponent\(String\(payload\.shopId\)\)\}`/);
  assert.match(shopPanels, /method: 'PUT'/);
  assert.match(shopPanels, /payload: renewPayload,/);
  assert.doesNotMatch(shopPanels, /endpoint: '\/api\/master\/shop-renew'/);
  assert.doesNotMatch(shopPanels, /action: manageAction,/);
  assert.doesNotMatch(shopPanels, /action: 'set_shop_plan'/);
  assert.doesNotMatch(shopPanels, /const manageAction =/);
  assert.doesNotMatch(shopPanels, /planType: payload\.enableReservation \? 'subscription' : 'none'/);
});
