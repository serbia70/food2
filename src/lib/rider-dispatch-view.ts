import type { Rider } from '../types/index.ts';
import {
  buildRiderOrderMapUrl,
} from './rider-dispatch-map.ts';
import {
  getAdminDispatchStatusCopy,
  getCustomerDeliveryStatusCopy,
  getCustomerOrderStatusCopy,
  formatPickupEtaLabel,
  isAwaitingCourierOrder,
  isAdminActiveDeliveryStatus,
  isCustomerActiveStatus,
  isCustomerCompletedStatus,
  isCustomerDeliveryCompleteStatus,
  isCustomerDeliveryStatus,
  getAdminDeliveryActionFlags,
  isRiderDeliveringOrder,
  getDeliveryStatusTone,
  isRiderClaimableOrder,
  getRiderActionFlags,
  getRiderStatusHintCopy,
} from './rider-dispatch-status-copy.ts';

export {
  formatPickupEtaLabel,
  isAwaitingCourierOrder,
  getAdminDispatchStatusCopy,
  getCustomerOrderStatusCopy,
  getCustomerDeliveryStatusCopy,
  CUSTOMER_ACTIVE_STATUSES,
  CUSTOMER_DELIVERY_STATUSES,
  CUSTOMER_COMPLETED_STATUSES,
  ADMIN_ACTIVE_DELIVERY_STATUSES,
  isCustomerActiveStatus,
  isCustomerDeliveryStatus,
  isCustomerCompletedStatus,
  isCustomerDeliveryCompleteStatus,
  isAdminActiveDeliveryStatus,
  getAdminDeliveryActionFlags,
  isRiderDeliveringOrder,
  getDeliveryStatusTone,
  isRiderClaimableOrder,
  getRiderActionFlags,
  getRiderStatusHintCopy,
} from './rider-dispatch-status-copy.ts';
export { buildRiderOrderMapUrl } from './rider-dispatch-map.ts';

export function buildRiderOrderView(order: {
  status?: string | null;
  shopName?: string | null;
  restaurantName?: string | null;
  shopAddress?: string | null;
  restaurantAddress?: string | null;
  shopMapUrl?: string | null;
  deliveryMapUrl?: string | null;
  tableInfo?: string | null;
  deliveryAddress?: string | null;
  courierName?: string | null;
  courierPhone?: string | null;
  courier_phone?: string | null;
  totalAmount?: number | string | null;
  pickupEtaMinutes?: number | string | null;
}) {
  const status = String(order?.status || '').trim();
  const shopName = String(order?.shopName || order?.restaurantName || '店铺').trim();
  const shopAddress = String(order?.shopAddress || order?.restaurantAddress || '').trim();
  const deliveryAddress = String(order?.tableInfo || order?.deliveryAddress || '').trim();

  return {
    shopName,
    shopAddress,
    shopMapUrl: buildRiderOrderMapUrl(order?.shopMapUrl, shopAddress),
    deliveryAddress,
    deliveryMapUrl: buildRiderOrderMapUrl(order?.deliveryMapUrl, deliveryAddress),
    orderStatusCopy: getAdminDispatchStatusCopy(status === 'picked_up' ? 'delivering' : status),
    courierName: String(order?.courierName || '').trim(),
    courierPhone: String(order?.courierPhone || order?.courier_phone || '').trim(),
    totalAmount: Number(order?.totalAmount || 0) || 0,
    pickupEtaMinutes: Number(order?.pickupEtaMinutes || 0) || 0,
  };
}

export function pickAvailableRiders<T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'>>(riders: T[]): T[] {
  return riders.filter((rider) => rider.status === 'available' && String(rider.phone || '').trim() !== '');
}

export function buildContactableRiderRows<
  T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'> & { telegramChatId?: string | null; telegram_chat_id?: string | null },
>(riders: T[]): T[] {
  return pickAvailableRiders(riders).map((rider) => {
    const telegramChatId = String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
    return telegramChatId && !String(rider.telegramChatId || '').trim()
      ? { ...rider, telegramChatId }
      : rider;
  });
}
