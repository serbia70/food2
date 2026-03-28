import { buildDineInBillingState } from './dine-in-billing.ts';
import { pickFirstMeaningfulValue } from './master-value-selection.ts';
import { buildOrderChannelFeePlan, type OrderChannelFeePlan } from './order-channel-fees-view.ts';
import { resolveShopTier, type ShopTierView } from './shop-tier.ts';

type MasterShopInput = Record<string, unknown>;

type MasterShopPlanDefaults = {
  enabled?: unknown;
  commissionType?: unknown;
  commissionValue?: unknown;
};

type MasterShopViewDefaults = {
  reservationPlan?: MasterShopPlanDefaults;
  deliveryPlan?: MasterShopPlanDefaults;
  defaultShopTier?: unknown;
};

type MasterShopViewOptions = {
  referenceDate?: string | Date;
  defaults?: MasterShopViewDefaults;
};

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

function toNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function resolveStatusLabel(status: string): string {
  if (status === 'active') return '营业中';
  if (status === 'disabled') return '已停用';
  if (status === 'expired') return '已过期';
  return status || '未知';
}

function readDisplayStatus(shop: MasterShopInput, fallback: string): string {
  const raw = String(shop?.display_status || '').trim();
  return raw || fallback;
}

function readDisplayShopState(shop: MasterShopInput, fallback: string): string {
  const raw = String(shop?.display_shop_state || '').trim();
  return raw || fallback;
}

function readDisplayShopStateReason(shop: MasterShopInput): string {
  return String(shop?.display_shop_state_reason || '').trim();
}

function readDisplayBillingStatus(shop: MasterShopInput, fallback: string): string {
  const raw = String(shop?.display_billing_status || '').trim();
  return raw || fallback;
}

function readDisplayExpiryStatus(shop: MasterShopInput, fallback: string): string {
  const raw = String(shop?.display_expiry_status || '').trim();
  return raw || fallback;
}

function resolveBillingLabel(status: string): string {
  if (status === 'past_due') return '逾期';
  if (status === 'warning') return '预警';
  if (status === 'active') return '正常';
  if (status === 'inactive') return '预警';
  return status ? '预警' : '未知';
}

function resolveBillingSeverity(status: string): number {
  if (status === 'past_due') return 3;
  if (status === 'warning') return 2;
  if (status === 'inactive') return 2;
  if (status === 'active') return 1;
  return 0;
}

function resolveExpiryLabel(expireDate: string, referenceDate?: string | Date): string {
  const raw = String(expireDate || '').trim();
  if (!raw) return '未设置';

  const expiry = new Date(raw);
  if (Number.isNaN(expiry.getTime())) return '未设置';

  const now = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(now.getTime())) return '未设置';
  const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return '已过期';
  if (days <= 7) return '即将到期';
  return '正常';
}

function resolveExpirySeverity(label: string): number {
  if (label === '已过期') return 3;
  if (label === '即将到期') return 2;
  if (label === '正常') return 1;
  return 0;
}

function resolveRowTone(expiryLabel: string, billingStatus: string): string {
  if (billingStatus === 'past_due') return 'billing-overdue';
  if (billingStatus === 'warning') return 'billing-warning';
  if (expiryLabel === '已过期') return 'expired';
  if (expiryLabel === '即将到期') return 'expiring';
  return 'normal';
}

function buildReservationPlan(shop: MasterShopInput, defaults?: MasterShopViewDefaults): OrderChannelFeePlan {
  const defaultPlan = defaults?.reservationPlan || {};
  return buildOrderChannelFeePlan({
    channel: 'reservation',
    scope: 'shop',
    enabled: pickFirstMeaningfulValue(shop?.reservation_enabled, shop?.enableReservation),
    commissionType: pickFirstMeaningfulValue(
      shop?.reservation_commission_type,
      shop?.subscriptionDeliveryCommissionType,
      shop?.subscription_delivery_commission_type,
    ),
    commissionValue: pickFirstMeaningfulValue(
      shop?.reservation_commission_value,
      shop?.subscriptionDeliveryCommissionValue,
      shop?.subscriptionFeeRsd,
      shop?.subscription_delivery_commission_value,
    ),
    legacyEnabled: pickFirstMeaningfulValue(shop?.enable_reservation, shop?.subscription_enabled),
    legacyCommissionType: pickFirstMeaningfulValue(shop?.subscriptionDeliveryCommissionType, shop?.subscription_delivery_commission_type),
    legacyCommissionValue: pickFirstMeaningfulValue(shop?.subscriptionDeliveryCommissionValue, shop?.subscription_delivery_commission_value),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 3,
  });
}

function buildDeliveryPlan(shop: MasterShopInput, defaults?: MasterShopViewDefaults): OrderChannelFeePlan {
  const defaultPlan = defaults?.deliveryPlan || {};
  const commissionMode = String(shop?.commission_mode || '').trim().toLowerCase();
  const overrideCommissionType =
    commissionMode === 'override'
      ? pickFirstMeaningfulValue(shop?.commission_override_type, shop?.commission_type)
      : undefined;
  const overrideCommissionValue =
    commissionMode === 'override'
      ? pickFirstMeaningfulValue(shop?.commission_override_value, shop?.commission_value)
      : undefined;

  return buildOrderChannelFeePlan({
    channel: 'delivery',
    scope: 'shop',
    enabled: pickFirstMeaningfulValue(shop?.delivery_enabled, shop?.enableDelivery),
    commissionType: pickFirstMeaningfulValue(
      shop?.delivery_commission_type,
      shop?.businessDeliveryCommissionType,
      shop?.business_delivery_commission_type,
      overrideCommissionType,
    ),
    commissionValue: pickFirstMeaningfulValue(
      shop?.delivery_commission_value,
      shop?.businessDeliveryCommissionValue,
      overrideCommissionValue,
      shop?.businessFeeRsd,
      shop?.business_delivery_commission_value,
    ),
    legacyEnabled: pickFirstMeaningfulValue(shop?.enable_delivery, shop?.business_enabled),
    legacyCommissionType: pickFirstMeaningfulValue(shop?.businessDeliveryCommissionType, shop?.business_delivery_commission_type),
    legacyCommissionValue: pickFirstMeaningfulValue(shop?.businessDeliveryCommissionValue, shop?.business_delivery_commission_value),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 5,
  });
}

function resolveShopViewOptions(value?: string | Date | MasterShopViewOptions) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return {
      referenceDate: value.referenceDate,
      defaults: value.defaults,
    };
  }

  return {
    referenceDate: value,
    defaults: undefined,
  };
}

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
