import type { AstroCookies } from 'astro';
import { proxyAdminRequest } from './admin-api-route.ts';
import { buildRiderOrderView } from './rider-dispatch.ts';
import { buildTelegramDeepLink } from './telegram-dispatch.ts';

export type AdminOrderReadResult =
  | {
    ok: true;
    order: Record<string, unknown> | null;
    remarksJson: string;
  }
  | {
    ok: false;
    status: number;
    upstreamBody: string;
  };

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

export function parseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function hasRecognizableOrderReadFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  if (record.success === false || record.ok === false) return true;

  const data = record.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

  const nested = data as Record<string, unknown>;
  return nested.success === false || nested.ok === false;
}

function readOrderId(row: Record<string, unknown>): string {
  return String(row.id || row.orderId || row.order_id || '').trim();
}

function pickMatchingOrderRow(row: unknown, orderId: string): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const normalizedOrderId = String(orderId || '').trim();
  const rowId = readOrderId(record);
  if (normalizedOrderId) return rowId === normalizedOrderId ? record : null;
  return rowId ? record : null;
}

function readOrderRowsFromRecord(record: Record<string, unknown>): Record<string, unknown>[] {
  const direct = pickMatchingOrderRow(record, '');
  if (direct) return [direct];

  const directOrder = pickMatchingOrderRow(record.order, '');
  if (directOrder) return [directOrder];

  const directOrders = Array.isArray(record.orders) ? record.orders : [];
  if (directOrders.length > 0) {
    return directOrders.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  return [];
}

function readOrderRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as Record<string, unknown>;
  const rootRows = readOrderRowsFromRecord(root);
  if (rootRows.length > 0) return rootRows;

  const data = root.data;
  if (Array.isArray(data)) {
    return data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    return readOrderRowsFromRecord(nested);
  }

  return [];
}

export function findAdminOrderRow(payload: unknown, orderId: string): Record<string, unknown> | null {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) return null;
  return readOrderRows(payload).find((row) => readOrderId(row) === normalizedOrderId) || null;
}

function readAdminOrderSummaryItems(row: Record<string, unknown>): Array<{ name?: unknown; quantity?: unknown }> {
  if (Array.isArray(row.items)) return row.items as Array<{ name?: unknown; quantity?: unknown }>;

  const rawItemsJson = row.itemsJson ?? row.items_json;
  if (typeof rawItemsJson !== 'string' || !rawItemsJson.trim()) return [];

  try {
    const parsed = JSON.parse(rawItemsJson) as unknown;
    return Array.isArray(parsed) ? parsed as Array<{ name?: unknown; quantity?: unknown }> : [];
  } catch {
    return [];
  }
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
  const userPhone = String(row.userPhone ?? row.user_phone ?? '').trim();
  const orderView = buildRiderOrderView({
    shopName: String(row.shopName ?? row.shop_name ?? '').trim(),
    restaurantName: String(row.restaurantName ?? row.restaurant_name ?? '').trim(),
    shopAddress: String(row.shopAddress ?? row.shop_address ?? '').trim(),
    restaurantAddress: String(row.restaurantAddress ?? row.restaurant_address ?? '').trim(),
    shopMapUrl: String(row.shopMapUrl ?? row.shop_map_url ?? '').trim(),
    tableInfo: String(row.tableInfo ?? row.table_info ?? '').trim(),
    deliveryAddress: String(row.deliveryAddress ?? row.delivery_address ?? '').trim(),
    deliveryMapUrl: String(row.deliveryMapUrl ?? row.delivery_map_url ?? '').trim(),
    userPhone,
    totalAmount: row.totalAmount ?? row.total_amount,
  });

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
  const orderView = buildRiderOrderView({
    shopName: String(row.shopName ?? row.shop_name ?? '').trim(),
    restaurantName: String(row.restaurantName ?? row.restaurant_name ?? '').trim(),
    shopAddress: String(row.shopAddress ?? row.shop_address ?? '').trim(),
    restaurantAddress: String(row.restaurantAddress ?? row.restaurant_address ?? '').trim(),
    shopMapUrl: String(row.shopMapUrl ?? row.shop_map_url ?? '').trim(),
    tableInfo: String(row.tableInfo ?? row.table_info ?? '').trim(),
    deliveryAddress: String(row.deliveryAddress ?? row.delivery_address ?? '').trim(),
    deliveryMapUrl: String(row.deliveryMapUrl ?? row.delivery_map_url ?? '').trim(),
    userPhone: String(row.userPhone ?? row.user_phone ?? '').trim(),
    totalAmount: row.totalAmount ?? row.total_amount,
  });
  const totalAmount = Number(row.totalAmount ?? row.total_amount);
  const pickupEtaMinutes = Number(row.pickupEtaMinutes ?? row.pickup_eta_minutes);
  const phone = String(row.userPhone ?? row.user_phone ?? '').trim();
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

export async function readAdminOrderById({
  request,
  cookies,
  apiBaseUrl,
  orderId,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
}): Promise<AdminOrderReadResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders`,
    method: 'GET',
  });
  const rawText = await upstream.text();
  const parsed = parseJsonValue(rawText);

  if (!upstream.ok || parsed == null || hasRecognizableOrderReadFailure(parsed)) {
    const status = upstream.ok ? 502 : (upstream.status || 502);
    return {
      ok: false,
      status,
      upstreamBody: rawText,
    };
  }

  const order = findAdminOrderRow(parsed, orderId);
  return {
    ok: true,
    order,
    remarksJson: order ? String(order.remarksJson || order.remarks_json || '').trim() : '',
  };
}

export async function readAdminAssignOrderDetails({
  request,
  cookies,
  apiBaseUrl,
  orderId,
}: {
  request: Request;
  cookies: AstroCookies;
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
