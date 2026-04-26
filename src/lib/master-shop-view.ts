import { buildDineInBillingState } from './dine-in-billing.ts';
import {
  readDisplayBillingStatus,
  readDisplayExpiryStatus,
  readDisplayShopState,
  readDisplayShopStateReason,
  readDisplayStatus,
  resolveBillingLabel,
  resolveBillingSeverity,
  resolveExpiryLabel,
  resolveExpirySeverity,
  resolveRowTone,
  resolveStatusLabel,
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
import { pickFirstMeaningfulValue } from './master-value-selection.ts';

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
  const slug = String(shop?.slug || '').trim();
  const status = String(shop?.status || '').trim();
  const billingStatus = String(shop?.billing_status || '').trim();
  const billingPlanType = String(shop?.billing_plan_type || 'subscription').trim() || 'subscription';
  const commissionType = String(shop?.commission_type || 'percentage').trim() || 'percentage';
  const commissionValue = toNumber(shop?.commission_value);
  const reservationPlan = buildReservationPlan(shop, options.defaults);
  const deliveryPlan = buildDeliveryPlan(shop, options.defaults);
  const enableReservation = reservationPlan.enabled;
  const enableDelivery = deliveryPlan.enabled;
  const enableDineIn = toNumber(pickFirstMeaningfulValue(shop?.enableDineIn, shop?.enable_dine_in)) !== 0;
  const todayOrders = toNumber(shop?.today_order_count);
  const todayRevenue = toNumber(shop?.today_revenue);
  const deliveryTodayOrders = toNumber(shop?.delivery_today_count);
  const deliveryTodayRevenue = toNumber(shop?.delivery_today_revenue);
  const dineInTodayOrders = toNumber(shop?.dine_in_today_count);
  const dineInTodayRevenue = toNumber(shop?.dine_in_today_revenue);
  const balanceRsd = toNumber(shop?.billing_balance_rsd);
  const monthCommissionRsd = toNumber(shop?.commission_month_rsd);
  const totalCommissionRsd = toNumber(shop?.commission_total_rsd);
  const fallbackExpiryLabel = resolveExpiryLabel(String(shop?.expire_date || ''), options.referenceDate);
  const billingLabel = resolveBillingLabel(billingStatus);
  const billingSeverity = resolveBillingSeverity(billingStatus);
  const walletRowTone = resolveRowTone(fallbackExpiryLabel, billingStatus);
  const dineInBilling = buildDineInBillingState(shop, options.referenceDate);

  let rowTone = walletRowTone;
  if (rowTone === 'normal' && dineInBilling.rowTone === 'warning') rowTone = 'billing-warning';
  if (rowTone === 'normal' && dineInBilling.rowTone === 'danger') rowTone = 'billing-overdue';
  if (rowTone === 'normal' && dineInBilling.rowTone === 'muted') rowTone = 'dine-in-closed';

  const displayStatus = readDisplayStatus(shop, resolveStatusLabel(status));
  const shopStateLabel = readDisplayShopState(shop, displayStatus);
  const shopStateReason = readDisplayShopStateReason(shop);

  const billingPlanTier = String(shop?.billing_plan_type || '').trim();
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
    slug,
    rawStatus: status,
    billingPlanType,
    commissionType,
    commissionValue,
    reservationPlan,
    deliveryPlan,
    enableDelivery,
    enableDineIn,
    enableReservation,
    shopStateLabel,
    shopStateReason,
    statusLabel: displayStatus,
    billingLabel: readDisplayBillingStatus(shop, billingLabel),
    expiryLabel: readDisplayExpiryStatus(shop, fallbackExpiryLabel),
    rowTone,
    dineInRowTone: dineInBilling.rowTone,
    billingSeverity,
    expirySeverity: resolveExpirySeverity(fallbackExpiryLabel),
    isDeliveryLocked: Boolean(shop?.delivery_locked),
    todayOrders,
    todayRevenue,
    deliveryTodayOrders,
    deliveryTodayRevenue,
    dineInTodayOrders,
    dineInTodayRevenue,
    balanceRsd,
    monthCommissionRsd,
    totalCommissionRsd,
    dineInBillingStartAt: dineInBilling.billingStartAt,
    dineInExpiresAt: dineInBilling.expiresAt,
    dineInGraceUntil: dineInBilling.graceUntil,
    dineInAlertLevel: dineInBilling.alertLevel,
    dineInStatusLabel: dineInBilling.statusLabel,
    shopTier,
    sortValueRevenue: todayRevenue,
    sortValueOrders: todayOrders,
    sortValueBalance: balanceRsd,
    copyStorefrontPath: `/${slug}`,
    copyAdminPath: `/admin/${slug}`,
  };
}
