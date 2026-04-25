import type { Rider } from '../types/index.ts';

export function formatPickupEtaLabel(minutes: number | null | undefined): string {
  const value = Number(minutes || 0);
  return value > 0 ? `约 ${value} 分钟后可取` : '';
}

export function isAwaitingCourierOrder(order: { status?: string | null }): boolean {
  return String(order?.status || '') === 'awaiting_courier';
}

export function getAdminDispatchStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'awaiting_courier':
      return '待骑手接单';
    case 'delivering':
    case 'picked_up':
      return '配送中';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    case 'confirmed':
      return '已接单';
    default:
      return '待处理';
  }
}

export function getCustomerOrderStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'pending':
      return '等待接单';
    case 'confirmed':
      return '商家已接单';
    case 'awaiting_courier':
      return '待骑手接单';
    case 'cancelled':
    case 'closed':
      return '订单已关闭';
    default:
      return '';
  }
}

export function getCustomerDeliveryStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'delivering':
      return '送餐中';
    case 'picked_up':
      return '骑手已取餐，正在送达';
    case 'completed':
      return '已送达';
    default:
      return '';
  }
}

function sanitizeMapQueryAddress(value: string | null | undefined): string {
  const trimmed = String(value || '')
    .trim()
    .replace(/\s*\[货到付款\/Cash\].*$/u, '')
    .replace(/\s*\(备注:.*$/u, '')
    .trim();
  if (!trimmed) return '';

  const parts = trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const maybePhone = parts[1]?.replace(/\s+/g, '') || '';
    if (/^\+?\d[\d-]{5,}$/.test(maybePhone)) {
      return parts.slice(2).join(', ').trim();
    }
  }

  return trimmed;
}

export function buildRiderOrderMapUrl(rawUrl: string | null | undefined, fallbackAddress: string | null | undefined): string {
  const direct = String(rawUrl || '').trim();
  if (direct) return direct;
  const address = sanitizeMapQueryAddress(fallbackAddress);
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

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

export const CUSTOMER_ACTIVE_STATUSES = ['pending', 'confirmed', 'awaiting_courier', 'delivering', 'picked_up'] as const;
export const CUSTOMER_DELIVERY_STATUSES = ['delivering', 'picked_up', 'completed'] as const;
export const CUSTOMER_COMPLETED_STATUSES = ['completed'] as const;
export const ADMIN_ACTIVE_DELIVERY_STATUSES = ['pending', 'confirmed', 'awaiting_courier', 'delivering', 'picked_up'] as const;

export function isCustomerActiveStatus(status: string | null | undefined): boolean {
  return CUSTOMER_ACTIVE_STATUSES.includes(String(status || '').trim() as (typeof CUSTOMER_ACTIVE_STATUSES)[number]);
}

export function isCustomerDeliveryStatus(status: string | null | undefined): boolean {
  return CUSTOMER_DELIVERY_STATUSES.includes(String(status || '').trim() as (typeof CUSTOMER_DELIVERY_STATUSES)[number]);
}

export function isCustomerCompletedStatus(status: string | null | undefined): boolean {
  return CUSTOMER_COMPLETED_STATUSES.includes(String(status || '').trim() as (typeof CUSTOMER_COMPLETED_STATUSES)[number]);
}

export function isCustomerDeliveryCompleteStatus(status: string | null | undefined): boolean {
  return isCustomerDeliveryStatus(status);
}

export function isAdminActiveDeliveryStatus(status: string | null | undefined): boolean {
  return ADMIN_ACTIVE_DELIVERY_STATUSES.includes(String(status || '').trim() as (typeof ADMIN_ACTIVE_DELIVERY_STATUSES)[number]);
}

export function getAdminDeliveryActionFlags(status: string | null | undefined) {
  const value = String(status || '').trim();
  return {
    canAssign: value === 'pending' || value === 'confirmed' || value === 'awaiting_courier',
    canMarkPickedUp: value === 'delivering',
    canMarkDelivered: value === 'picked_up',
    canEdit: value === 'pending' || value === 'confirmed' || value === 'delivering',
    showAssignedRider: value === 'delivering' || value === 'picked_up',
  };
}

export function isRiderDeliveringOrder(status: string | null | undefined): boolean {
  const value = String(status || '').trim();
  return value === 'delivering' || value === 'picked_up';
}

export function getDeliveryStatusTone(status: string | null | undefined): 'default' | 'info' | 'success' | 'danger' {
  switch (String(status || '')) {
    case 'declined':
      return 'danger';
    case 'delivering':
      return 'info';
    case 'picked_up':
    case 'completed':
      return 'success';
    default:
      return 'default';
  }
}

export function isRiderClaimableOrder(order: {
  status?: string | null;
  courierPhone?: string | null;
}): boolean {
  return isAwaitingCourierOrder(order);
}

function readOrderCourierPhone(order: {
  courierPhone?: string | null;
  courier_phone?: string | null;
}): string {
  return String(order?.courierPhone || order?.courier_phone || '').trim();
}

export function getRiderActionFlags(
  order: {
    status?: string | null;
    courierPhone?: string | null;
    courier_phone?: string | null;
  },
  riderPhone?: string | null,
) {
  const status = String(order?.status || '').trim();
  const phone = String(riderPhone || '').trim();
  const orderPhone = readOrderCourierPhone(order);
  const isCurrentRider = !!phone && phone === orderPhone;

  return {
    canAccept: status === 'awaiting_courier',
    canDecline: status === 'awaiting_courier',
    canPickUp: status === 'delivering' && isCurrentRider,
    canComplete: status === 'picked_up' && isCurrentRider,
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

export function getRiderStatusHintCopy(status: string | null | undefined): string {
  switch (status) {
    case 'available':
      return '当前会进入派单名单并显示可抢订单';
    case 'busy':
      return '当前不会收到新派单，但可继续处理已接订单';
    default:
      return '当前不会进入派单名单';
  }
}
