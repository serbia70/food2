export type ShopTier = 'subscription' | 'business';
export type ShopTierMode = 'global' | 'override';

export type ShopTierView = {
  effectiveTier: ShopTier;
  source: 'global' | 'override';
  displayText: '会员版' | '商务版';
  sourceLabel: '来自全局' | '店铺覆盖';
  features: {
    marketing: boolean;
    vip: boolean;
    advancedAnalytics: boolean;
  };
};

export type AdminTabVisibility = {
  showStatsTab: boolean;
  showMarketingTab: boolean;
  showCustomersTab: boolean;
};

function normalizeTier(value: unknown, fallback: ShopTier = 'subscription'): ShopTier {
  return value === 'business' || value === 'subscription' ? value : fallback;
}

function normalizeMode(value: unknown): ShopTierMode {
  return value === 'override' ? 'override' : 'global';
}

export function resolveShopTier(
  input?: {
    defaultShopTier?: unknown;
    shopTierMode?: unknown;
    shopTierOverride?: unknown;
    shop_tier_mode?: unknown;
    shop_tier_override?: unknown;
  }
): ShopTierView {
  const defaultTier = normalizeTier(input?.defaultShopTier, 'subscription');
  const mode = normalizeMode(input?.shopTierMode ?? input?.shop_tier_mode);
  const originalOverride = input?.shopTierOverride ?? input?.shop_tier_override;
  const overrideValid = originalOverride === 'business' || originalOverride === 'subscription';

  const overrideTier = normalizeTier(originalOverride, defaultTier);
  const effectiveTier = mode === 'override' && overrideValid ? overrideTier : defaultTier;
  const source = mode === 'override' && overrideValid ? 'override' : 'global';
  const isBusiness = effectiveTier === 'business';

  return {
    effectiveTier,
    source,
    displayText: isBusiness ? '商务版' : '会员版',
    sourceLabel: source === 'override' ? '店铺覆盖' : '来自全局',
    features: {
      marketing: isBusiness,
      vip: isBusiness,
      advancedAnalytics: true, // 会员版也要有高级分析
    },
  };
}

export function buildAdminTabVisibility(shopTierView: ShopTierView): AdminTabVisibility {
  return {
    showStatsTab: shopTierView.features.advancedAnalytics,
    showMarketingTab: shopTierView.features.marketing,
    showCustomersTab: shopTierView.features.vip,
  };
}
