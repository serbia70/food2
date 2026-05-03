import { type OrderChannelFeePlan } from './order-channel-fees-view.ts';
import {
  firstValue,
  resolveBalanceReminderLevel,
  resolveBalanceReminderText,
  resolveSources,
  toNumber,
} from './admin-order-channel-billing-formatters.ts';
import {
  buildDeliveryPlan,
  buildReservationPlan,
  type AdminOrderChannelBillingDefaults,
} from './admin-order-channel-billing-plans.ts';

type BillingInput = Record<string, unknown>;

export type { AdminOrderChannelBillingDefaults } from './admin-order-channel-billing-plans.ts';

export type AdminOrderChannelBillingView = {
  billingBalanceRsd: number;
  billingAlertLevel: string;
  walletCopy: string;
  walletHint: string;
  balanceReminderText: string;
  balanceReminderLevel: string;
  reservationPlan: OrderChannelFeePlan;
  deliveryPlan: OrderChannelFeePlan;
};

export function buildAdminOrderChannelBillingView(
  input: BillingInput,
  defaults?: AdminOrderChannelBillingDefaults,
): AdminOrderChannelBillingView {
  const { billing } = resolveSources(input);
  const billingBalanceRsd = toNumber(firstValue(billing.balance_rsd, input.balance_rsd), 0);
  const balanceReminderLevel = resolveBalanceReminderLevel(billing, billingBalanceRsd);
  const reservationPlan = buildReservationPlan(input, defaults);
  const deliveryPlan = buildDeliveryPlan(input, defaults);

  return {
    billingBalanceRsd,
    billingAlertLevel: balanceReminderLevel,
    walletCopy: `预订 / 外卖余额：${billingBalanceRsd} RSD`,
    walletHint: '仅用于预订 / 外卖技术服务费，不包含堂食年费',
    balanceReminderText: resolveBalanceReminderText(balanceReminderLevel, billingBalanceRsd),
    balanceReminderLevel,
    reservationPlan,
    deliveryPlan,
  };
}
