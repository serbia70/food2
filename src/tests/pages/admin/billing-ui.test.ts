import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildAdminTabVisibility, resolveShopTier } from '../../../lib/shop-tier.ts';

const pagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
const tabRenewPath = resolve(process.cwd(), 'src/components/admin/TabRenew.astro');

test('admin page source wires tier-based tab visibility from shop tier features', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import \{ buildAdminOrderChannelBillingView \} from '\.\.\/\.\.\/\.\.\/lib\/admin-order-channel-billing-view\.ts';/);
  assert.match(page, /const mergedAdminSettings = \{ \.\.\.masterSettings, \.\.\.settings \};/);
  assert.match(page, /const billingSettings = resolvedGlobalBillingSettings \|\| mergedAdminSettings;/);
  assert.match(page, /const adminBillingView = buildAdminOrderChannelBillingView\(\s*\{\s*billing:\s*billingData,\s*shop,\s*settings:\s*billingSettings,?\s*\}/s);
  assert.doesNotMatch(page, /const adminBillingView = buildAdminOrderChannelBillingView\(\s*\{\s*billing:\s*billingData,\s*shop,\s*settings:\s*mergedAdminSettings,?\s*\}/s);
  assert.match(page, /const billingPlanTier = String\(rawShop\?\.billingPlanType \|\| rawShop\?\.billing_plan_type \|\| ''\)\.trim\(\);/);
  assert.doesNotMatch(page, /const billingPlanTier = String\(rawShop\?\.billingPlanType \|\| ''\)\.trim\(\);/);
  assert.match(page, /const canonicalShopId = Number\(rawShop\?\.id \|\| fallbackHomeShop\?\.id \|\| 0\);/);
  assert.match(page, /const statusShopId = Number\(statusResp\.data\?\.shop_id \|\| 0\);/);
  assert.match(page, /if \(statusResp\.ok && statusShopId > 0 && canonicalShopId > 0 && statusShopId !== canonicalShopId\) \{/);
  assert.match(page, /const rawTableConfig = rawShop\.tableConfig \?\? rawShop\.table_config;/);
  assert.match(page, /table_config:\s*typeof rawTableConfig === 'string'\s*\? rawTableConfig\s*:\s*JSON\.stringify\(rawTableConfig \|\| \{\}\),/s);
  assert.match(page, /tableConfig:\s*typeof rawTableConfig === 'string'\s*\? rawTableConfig\s*:\s*JSON\.stringify\(rawTableConfig \|\| \{\}\),/s);
  assert.match(page, /defaultShopTier: mergedAdminSettings\.defaultShopTier,/);
  assert.doesNotMatch(page, /defaultShopTier: settings\.defaultShopTier,/);
  assert.match(page, /shopTierMode: hasTierMode \|\| hasTierOverride \? rawShop\?\.shopTierMode : billingPlanTier \? 'override' : rawShop\?\.shopTierMode,/);
  assert.match(page, /shopTierOverride: hasTierMode \|\| hasTierOverride \? rawShop\?\.shopTierOverride : billingPlanTier \|\| rawShop\?\.shopTierOverride,/);
  assert.match(page, /const resolvedGlobalBillingSettings = isGlobalCommissionMode \? \{/);
  assert.match(page, /reservationCommissionType: masterSettings\.reservationCommissionType \?\? masterSettings\.reservation_commission_type \?\? masterSettings\.subscription_delivery_commission_type,/);
  assert.match(page, /reservationCommissionValue: masterSettings\.reservationCommissionValue \?\? masterSettings\.reservation_commission_value \?\? masterSettings\.subscription_delivery_commission_value,/);
  assert.match(page, /deliveryCommissionType: \(shopTierView\.effectiveTier === 'business' \? masterSettings\.business_delivery_commission_type : masterSettings\.subscription_delivery_commission_type\) \?\? masterSettings\.deliveryCommissionType \?\? masterSettings\.delivery_commission_type,/);
  assert.match(page, /deliveryCommissionValue: \(shopTierView\.effectiveTier === 'business' \? masterSettings\.business_delivery_commission_value : masterSettings\.subscription_delivery_commission_value\) \?\? masterSettings\.deliveryCommissionValue \?\? masterSettings\.delivery_commission_value,/);
  assert.doesNotMatch(page, /rawShop\?\.shop_tier_mode/);
  assert.doesNotMatch(page, /rawShop\?\.shop_tier_override/);
  assert.match(page, /const billingPlanType = shopTierView\.effectiveTier;/);
  assert.doesNotMatch(page, /const billingPlanType = String\(rawShop\?\.billingPlanType \|\| ''\)\.trim\(\);/);
  assert.match(page, /const \{ showStatsTab, showMarketingTab, showCustomersTab \} = buildAdminTabVisibility\(shopTierView\);/);
  assert.match(page, /<AdminTabs showReservationTab=\{showReservationTab\} showStatsTab=\{showStatsTab\} showMarketingTab=\{showMarketingTab\} showCustomersTab=\{showCustomersTab\} \/>/);
  assert.match(page, /\{showStatsTab && <TabStats \/>\}/);
  assert.match(page, /\{showMarketingTab && <TabMarketing shopSlug=\{slug\} shopSettings=\{settings\} \/>\}/);
  assert.match(page, /\{showCustomersTab && <TabCustomers shopSlug=\{slug\} \/>\}/);
  assert.doesNotMatch(page, /billing_plan_type:\s*billingData\.plan_type \?\? rawShop\?\.billing_plan_type,/);
  assert.doesNotMatch(page, /delivery_commission_value:\s*billingData\.delivery_commission_value/);
  assert.doesNotMatch(page, /reservation_commission_value:\s*billingData\.reservation_commission_value/);
  assert.doesNotMatch(page, /default_shop_tier/);
  assert.match(page, /orderNo: String\(o\?\.orderNo \|\| o\?\.order_no \|\| o\?\.id \|\| ''\),/);
  assert.match(page, /orderType: String\(o\?\.orderType \|\| o\?\.order_type \|\| \(String\(o\?\.tableInfo \|\| o\?\.table_info \|\| ''\)\.trim\(\) \? 'dine_in' : ''\)\),/);
  assert.match(page, /status: String\(o\?\.status \|\| \(String\(o\?\.tableInfo \|\| o\?\.table_info \|\| ''\)\.trim\(\) \? 'pending' : ''\)\),/);
  assert.match(page, /o\.status === 'pending' \|\| o\.status === 'confirmed' \|\| o\.status === 'awaiting_courier' \|\| o\.status === 'delivering'/);
  assert.match(page, /totalAmount: Number\(o\?\.totalAmount \?\? o\?\.total_amount \?\? 0\),/);
  assert.match(page, /itemsJson: normalizeJSONString\(o\?\.itemsJson \?\? o\?\.items_json, '\{\}'\),/);
  assert.match(page, /remarksJson: normalizeRemarkJSONString\(o\?\.remarksJson \?\? o\?\.remarks_json\),/);
  assert.match(page, /tableInfo: String\(o\?\.tableInfo \|\| o\?\.table_info \|\| ''\),/);
  assert.match(page, /userPhone: String\(o\?\.userPhone \|\| o\?\.user_phone \|\| ''\),/);
  assert.match(page, /scheduledFor: String\(o\?\.scheduledFor \|\| o\?\.scheduled_for \|\| ''\),/);
  assert.match(page, /pickupEtaMinutes: Number\(o\?\.pickupEtaMinutes \?\? o\?\.pickup_eta_minutes \?\? 0\),/);
  assert.match(page, /pickupReadyAt: String\(o\?\.pickupReadyAt \|\| o\?\.pickup_ready_at \|\| ''\),/);
  assert.match(page, /riderBroadcastedAt: String\(o\?\.riderBroadcastedAt \|\| o\?\.rider_broadcasted_at \|\| ''\),/);
  assert.match(page, /riderRemindCount: Number\(o\?\.riderRemindCount \?\? o\?\.rider_remind_count \?\? 0\),/);
  assert.match(page, /riderLastRemindedAt: String\(o\?\.riderLastRemindedAt \|\| o\?\.rider_last_reminded_at \|\| ''\),/);
  assert.match(page, /riderContactAttemptedAt: String\(o\?\.riderContactAttemptedAt \|\| o\?\.rider_contact_attempted_at \|\| ''\),/);
  assert.match(page, /courierName: String\(o\?\.courierName \|\| o\?\.courier_name \|\| ''\),/);
  assert.match(page, /courierPhone: String\(o\?\.courierPhone \|\| o\?\.courier_phone \|\| ''\),/);
  assert.match(page, /createdAt: String\(o\?\.createdAt \|\| o\?\.created_at \|\| ''\),/);
  assert.match(page, /isDeleted: Number\(o\?\.isDeleted \?\? o\?\.is_deleted \?\? 0\),/);
  assert.doesNotMatch(page, /orderType: String\(o\?\.orderType \|\| 'dine_in'\),/);
  assert.doesNotMatch(page, /status: String\(o\?\.status \|\| 'pending'\),/);
  assert.doesNotMatch(page, /orderType: String\(o\?\.orderType \|\| o\?\.order_type \|\| ''\),/);
  assert.doesNotMatch(page, /status: String\(o\?\.status \|\| ''\),/);
  assert.doesNotMatch(page, /order_no:/);
  assert.doesNotMatch(page, /order_type:/);
  assert.doesNotMatch(page, /total_amount:/);
  assert.doesNotMatch(page, /items_json:/);
  assert.doesNotMatch(page, /remarks_json:/);
  assert.doesNotMatch(page, /table_info:/);
  assert.doesNotMatch(page, /user_phone:/);
  assert.doesNotMatch(page, /scheduled_for:/);
  assert.doesNotMatch(page, /pickup_eta_minutes:/);
  assert.doesNotMatch(page, /pickup_ready_at:/);
  assert.doesNotMatch(page, /rider_broadcasted_at:/);
  assert.doesNotMatch(page, /rider_remind_count:/);
  assert.doesNotMatch(page, /rider_last_reminded_at:/);
  assert.doesNotMatch(page, /rider_contact_attempted_at:/);
  assert.doesNotMatch(page, /courier_name:/);
  assert.doesNotMatch(page, /courier_phone:/);
  assert.doesNotMatch(page, /created_at:/);
  assert.doesNotMatch(page, /is_deleted:/);
  assert.doesNotMatch(page, /commissionValue = Number\(shop\.commission_value \|\| 30\)/);
  assert.doesNotMatch(page, /每月1号自动扣费/);
  assert.doesNotMatch(page, /下次扣费日/);
});

test('admin tabs source removes legacy backup tab and keeps tier-gated tabs opt-in', async () => {
  const adminTabsPath = resolve(process.cwd(), 'src/components/admin/AdminTabs.astro');
  const adminTabs = await readFile(adminTabsPath, 'utf8');

  assert.match(adminTabs, /const \{ showReservationTab = true, showStatsTab = false, showMarketingTab = false, showCustomersTab = false \} = Astro\.props;/);
  assert.match(adminTabs, /\{showStatsTab && <button data-admin-action="show-tab" data-tab-name="stats" id="btn-stats">📊 统计<\/button>\}/);
  assert.match(adminTabs, /\{showMarketingTab && <button data-admin-action="show-tab" data-tab-name="marketing" id="btn-marketing">🎯 营销<\/button>\}/);
  assert.match(adminTabs, /\{showCustomersTab && <button data-admin-action="show-tab" data-tab-name="customers" id="btn-customers">👥 客户<\/button>\}/);
  assert.doesNotMatch(adminTabs, /data-tab-name="data"/);
  assert.doesNotMatch(adminTabs, /id="btn-data"/);
  assert.doesNotMatch(adminTabs, /💾 备份/);
});

test('buildAdminTabVisibility matches tier matrix for subscription and business', () => {
  assert.deepEqual(buildAdminTabVisibility(resolveShopTier({ defaultShopTier: 'subscription' })), {
    showStatsTab: true,
    showMarketingTab: false,
    showCustomersTab: false,
  });

  assert.deepEqual(buildAdminTabVisibility(resolveShopTier({ defaultShopTier: 'business' })), {
    showStatsTab: true,
    showMarketingTab: true,
    showCustomersTab: true,
  });
});

test('billing ui source preserves response status when loading billing records', async () => {
  const billingUiPath = resolve(process.cwd(), 'src/scripts/admin/billing-ui.ts');
  const billingUi = await readFile(billingUiPath, 'utf8');

  assert.match(billingUi, /async function fetchJSONWithRetry\(url: string, init\?: RequestInit\)/);
  assert.match(billingUi, /const res = await fetch\(url, init\);/);
  assert.match(billingUi, /const data = await res\.json\(\);/);
  assert.match(billingUi, /return \{ res, data \};/);
  assert.match(billingUi, /const \{ res, data \} = await fetchJSONWithRetry\('\/api\/admin\/billing'\);/);
  assert.match(billingUi, /const records = Array\.isArray\(data\?\.billing\?\.records\) \? data\.billing\.records : \[\];/);
  assert.match(billingUi, /if \(!res\.ok \|\| !data\.success \|\| !records\.length\)/);
  assert.match(billingUi, /if \(res\.status === 401 \|\| res\.status === 403\)/);
  assert.doesNotMatch(billingUi, /\/api\/admin\/billing\/records/);
});

test('renewal tab source renders split plan wallet copy', async () => {
  const tabRenew = await readFile(tabRenewPath, 'utf8');

  assert.match(tabRenew, /walletLabel/);
  assert.match(tabRenew, /walletAmountColor = billingBalanceRSD < 1000 \? '#dc2626' : '#2f855a'/);
  assert.match(tabRenew, /walletLabel\}：<span style=\{`color:\$\{walletAmountColor\};`\}>\{billingBalanceRSD\} RSD<\/span>/);
  assert.match(tabRenew, /font-size:24px/);
  assert.match(tabRenew, /font-size:14px; color:#64748b/);
  assert.match(tabRenew, /font-size:14px; color:#475569/);
  assert.match(tabRenew, /walletHint/);
  assert.match(tabRenew, /balanceReminderText/);
  assert.match(tabRenew, /balanceReminderLevel !== 'normal' \|\| balanceReminderText/);
  assert.match(tabRenew, /balanceReminderLevel/);
  assert.match(tabRenew, /reservationPlan\.displayText/);
  assert.match(tabRenew, /deliveryPlan\.displayText/);
  assert.doesNotMatch(tabRenew, /堂食已关闭/);
  assert.doesNotMatch(tabRenew, /到期日期：/);
  assert.doesNotMatch(tabRenew, /计费开始：/);
  assert.doesNotMatch(tabRenew, /停用原因：/);
  assert.match(tabRenew, /预订\s*\/\s*外卖余额/);
  assert.match(tabRenew, /仅用于预订/);
  assert.doesNotMatch(tabRenew, /每月1号/);
  assert.doesNotMatch(tabRenew, /订阅版月费/);
  assert.doesNotMatch(tabRenew, /商务版月费/);
  assert.doesNotMatch(tabRenew, /下次扣费日/);
});

test('admin menu source keeps import export entry after removing legacy backup area', async () => {
  const page = await readFile(pagePath, 'utf8');
  const tabMenuPath = resolve(process.cwd(), 'src/components/admin/TabMenu.astro');
  const tabMenu = await readFile(tabMenuPath, 'utf8');
  const dataScript = await readFile(resolve(process.cwd(), 'src/scripts/admin/data.ts'), 'utf8');

  assert.match(tabMenu, /data-admin-action="import-data"/);
  assert.match(tabMenu, /data-admin-action="export-data"/);
  assert.doesNotMatch(page, /import TabData from '\.\.\.\/\.\.\.\/components\/admin\/TabData\.astro';/);
  assert.doesNotMatch(page, /<TabData/);
  assert.match(dataScript, /String\(c\?\.categorySub \?\? c\?\.category_sub \?\? ''\)\.trim\(\) \|\| name/);
  assert.match(dataScript, /body: JSON\.stringify\(\{ name, sub_name: subName \|\| name \}\),/);
  assert.match(dataScript, /sub_name: String\(item\?\.subName \?\? item\?\.sub_name \?\? ''\)\.trim\(\) \|\| productName,/);
  assert.match(dataScript, /is_available: Number\(item\?\.isAvailable \?\? item\?\.is_available \?\? 1\),/);
  assert.match(dataScript, /category_id: categoryId,/);
});

test('admin settings source removes legacy order archive management area', async () => {
  const tabSettings = await readFile(resolve(process.cwd(), 'src/components/admin/TabSettings.astro'), 'utf8');
  const clickDelegation = await readFile(resolve(process.cwd(), 'src/scripts/admin/click-delegation.ts'), 'utf8');

  assert.doesNotMatch(tabSettings, /订单数据管理/);
  assert.doesNotMatch(tabSettings, /data-admin-action="load-order-stats"/);
  assert.doesNotMatch(tabSettings, /data-admin-action="archive-old-orders"/);
  assert.doesNotMatch(tabSettings, /data-admin-action="delete-archived-orders"/);
  assert.doesNotMatch(clickDelegation, /load-order-stats/);
  assert.doesNotMatch(clickDelegation, /archive-old-orders/);
  assert.doesNotMatch(clickDelegation, /delete-archived-orders/);
});

test('admin archive proxy route is removed', async () => {
  const archiveRoute = resolve(process.cwd(), 'src/pages/api/admin/orders/archive.ts');
  await assert.rejects(readFile(archiveRoute, 'utf8'));
});
