import { buildDineInBillingState } from './dine-in-billing.ts';
import {
  readDisplayShopState,
  readDisplayShopStateReason,
  readDisplayStatus,
  resolveBillingLabel,
  resolveBillingSeverity,
  resolveExpiryLabel,
  resolveRowTone,
  resolveStatusLabel,
  toNumber,
} from './master-shop-view-formatters.ts';
import { pickFirstMeaningfulValue } from './master-value-selection.ts';
import { type MasterShopViewOptions } from './master-shop-view-model.ts';

type MasterShopInput = Record<string, unknown>;

export function projectMasterShopMetrics(shop: MasterShopInput) {
  return {
    slug: String(shop?.slug || '').trim(),
    status: String(shop?.status || '').trim(),
    billingStatus: String(shop?.billing_status || '').trim(),
    billingPlanType: String(shop?.billing_plan_type || 'subscription').trim() || 'subscription',
    commissionType: String(shop?.commission_type || 'percentage').trim() || 'percentage',
    commissionValue: toNumber(shop?.commission_value),
    enableDineIn: toNumber(pickFirstMeaningfulValue(shop?.enableDineIn, shop?.enable_dine_in)) !== 0,
    todayOrders: toNumber(shop?.today_order_count),
    todayRevenue: toNumber(shop?.today_revenue),
    deliveryTodayOrders: toNumber(shop?.delivery_today_count),
    deliveryTodayRevenue: toNumber(shop?.delivery_today_revenue),
    dineInTodayOrders: toNumber(shop?.dine_in_today_count),
    dineInTodayRevenue: toNumber(shop?.dine_in_today_revenue),
    balanceRsd: toNumber(shop?.billing_balance_rsd),
    monthCommissionRsd: toNumber(shop?.commission_month_rsd),
    totalCommissionRsd: toNumber(shop?.commission_total_rsd),
    isDeliveryLocked: Boolean(shop?.delivery_locked),
  };
}

export function buildMasterShopDisplayState(
  shop: MasterShopInput,
  options: { referenceDate?: string | Date },
) {
  const status = String(shop?.status || '').trim();
  const billingStatus = String(shop?.billing_status || '').trim();
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

  return {
    displayStatus,
    shopStateLabel,
    shopStateReason,
    billingLabel,
    billingSeverity,
    fallbackExpiryLabel,
    rowTone,
    dineInBilling,
  };
}
