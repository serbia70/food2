import {
  readDisplayBillingStatus,
  readDisplayExpiryStatus,
  resolveExpirySeverity,
  toNumber,
} from './master-shop-view-formatters.ts';
import { type OrderChannelFeePlan } from './order-channel-fees-view.ts';
import { resolveShopTier, type ShopTierView } from './shop-tier.ts';
import {
  buildDeliveryPlan,
  buildReservationPlan,
  resolveShopViewOptions,
  type MasterShopViewDefaults,
  type MasterShopViewOptions,
} from './master-shop-view-model.ts';
import {
  buildMasterShopDisplayState,
  projectMasterShopMetrics,
} from './master-shop-view-core.ts';

type MasterShopInput = Record<string, unknown>;

export type MasterShopView = {
  id: number;
  name: string;
  slug: string;
  rawStatus: string;
  billingPlanType: string;
  commissionType: string;
  commissionValue: number;
  reservationPlan: OrderChannelFeePlan;
  deliveryPlan: OrderChannelFeePlan;
  enableDelivery: boolean;
  enableDineIn: boolean;
  enableReservation: boolean;
  shopStateLabel: string;
  shopStateReason: string;
  statusLabel: string;
  billingLabel: string;
  expiryLabel: string;
  rowTone: string;
  dineInRowTone: string;
  billingSeverity: number;
  expirySeverity: number;
  isDeliveryLocked: boolean;
  todayOrders: number;
  todayRevenue: number;
  deliveryTodayOrders: number;
  deliveryTodayRevenue: number;
  dineInTodayOrders: number;
  dineInTodayRevenue: number;
  balanceRsd: number;
  monthCommissionRsd: number;
  totalCommissionRsd: number;
  dineInBillingStartAt: string;
  dineInExpiresAt: string;
  dineInGraceUntil: string;
  dineInAlertLevel: string;
  dineInStatusLabel: string;
  shopTier: ShopTierView;
  sortValueRevenue: number;
  sortValueOrders: number;
  sortValueBalance: number;
  copyStorefrontPath: string;
  copyAdminPath: string;
};

export function buildMasterShopView(shop: MasterShopInput, referenceDateOrOptions?: string | Date | MasterShopViewOptions): MasterShopView {
  const options = resolveShopViewOptions(referenceDateOrOptions);
  const metrics = projectMasterShopMetrics(shop);
  const reservationPlan = buildReservationPlan(shop, options.defaults);
  const deliveryPlan = buildDeliveryPlan(shop, options.defaults);
  const enableReservation = reservationPlan.enabled;
  const enableDelivery = deliveryPlan.enabled;
  const displayState = buildMasterShopDisplayState(shop, options);

  const billingPlanTier = metrics.billingPlanType;
  const hasTierMode = String(shop?.shop_tier_mode ?? '').trim() !== '';
  const hasTierOverride = String(shop?.shop_tier_override ?? '').trim() !== '';
  const shopTier = resolveShopTier({
    defaultShopTier: options.defaults?.defaultShopTier,
    shop_tier_mode: hasTierMode || hasTierOverride ? shop.shop_tier_mode : billingPlanTier ? 'override' : shop.shop_tier_mode,
    shop_tier_override: hasTierMode || hasTierOverride ? shop.shop_tier_override : billingPlanTier || shop.shop_tier_override,
  });

  return {
    id: toNumber(shop?.id),
    name: String(shop?.name || '').trim() || '未命名店铺',
    slug: metrics.slug,
    rawStatus: metrics.status,
    billingPlanType: metrics.billingPlanType,
    commissionType: metrics.commissionType,
    commissionValue: metrics.commissionValue,
    reservationPlan,
    deliveryPlan,
    enableDelivery,
    enableDineIn: metrics.enableDineIn,
    enableReservation,
    shopStateLabel: displayState.shopStateLabel,
    shopStateReason: displayState.shopStateReason,
    statusLabel: displayState.displayStatus,
    billingLabel: readDisplayBillingStatus(shop, displayState.billingLabel),
    expiryLabel: readDisplayExpiryStatus(shop, displayState.fallbackExpiryLabel),
    rowTone: displayState.rowTone,
    dineInRowTone: displayState.dineInBilling.rowTone,
    billingSeverity: displayState.billingSeverity,
    expirySeverity: resolveExpirySeverity(displayState.fallbackExpiryLabel),
    isDeliveryLocked: metrics.isDeliveryLocked,
    todayOrders: metrics.todayOrders,
    todayRevenue: metrics.todayRevenue,
    deliveryTodayOrders: metrics.deliveryTodayOrders,
    deliveryTodayRevenue: metrics.deliveryTodayRevenue,
    dineInTodayOrders: metrics.dineInTodayOrders,
    dineInTodayRevenue: metrics.dineInTodayRevenue,
    balanceRsd: metrics.balanceRsd,
    monthCommissionRsd: metrics.monthCommissionRsd,
    totalCommissionRsd: metrics.totalCommissionRsd,
    dineInBillingStartAt: displayState.dineInBilling.billingStartAt,
    dineInExpiresAt: displayState.dineInBilling.expiresAt,
    dineInGraceUntil: displayState.dineInBilling.graceUntil,
    dineInAlertLevel: displayState.dineInBilling.alertLevel,
    dineInStatusLabel: displayState.dineInBilling.statusLabel,
    shopTier,
    sortValueRevenue: metrics.todayRevenue,
    sortValueOrders: metrics.todayOrders,
    sortValueBalance: metrics.balanceRsd,
    copyStorefrontPath: `/${metrics.slug}`,
    copyAdminPath: `/admin/${metrics.slug}`,
  };
}
