import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildAdminTabVisibility, resolveShopTier } from '../../lib/shop-tier.ts';

const pagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
const tabRenewPath = resolve(process.cwd(), 'src/components/admin/TabRenew.astro');

test('admin page source wires tier-based tab visibility from shop tier features', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import \{ buildAdminOrderChannelBillingView \} from '\.\.\/\.\.\/\.\.\/lib\/admin-order-channel-billing-view\.ts';/);
  assert.match(page, /const adminBillingView = buildAdminOrderChannelBillingView\(\s*\{\s*billing:\s*billingData,\s*shop,\s*settings,?\s*\}/s);
  assert.match(page, /const billingPlanTier = String\(rawShop\?\.billing_plan_type \|\| ''\)\.trim\(\);/);
  assert.match(page, /defaultShopTier: settings\.default_shop_tier \?\? settings\.defaultShopTier,/);
  assert.match(page, /shop_tier_mode: hasTierMode \|\| hasTierOverride \? rawShop\?\.shop_tier_mode : billingPlanTier \? 'override' : rawShop\?\.shop_tier_mode,/);
  assert.match(page, /shop_tier_override: hasTierMode \|\| hasTierOverride \? rawShop\?\.shop_tier_override : billingPlanTier \|\| rawShop\?\.shop_tier_override,/);
  assert.match(page, /const billingPlanType = shopTierView\.effectiveTier;/);
  assert.match(page, /const \{ showStatsTab, showMarketingTab, showCustomersTab \} = buildAdminTabVisibility\(shopTierView\);/);
  assert.match(page, /<AdminTabs showReservationTab=\{showReservationTab\} showStatsTab=\{showStatsTab\} showMarketingTab=\{showMarketingTab\} showCustomersTab=\{showCustomersTab\} \/>/);
  assert.match(page, /\{showStatsTab && <TabStats \/>\}/);
  assert.match(page, /\{showMarketingTab && <TabMarketing shopSlug=\{slug\} shopSettings=\{settings\} \/>\}/);
  assert.match(page, /\{showCustomersTab && <TabCustomers shopSlug=\{slug\} \/>\}/);
  assert.doesNotMatch(page, /billing_plan_type:\s*billingData\.plan_type \?\? rawShop\?\.billing_plan_type,/);
  assert.doesNotMatch(page, /delivery_commission_value:\s*billingData\.delivery_commission_value/);
  assert.doesNotMatch(page, /reservation_commission_value:\s*billingData\.reservation_commission_value/);
  assert.doesNotMatch(page, /commissionValue = Number\(shop\.commission_value \|\| 30\)/);
  assert.doesNotMatch(page, /每月1号自动扣费/);
  assert.doesNotMatch(page, /下次扣费日/);
});

test('admin tabs source keeps tier-gated tabs opt-in and renders expected labels', async () => {
  const adminTabsPath = resolve(process.cwd(), 'src/components/admin/AdminTabs.astro');
  const adminTabs = await readFile(adminTabsPath, 'utf8');

  assert.match(adminTabs, /const \{ showReservationTab = true, showStatsTab = false, showMarketingTab = false, showCustomersTab = false \} = Astro\.props;/);
  assert.match(adminTabs, /\{showStatsTab && <button data-admin-action="show-tab" data-tab-name="stats" id="btn-stats">📊 统计<\/button>\}/);
  assert.match(adminTabs, /\{showMarketingTab && <button data-admin-action="show-tab" data-tab-name="marketing" id="btn-marketing">🎯 营销<\/button>\}/);
  assert.match(adminTabs, /\{showCustomersTab && <button data-admin-action="show-tab" data-tab-name="customers" id="btn-customers">👥 客户<\/button>\}/);
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
