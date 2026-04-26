import { buildRiderOrderView } from './rider-dispatch.ts';
import { buildTelegramDeepLink } from './telegram-dispatch.ts';
import { readAdminOrderById } from './rider-route-admin-order-read.ts';
import {
  projectAdminOrderRowForView,
  readAdminOrderRowUserPhone,
  readAdminOrderSummaryItems,
} from './rider-route-admin-order-row.ts';

export interface AdminAssignOrderSummary {
  orderNo: string;
  shopName: string;
  shopMapUrl: string;
  address: string;
  deliveryMapUrl: string;
  phone: string;
  totalAmount: number;
  scheduledFor: string;
  itemSummary: string[];
}

export interface AdminPublishOrderMessageInput {
  shopName: string;
  address: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  phone: string;
  dashboardLink: string;
  shopMapUrl: string;
  deliveryMapUrl: string;
}

export interface AdminAssignOrderDetails {
  ok: boolean;
  shopSlug: string;
  remarksJson: string;
  orderSummary: AdminAssignOrderSummary | null;
}

function normalizeAdminOrderShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

export function readAdminOrderShopSlug(row: Record<string, unknown> | null | undefined): string {
  if (!row) return '';
  return normalizeAdminOrderShopSlug(row.shopSlug || row.shop_slug || row.restaurantSlug || row.restaurant_slug || '');
}

export function readAdminAssignOrderSummary(row: Record<string, unknown>): AdminAssignOrderSummary {
  const items = readAdminOrderSummaryItems(row);
  const parsedTotalAmount = Number(row.totalAmount ?? row.total_amount);
  const userPhone = readAdminOrderRowUserPhone(row);
  const orderView = buildRiderOrderView(projectAdminOrderRowForView(row));

  return {
    orderNo: String(row.orderNo ?? row.order_no ?? '').trim(),
    shopName: orderView.shopName,
    shopMapUrl: orderView.shopMapUrl,
    address: orderView.deliveryAddress || '未提供地址',
    deliveryMapUrl: orderView.deliveryMapUrl,
    phone: userPhone || '-',
    totalAmount: Number.isFinite(parsedTotalAmount) ? parsedTotalAmount : 0,
    scheduledFor: String(row.scheduledFor ?? row.scheduled_for ?? '').trim(),
    itemSummary: items
      .map((item) => {
        const name = String(item?.name || '').trim();
        const quantity = Number(item?.quantity || 0);
        if (!name || !Number.isFinite(quantity) || quantity <= 0) return '';
        return `${name} x${quantity}`;
      })
      .filter(Boolean),
  };
}

export function readAdminPublishOrderMessageInput(
  row: Record<string, unknown>,
  siteBaseUrl: string,
): AdminPublishOrderMessageInput {
  const orderView = buildRiderOrderView(projectAdminOrderRowForView(row));
  const totalAmount = Number(row.totalAmount ?? row.total_amount);
  const pickupEtaMinutes = Number(row.pickupEtaMinutes ?? row.pickup_eta_minutes);
  const phone = readAdminOrderRowUserPhone(row);
  const restaurantId = readAdminOrderShopSlug(row)
    || String(row.shopId ?? row.shop_id ?? '').trim();
  const dashboardLink = buildTelegramDeepLink({
    baseUrl: String(siteBaseUrl || '').trim().replace(/\/$/, '') || 'https://food2.serbia70.com',
    restaurantId,
    orderId: String(row.id ?? '').trim(),
  });

  return {
    shopName: orderView.shopName,
    address: orderView.deliveryAddress || '未提供地址',
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    pickupEtaMinutes: Number.isFinite(pickupEtaMinutes) ? pickupEtaMinutes : 0,
    phone,
    dashboardLink,
    shopMapUrl: orderView.shopMapUrl,
    deliveryMapUrl: orderView.deliveryMapUrl,
  };
}

export async function readAdminAssignOrderDetails({
  request,
  cookies,
  apiBaseUrl,
  orderId,
}: {
  request: Request;
  cookies: import('astro').AstroCookies;
  apiBaseUrl: string;
  orderId: string;
}): Promise<AdminAssignOrderDetails> {
  const result = await readAdminOrderById({
    request,
    cookies,
    apiBaseUrl,
    orderId,
  });
  if (!result.ok) {
    return {
      ok: false,
      shopSlug: '',
      remarksJson: '',
      orderSummary: null,
    };
  }

  return {
    ok: true,
    shopSlug: readAdminOrderShopSlug(result.order),
    remarksJson: result.remarksJson,
    orderSummary: result.order ? readAdminAssignOrderSummary(result.order) : null,
  };
}
