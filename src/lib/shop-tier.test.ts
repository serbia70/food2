import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminTabVisibility, resolveShopTier } from './shop-tier.ts';

test('resolveShopTier uses global default when shop mode is global', () => {
  const view = resolveShopTier({
    defaultShopTier: 'business',
    shop_tier_mode: 'global',
    shop_tier_override: '',
  });

  assert.equal(view.effectiveTier, 'business');
  assert.equal(view.source, 'global');
  assert.equal(view.displayText, '商务版');
  assert.equal(view.sourceLabel, '来自全局');
  assert.equal(view.features.marketing, true);
  assert.equal(view.features.vip, true);
  assert.equal(view.features.advancedAnalytics, true);
});

test('resolveShopTier uses shop override when mode is override', () => {
  const view = resolveShopTier({
    defaultShopTier: 'subscription',
    shop_tier_mode: 'override',
    shop_tier_override: 'business',
  });

  assert.equal(view.effectiveTier, 'business');
  assert.equal(view.source, 'override');
  assert.equal(view.displayText, '商务版');
  assert.equal(view.sourceLabel, '店铺覆盖');
  assert.equal(view.features.marketing, true);
  assert.equal(view.features.vip, true);
  assert.equal(view.features.advancedAnalytics, true);
});

test('resolveShopTier falls back to subscription on invalid input', () => {
  const view = resolveShopTier({
    defaultShopTier: 'weird',
    shop_tier_mode: 'weird',
    shop_tier_override: 'vip',
  });

  assert.equal(view.effectiveTier, 'subscription');
  assert.equal(view.source, 'global');
  assert.equal(view.features.marketing, false);
  assert.equal(view.features.vip, false);
  assert.equal(view.features.advancedAnalytics, true); // 会员版也要有 advancedAnalytics
});

test('resolveShopTier uses defaultTier when overrideTier is invalid', () => {
  const view = resolveShopTier({
    defaultShopTier: 'business',
    shop_tier_mode: 'override',
    shop_tier_override: 'vip',
  });

  assert.equal(view.effectiveTier, 'business');
  assert.equal(view.source, 'global');
  assert.equal(view.displayText, '商务版');
  assert.equal(view.sourceLabel, '来自全局');
  assert.equal(view.features.marketing, true);
  assert.equal(view.features.vip, true);
  assert.equal(view.features.advancedAnalytics, true);
});

test('resolveShopTier uses defaultTier when overrideTier is undefined', () => {
  const view = resolveShopTier({
    defaultShopTier: 'subscription',
    shop_tier_mode: 'override',
    shop_tier_override: undefined,
  });

  assert.equal(view.effectiveTier, 'subscription');
  assert.equal(view.source, 'global');
  assert.equal(view.displayText, '会员版');
  assert.equal(view.sourceLabel, '来自全局');
  assert.equal(view.features.marketing, false);
  assert.equal(view.features.vip, false);
  assert.equal(view.features.advancedAnalytics, true); // 会员版也要有 advancedAnalytics
});

test('resolveShopTier defaults to subscription/global when input is undefined', () => {
  const view = resolveShopTier();

  assert.equal(view.effectiveTier, 'subscription');
  assert.equal(view.source, 'global');
  assert.equal(view.displayText, '会员版');
  assert.equal(view.sourceLabel, '来自全局');
  assert.equal(view.features.marketing, false);
  assert.equal(view.features.vip, false);
  assert.equal(view.features.advancedAnalytics, true); // 会员版也要有 advancedAnalytics
});

test('global business + shop override subscription => effectiveTier=subscription, source=override', () => {
  const view = resolveShopTier({
    defaultShopTier: 'business',
    shop_tier_mode: 'override',
    shop_tier_override: 'subscription',
  });

  assert.equal(view.effectiveTier, 'subscription');
  assert.equal(view.source, 'override');
  assert.equal(view.displayText, '会员版');
  assert.equal(view.sourceLabel, '店铺覆盖');
  assert.equal(view.features.marketing, false);
  assert.equal(view.features.vip, false);
  assert.equal(view.features.advancedAnalytics, true); // 会员版也要有 advancedAnalytics
});

test('buildAdminTabVisibility shows stats for subscription but hides marketing/customers', () => {
  const view = resolveShopTier({ defaultShopTier: 'subscription' });

  assert.deepEqual(buildAdminTabVisibility(view), {
    showStatsTab: true,
    showMarketingTab: false,
    showCustomersTab: false,
  });
});

test('buildAdminTabVisibility shows stats marketing and customers for business', () => {
  const view = resolveShopTier({ defaultShopTier: 'business' });

  assert.deepEqual(buildAdminTabVisibility(view), {
    showStatsTab: true,
    showMarketingTab: true,
    showCustomersTab: true,
  });
});

test('resolveShopTier accepts camelCase shop tier fields from admin page', () => {
  const view = resolveShopTier({
    defaultShopTier: 'subscription',
    shopTierMode: 'override',
    shopTierOverride: 'business',
  } as never);

  assert.equal(view.effectiveTier, 'business');
  assert.equal(view.source, 'override');
  assert.equal(view.displayText, '商务版');
  assert.equal(view.sourceLabel, '店铺覆盖');
});

test('resolveShopTier keeps global business tier when admin page passes merged master default', () => {
  const view = resolveShopTier({
    defaultShopTier: 'business',
    shopTierMode: '',
    shopTierOverride: '',
  } as never);

  assert.equal(view.effectiveTier, 'business');
  assert.equal(view.source, 'global');
  assert.equal(view.displayText, '商务版');
});
