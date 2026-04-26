import { buildOrderChannelFeePlan, type OrderChannelFeePlan } from './order-channel-fees-view.ts';
import {
  currentValue,
  firstCandidate,
  resolveBillingPlanType,
  resolveCommissionMode,
  resolveSources,
} from './admin-order-channel-billing-formatters.ts';

type BillingInput = Record<string, unknown>;

type BillingPlanDefaults = {
  enabled?: unknown;
  commissionType?: unknown;
  commissionValue?: unknown;
};

export type AdminOrderChannelBillingDefaults = {
  reservationPlan?: BillingPlanDefaults;
  deliveryPlan?: BillingPlanDefaults;
};

export function buildReservationPlan(input: BillingInput, defaults?: AdminOrderChannelBillingDefaults): OrderChannelFeePlan {
  const { billing, shop, settings } = resolveSources(input);
  const defaultPlan = defaults?.reservationPlan || {};
  const commissionMode = resolveCommissionMode(shop, settings);

  const enabledCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.reservationEnabled, source: 'new' },
        { value: shop.enableReservation, source: 'new' },
        { value: settings.reservationEnabled, source: 'new' },
        { value: settings.reservation_enabled, source: 'new' },
        { value: billing.reservationEnabled, source: 'new' },
      )
    : firstCandidate(
        { value: settings.reservationEnabled, source: 'new' },
        { value: settings.reservation_enabled, source: 'new' },
        { value: shop.reservationEnabled, source: 'new' },
        { value: shop.enableReservation, source: 'new' },
        { value: billing.reservationEnabled, source: 'new' },
      );

  const typeCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.reservationCommissionType, source: 'new' },
        { value: settings.reservationCommissionType, source: 'new' },
        { value: settings.reservation_commission_type, source: 'new' },
        { value: billing.reservationCommissionType, source: 'new' },
      )
    : firstCandidate(
        { value: settings.reservationCommissionType, source: 'new' },
        { value: settings.reservation_commission_type, source: 'new' },
        { value: shop.reservationCommissionType, source: 'new' },
        { value: billing.reservationCommissionType, source: 'new' },
      );

  const valueCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.reservationCommissionValue, source: 'new' },
        { value: settings.reservationCommissionValue, source: 'new' },
        { value: settings.reservation_commission_value, source: 'new' },
        { value: billing.reservationCommissionValue, source: 'new' },
      )
    : firstCandidate(
        { value: settings.reservationCommissionValue, source: 'new' },
        { value: settings.reservation_commission_value, source: 'new' },
        { value: shop.reservationCommissionValue, source: 'new' },
        { value: billing.reservationCommissionValue, source: 'new' },
      );

  return buildOrderChannelFeePlan({
    channel: 'reservation',
    scope: 'shop',
    enabled: currentValue(enabledCandidate),
    commissionType: currentValue(typeCandidate),
    commissionValue: currentValue(valueCandidate),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 3,
  });
}

export function buildDeliveryPlan(input: BillingInput, defaults?: AdminOrderChannelBillingDefaults): OrderChannelFeePlan {
  const { billing, shop, settings } = resolveSources(input);
  const defaultPlan = defaults?.deliveryPlan || {};
  const commissionMode = resolveCommissionMode(shop, settings);
  const billingPlanType = resolveBillingPlanType(shop);

  const enabledCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.deliveryEnabled, source: 'new' },
        { value: shop.enableDelivery, source: 'new' },
        { value: settings.deliveryEnabled, source: 'new' },
        { value: settings.delivery_enabled, source: 'new' },
        { value: billing.deliveryEnabled, source: 'new' },
      )
    : firstCandidate(
        { value: settings.deliveryEnabled, source: 'new' },
        { value: settings.delivery_enabled, source: 'new' },
        { value: shop.deliveryEnabled, source: 'new' },
        { value: shop.enableDelivery, source: 'new' },
        { value: billing.deliveryEnabled, source: 'new' },
      );

  const splitDeliveryType = billingPlanType === 'business'
    ? settings.business_delivery_commission_type
    : settings.subscription_delivery_commission_type;
  const splitDeliveryValue = billingPlanType === 'business'
    ? settings.business_delivery_commission_value
    : settings.subscription_delivery_commission_value;

  const typeCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.deliveryCommissionType, source: 'new' },
        { value: settings.deliveryCommissionType, source: 'new' },
        { value: settings.delivery_commission_type, source: 'new' },
        { value: splitDeliveryType, source: 'new' },
        { value: billing.deliveryCommissionType, source: 'new' },
      )
    : firstCandidate(
        { value: splitDeliveryType, source: 'new' },
        { value: settings.deliveryCommissionType, source: 'new' },
        { value: settings.delivery_commission_type, source: 'new' },
        { value: shop.deliveryCommissionType, source: 'new' },
        { value: billing.deliveryCommissionType, source: 'new' },
      );

  const valueCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.deliveryCommissionValue, source: 'new' },
        { value: settings.deliveryCommissionValue, source: 'new' },
        { value: settings.delivery_commission_value, source: 'new' },
        { value: splitDeliveryValue, source: 'new' },
        { value: billing.deliveryCommissionValue, source: 'new' },
      )
    : firstCandidate(
        { value: splitDeliveryValue, source: 'new' },
        { value: settings.deliveryCommissionValue, source: 'new' },
        { value: settings.delivery_commission_value, source: 'new' },
        { value: shop.deliveryCommissionValue, source: 'new' },
        { value: billing.deliveryCommissionValue, source: 'new' },
      );

  return buildOrderChannelFeePlan({
    channel: 'delivery',
    scope: 'shop',
    enabled: currentValue(enabledCandidate),
    commissionType: currentValue(typeCandidate),
    commissionValue: currentValue(valueCandidate),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 5,
  });
}
