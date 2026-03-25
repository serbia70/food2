import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
const tabRenewPath = resolve(process.cwd(), 'src/components/admin/TabRenew.astro');

test('admin page source wires the admin billing helper and removes monthly copy', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import \{ buildAdminOrderChannelBillingView \} from '\.\.\/\.\.\/\.\.\/lib\/admin-order-channel-billing-view\.ts';/);
  assert.match(page, /const adminBillingView = buildAdminOrderChannelBillingView\(\s*\{\s*billing:\s*billingData,\s*shop,\s*settings,?\s*\}/s);
  assert.match(page, /adminBillingView\.walletCopy/);
  assert.match(page, /adminBillingView\.walletHint/);
  assert.match(page, /reservationPlan=\{adminBillingView\.reservationPlan\}/);
  assert.match(page, /deliveryPlan=\{adminBillingView\.deliveryPlan\}/);
  assert.match(page, /const commissionValue = adminBillingView\.deliveryPlan\.commissionValue;/);
  assert.doesNotMatch(page, /delivery_commission_value:\s*billingData\.delivery_commission_value/);
  assert.doesNotMatch(page, /reservation_commission_value:\s*billingData\.reservation_commission_value/);
  assert.doesNotMatch(page, /commissionValue = Number\(shop\.commission_value \|\| 30\)/);
  assert.doesNotMatch(page, /每月1号自动扣费/);
  assert.doesNotMatch(page, /下次扣费日/);
});

test('renewal tab source renders split plan wallet copy', async () => {
  const tabRenew = await readFile(tabRenewPath, 'utf8');

  assert.match(tabRenew, /walletCopy/);
  assert.match(tabRenew, /walletHint/);
  assert.match(tabRenew, /balanceReminderText/);
  assert.match(tabRenew, /balanceReminderLevel/);
  assert.match(tabRenew, /reservationPlan\.displayText/);
  assert.match(tabRenew, /deliveryPlan\.displayText/);
  assert.match(tabRenew, /预订\s*\/\s*外卖余额/);
  assert.match(tabRenew, /仅用于预订/);
  assert.doesNotMatch(tabRenew, /每月1号/);
  assert.doesNotMatch(tabRenew, /订阅版月费/);
  assert.doesNotMatch(tabRenew, /商务版月费/);
  assert.doesNotMatch(tabRenew, /下次扣费日/);
});
