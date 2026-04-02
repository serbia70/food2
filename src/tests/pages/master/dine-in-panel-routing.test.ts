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
  assert.match(panel, /onsubmit="return false;"/);
  assert.match(panel, /type="button" class="side-submit" onclick="return window\.submitMasterShopDineIn \? window\.submitMasterShopDineIn\(this\.form, 'extend_one_year', this\) : false;"/);
  assert.match(panel, /type="button" class="side-submit side-submit-alt" onclick="return window\.submitMasterShopDineIn \? window\.submitMasterShopDineIn\(this\.form, 'set_expiry', this\) : false;"/);
  assert.match(panel, /type="button" class="side-submit side-submit-danger" onclick="return window\.submitMasterShopDineIn \? window\.submitMasterShopDineIn\(this\.form, 'manual_stop', this\) : false;"/);
  assert.match(panel, /type="button" class="side-submit side-submit-safe" onclick="return window\.submitMasterShopDineIn \? window\.submitMasterShopDineIn\(this\.form, 'restore', this\) : false;"/);
});

test('master page source wires dine-in panel open/submit/close flow', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import MasterShopDineInPanel from '\.\.\/\.\.\/components\/master\/MasterShopDineInPanel\.astro';/);
  assert.match(page, /<MasterShopDineInPanel \/>/);

  assert.match(page, /import \{ initMasterShopPanels \} from '\.\.\/\.\.\/scripts\/master\/shop-panels';/);
  assert.match(page, /const shopPanelBindings = initMasterShopPanels\(/);
  assert.match(
    page,
    /Object\.assign\(window, \{[\s\S]*openMasterShopDineIn: shopPanelBindings\.openMasterShopDineIn,[\s\S]*submitMasterShopDineIn: shopPanelBindings\.submitMasterShopDineIn,[\s\S]*\}\);/,
  );
  assert.doesNotMatch(page, /window\.openMasterShopDineIn = shopPanelBindings\.openMasterShopDineIn;/);
  assert.doesNotMatch(page, /window\.submitMasterShopDineIn = shopPanelBindings\.submitMasterShopDineIn;/);
  assert.match(page, /<MasterShopDineInPanel \/>/);
  assert.match(page, /shopDineInPanelDefaults/);
  assert.match(page, /buildMasterShopEditPayload,/);
  assert.doesNotMatch(page, /function openShopDineInPanel\(shopId\)/);
  assert.doesNotMatch(page, /window\.submitMasterShopDineIn = async function \(form, action, submitButton\)/);
  assert.doesNotMatch(page, /window\.submitMasterShopDineIn = async function \(form, action, submitButton\)/);
});

test('management table source exposes dine-in subscription action button', async () => {
  const table = await readFile(tablePath, 'utf8');

  assert.match(table, />堂食订阅<\/button>/);
  assert.match(table, /window\.openMasterShopDineIn\(/);
});

test('admin table cards expose details trigger and wire it through table management', async () => {
  const tabTablesPath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');
  const clickDelegationPath = resolve(process.cwd(), 'src/scripts/admin/click-delegation.ts');
  const tableManagementPath = resolve(process.cwd(), 'src/scripts/admin/table-management.ts');

  const tabTables = await readFile(tabTablesPath, 'utf8');
  const clickDelegation = await readFile(clickDelegationPath, 'utf8');
  const tableManagement = await readFile(tableManagementPath, 'utf8');

  assert.match(tabTables, /table-details/);
  assert.match(clickDelegation, /table-details/);
  assert.match(tableManagement, /handleTableDetails/);
});

test('admin table details modal renders order remarks', async () => {
  const tableManagementPath = resolve(process.cwd(), 'src/scripts/admin/table-management.ts');
  const tableManagement = await readFile(tableManagementPath, 'utf8');

  assert.match(tableManagement, /备注/);
  assert.match(tableManagement, /order\.remarks/);
});

test('admin table details collection deduplicates repeated hidden order nodes', async () => {
  const tableManagementPath = resolve(process.cwd(), 'src/scripts/admin/table-management.ts');
  const tableManagement = await readFile(tableManagementPath, 'utf8');

  assert.match(tableManagement, /const seen = new Set<string>\(\)/);
  assert.match(tableManagement, /if \(seen\.has\(oidRaw\)\) return;/);
});

test('delivery cards avoid duplicate remark panel and remark action button', async () => {
  const tabTablesPath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');
  const tabTables = await readFile(tabTablesPath, 'utf8');

  assert.doesNotMatch(tabTables, /<section class="remark-ui">/);
  assert.doesNotMatch(tabTables, /data-admin-action="order-remarks"/);
  assert.match(tabTables, /📍 \{o\.tableInfo\}/);
  assert.doesNotMatch(tabTables, /📍 \{o\.table_info\}/);
});

test('delivery cards render awaiting_courier as Chinese copy', async () => {
  const tabTablesPath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');
  const tabTables = await readFile(tabTablesPath, 'utf8');

  assert.match(tabTables, /o\.status === 'awaiting_courier' \? '待骑手接单'/);
  assert.match(tabTables, /o\.status === 'delivering' \? '派送中' : o\.status/);
});

test('delivery cards source exposes assign and auto-assign actions without notify button', async () => {
  const tabTablesPath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');
  const tabTables = await readFile(tabTablesPath, 'utf8');

  assert.doesNotMatch(tabTables, /data-admin-action="open-delivery"/);
  assert.match(tabTables, /data-admin-action="assign-rider"/);
  assert.match(tabTables, /data-admin-action="auto-assign-rider"/);
  assert.match(tabTables, /已指派骑手/);
});

test('admin page source removes top billing and status cards grid', async () => {
  const adminPagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
  const adminPage = await readFile(adminPagePath, 'utf8');

  assert.doesNotMatch(adminPage, /钱包余额/);
  assert.doesNotMatch(adminPage, /外卖扣点门槛/);
  assert.doesNotMatch(adminPage, /外卖状态/);
  assert.doesNotMatch(adminPage, /堂食订阅提醒/);
  assert.doesNotMatch(adminPage, /缴费提醒/);
});

test('admin table cards source receives dine-in billing summary', async () => {
  const adminPagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
  const tabTablesPath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');

  const adminPage = await readFile(adminPagePath, 'utf8');
  const tabTables = await readFile(tabTablesPath, 'utf8');

  assert.match(adminPage, /billingPlanType=\{billingPlanType\}/);
  assert.match(adminPage, /dineInBillingExpiresAt=\{dineInBilling\.expiresAt\}/);
  assert.match(adminPage, /dineInBillingGraceUntil=\{dineInBilling\.graceUntil\}/);
  assert.match(adminPage, /dineInBillingStatusLabel=\{dineInBilling\.statusLabel\}/);
  assert.match(adminPage, /dineInToggleLabel=\{dineInToggleLabel\}/);
  assert.match(tabTables, /堂食订阅/);
});

test('reservation visibility source falls back from new fields to legacy shop toggle', async () => {
  const adminPagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
  const shopPagePath = resolve(process.cwd(), 'src/pages/[slug]/index.astro');

  const adminPage = await readFile(adminPagePath, 'utf8');
  const shopPage = await readFile(shopPagePath, 'utf8');

  assert.match(adminPage, /showReservationTab\s*=\s*adminBillingView\.reservationPlan\.enabled/);
  assert.match(shopPage, /const reservationEnabled = Number\(shop\?\.reservationEnabled \?\? settings\?\.reservationEnabled \?\? 1\) !== 0;/);
  assert.match(shopPage, /const enableReservation = reservationEnabled;/);
  assert.doesNotMatch(shopPage, /shop\?\.reservation_enabled\s*\?\?\s*settings\?\.reservation_enabled\s*\?\?\s*shop\?\.enableReservation\s*\?\?\s*shop\?\.enable_reservation\s*\?\?\s*settings\?\.subscription_enabled\s*\?\?\s*1/);
});

test('admin tabs source orders reservation before history', async () => {
  const adminTabsPath = resolve(process.cwd(), 'src/components/admin/AdminTabs.astro');
  const adminTabs = await readFile(adminTabsPath, 'utf8');

  const orderIndex = adminTabs.indexOf('data-tab-name="tables"');
  const reservationIndex = adminTabs.indexOf('data-tab-name="reservations"');
  const historyIndex = adminTabs.indexOf('data-tab-name="orders"');

  assert.notEqual(orderIndex, -1);
  assert.notEqual(reservationIndex, -1);
  assert.notEqual(historyIndex, -1);
  assert.ok(orderIndex < reservationIndex);
  assert.ok(reservationIndex < historyIndex);
  assert.match(adminTabs, /<button data-admin-action="show-tab" data-tab-name="tables" class="active" id="btn-tables">📱 订单 \(Active\)<\/button>/);
  assert.match(adminTabs, /<button data-admin-action="show-tab" data-tab-name="orders" id="btn-orders">📜 历史 \(History\)<\/button>/);
  assert.match(adminTabs, /<button data-admin-action="show-tab" data-tab-name="reservations" id="btn-reservations">📅 预约<\/button>/);
});
