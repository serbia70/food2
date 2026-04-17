import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../config.ts';
import { proxyAdminRequest } from './admin-api-route.ts';
import { buildOrderItemTextLinesShared } from './order-items-shared.ts';
import { buildRiderOrderView } from './rider-dispatch.ts';
import { buildDispatchMetaRemarks, readDispatchMetaFromRemarks, type DispatchMeta } from './rider-dispatch.ts';
import { readOrderTelegramShopSlug } from './rider-progress-shared.ts';
import { buildForwardHeaders, readJsonObject, sendTelegramMessage } from './rider-route-shared.ts';

type RouteCookies = Parameters<APIRoute['POST']>[0]['cookies'];
type TelegramMessageRef = NonNullable<DispatchMeta['telegramMessageRef']>;

type OrderSummaryInput = {
  orderNo?: unknown;
  order_no?: unknown;
  shopName?: unknown;
  shop_name?: unknown;
  restaurantName?: unknown;
  restaurant_name?: unknown;
  shopAddress?: unknown;
  shop_address?: unknown;
  restaurantAddress?: unknown;
  restaurant_address?: unknown;
  shopMapUrl?: unknown;
  shop_map_url?: unknown;
  tableInfo?: unknown;
  table_info?: unknown;
  deliveryAddress?: unknown;
  delivery_address?: unknown;
  deliveryMapUrl?: unknown;
  delivery_map_url?: unknown;
  userPhone?: unknown;
  user_phone?: unknown;
  totalAmount?: unknown;
  total_amount?: unknown;
  scheduledFor?: unknown;
  scheduled_for?: unknown;
  items?: unknown;
  itemsJson?: unknown;
  items_json?: unknown;
};

export type AdminOrderSummary = {
  orderNo: string;
  shopName: string;
  shopAddress: string;
  shopMapUrl: string;
  address: string;
  deliveryMapUrl: string;
  phone: string;
  totalAmount: number;
  scheduledFor: string;
  itemSummary: string[];
};

function readTelegramMessageId(parsedResponse: Record<string, unknown> | null): number {
  const rawResult = parsedResponse?.result;
  return Number(
    (rawResult && typeof rawResult === 'object'
      ? (rawResult as { message_id?: unknown }).message_id
      : undefined)
    ?? parsedResponse?.message_id
    ?? 0,
  );
}

function readRawOrderSummary(body: Record<string, unknown>): OrderSummaryInput {
  return (body.orderSummary && typeof body.orderSummary === 'object')
    ? body.orderSummary as OrderSummaryInput
    : {};
}

function pickNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const candidate = String(value ?? '').trim();
    if (candidate) return candidate;
  }
  return '';
}

function pickPositiveNumberValue(...values: unknown[]): unknown {
  for (const value of values) {
    const candidate = Number(value);
    if (Number.isFinite(candidate) && candidate > 0) return value;
  }
  return undefined;
}

function pickNonEmptyItemsValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length > 0) return value;
      continue;
    }
    if (typeof value === 'string') {
      if (value.trim()) return value;
      continue;
    }
    if (value && typeof value === 'object') {
      if (Object.keys(value).length > 0) return value;
    }
  }
  return undefined;
}

export function readAdminOrderSummary(body: Record<string, unknown>, orderId: string): AdminOrderSummary {
  const raw = readRawOrderSummary(body);
  const itemSummary = buildOrderItemTextLinesShared(raw.items ?? raw.itemsJson ?? raw.items_json)
    .map((line) => line.replace(/^•\s*/, ''));

  const parsedTotalAmount = Number(raw.totalAmount ?? raw.total_amount);

  const orderView = buildRiderOrderView({
    shopName: String(raw.shopName ?? raw.shop_name ?? '').trim(),
    restaurantName: String(raw.restaurantName ?? raw.restaurant_name ?? '').trim(),
    shopAddress: String(raw.shopAddress ?? raw.shop_address ?? '').trim(),
    restaurantAddress: String(raw.restaurantAddress ?? raw.restaurant_address ?? '').trim(),
    shopMapUrl: String(raw.shopMapUrl ?? raw.shop_map_url ?? '').trim(),
    tableInfo: String(raw.tableInfo ?? raw.table_info ?? '').trim(),
    deliveryAddress: String(raw.deliveryAddress ?? raw.delivery_address ?? '').trim(),
    deliveryMapUrl: String(raw.deliveryMapUrl ?? raw.delivery_map_url ?? '').trim(),
    userPhone: String(raw.userPhone ?? raw.user_phone ?? '').trim(),
    totalAmount: raw.totalAmount ?? raw.total_amount,
  });

  return {
    orderNo: String(raw.orderNo ?? raw.order_no ?? orderId ?? '').trim(),
    shopName: orderView.shopName,
    shopAddress: orderView.shopAddress,
    shopMapUrl: orderView.shopMapUrl,
    address: orderView.deliveryAddress || '未提供地址',
    deliveryMapUrl: orderView.deliveryMapUrl,
    phone: String(raw.userPhone ?? raw.user_phone ?? '').trim() || '-',
    totalAmount: Number.isFinite(parsedTotalAmount) ? parsedTotalAmount : 0,
    scheduledFor: String(raw.scheduledFor ?? raw.scheduled_for ?? '').trim(),
    itemSummary,
  };
}

export function findAdminOrderRow(payload: unknown, orderId: string): Record<string, unknown> | null {
  const normalizedOrderId = String(orderId || '').trim();
  if (!payload) return null;

  const pickFromRow = (row: unknown): Record<string, unknown> | null => {
    if (!row || typeof row !== 'object') return null;
    const data = row as Record<string, unknown>;
    const id = String(data.id || data.orderId || data.order_id || '').trim();
    if (normalizedOrderId) return id === normalizedOrderId ? data : null;
    return id ? data : null;
  };

  if (Array.isArray(payload)) {
    for (const row of payload) {
      const found = pickFromRow(row);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const direct = pickFromRow(data);
    if (direct) return direct;

    const nestedData = data.data;
    if (Array.isArray(nestedData)) {
      for (const row of nestedData) {
        const found = pickFromRow(row);
        if (found) return found;
      }
    } else if (nestedData && typeof nestedData === 'object') {
      const nested = nestedData as Record<string, unknown>;
      const nestedDirect = pickFromRow(nested);
      if (nestedDirect) return nestedDirect;
      if (Array.isArray(nested.orders)) {
        for (const row of nested.orders) {
          const found = pickFromRow(row);
          if (found) return found;
        }
      }
    }

    if (Array.isArray(data.orders)) {
      for (const row of data.orders) {
        const found = pickFromRow(row);
        if (found) return found;
      }
    }
  }

  return null;
}

export function readAdminOrderShopSlug(payload: unknown, orderId: string): string {
  const row = findAdminOrderRow(payload, orderId);
  if (!row) return '';
  return readOrderTelegramShopSlug(row);
}

export function mergeAdminOrderSummarySources({
  body,
  fetchedRow,
  orderId,
}: {
  body: Record<string, unknown>;
  fetchedRow: Record<string, unknown> | null;
  orderId: string;
}): AdminOrderSummary {
  const bodyRaw = readRawOrderSummary(body);
  const fetchedRaw = fetchedRow && typeof fetchedRow === 'object'
    ? fetchedRow as OrderSummaryInput
    : {};

  return readAdminOrderSummary({
    orderSummary: {
      ...bodyRaw,
      orderNo: pickNonEmptyString(fetchedRaw.orderNo, fetchedRaw.order_no, bodyRaw.orderNo, bodyRaw.order_no, orderId),
      order_no: undefined,
      shopName: pickNonEmptyString(fetchedRaw.shopName, fetchedRaw.shop_name, bodyRaw.shopName, bodyRaw.shop_name),
      shop_name: undefined,
      restaurantName: pickNonEmptyString(fetchedRaw.restaurantName, fetchedRaw.restaurant_name, bodyRaw.restaurantName, bodyRaw.restaurant_name),
      restaurant_name: undefined,
      shopAddress: pickNonEmptyString(fetchedRaw.shopAddress, fetchedRaw.shop_address, bodyRaw.shopAddress, bodyRaw.shop_address),
      shop_address: undefined,
      restaurantAddress: pickNonEmptyString(fetchedRaw.restaurantAddress, fetchedRaw.restaurant_address, bodyRaw.restaurantAddress, bodyRaw.restaurant_address),
      restaurant_address: undefined,
      shopMapUrl: pickNonEmptyString(fetchedRaw.shopMapUrl, fetchedRaw.shop_map_url, bodyRaw.shopMapUrl, bodyRaw.shop_map_url),
      shop_map_url: undefined,
      tableInfo: pickNonEmptyString(fetchedRaw.tableInfo, fetchedRaw.table_info, bodyRaw.tableInfo, bodyRaw.table_info),
      table_info: undefined,
      deliveryAddress: pickNonEmptyString(fetchedRaw.deliveryAddress, fetchedRaw.delivery_address, bodyRaw.deliveryAddress, bodyRaw.delivery_address),
      delivery_address: undefined,
      deliveryMapUrl: pickNonEmptyString(fetchedRaw.deliveryMapUrl, fetchedRaw.delivery_map_url, bodyRaw.deliveryMapUrl, bodyRaw.delivery_map_url),
      delivery_map_url: undefined,
      userPhone: pickNonEmptyString(fetchedRaw.userPhone, fetchedRaw.user_phone, bodyRaw.userPhone, bodyRaw.user_phone),
      user_phone: undefined,
      totalAmount: pickPositiveNumberValue(fetchedRaw.totalAmount, fetchedRaw.total_amount, bodyRaw.totalAmount, bodyRaw.total_amount),
      total_amount: undefined,
      scheduledFor: pickNonEmptyString(fetchedRaw.scheduledFor, fetchedRaw.scheduled_for, bodyRaw.scheduledFor, bodyRaw.scheduled_for),
      scheduled_for: undefined,
      items: pickNonEmptyItemsValue(fetchedRaw.items, bodyRaw.items),
      itemsJson: pickNonEmptyItemsValue(fetchedRaw.itemsJson, fetchedRaw.items_json, bodyRaw.itemsJson, bodyRaw.items_json),
      items_json: undefined,
    },
  }, orderId);
}

export function readAdminOrderSummaryFromRow(row: Record<string, unknown>, orderId: string): AdminOrderSummary {
  return readAdminOrderSummary({ orderSummary: row }, orderId);
}

export async function fetchAdminOrderDetails({
  request,
  cookies,
  orderId,
}: {
  request: Request;
  cookies: RouteCookies;
  orderId: string;
}): Promise<{
  ok: boolean;
  found: boolean;
  shopSlug: string;
  remarksJson: string;
  orderSummary: AdminOrderSummary | null;
  orderRow: Record<string, unknown> | null;
  upstreamStatus?: number;
  upstreamBody?: string;
}> {
  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders`,
    method: 'GET',
  });
  const text = await res.text();
  if (!res.ok || !text) {
    return {
      ok: false,
      found: false,
      shopSlug: '',
      remarksJson: '',
      orderSummary: null,
      orderRow: null,
      upstreamStatus: res.status || 502,
      upstreamBody: text,
    };
  }
  const parsed = readJsonObject(text);
  if (!parsed) {
    return {
      ok: false,
      found: false,
      shopSlug: '',
      remarksJson: '',
      orderSummary: null,
      orderRow: null,
      upstreamStatus: res.status || 502,
      upstreamBody: text,
    };
  }
  const row = findAdminOrderRow(parsed, orderId);
  return {
    ok: true,
    found: Boolean(row),
    shopSlug: readAdminOrderShopSlug(parsed, orderId),
    remarksJson: row && typeof row === 'object' ? String(row.remarksJson || '').trim() : '',
    orderSummary: row ? readAdminOrderSummaryFromRow(row, orderId) : null,
    orderRow: row,
  };
}

export async function sendTelegramDispatchMessage({
  request,
  payload,
}: {
  request: Request;
  payload: Record<string, unknown>;
}): Promise<
  | {
    ok: true;
    responseText: string;
    parsedResponse: Record<string, unknown> | null;
    messageRef?: TelegramMessageRef;
  }
  | {
    ok: false;
    status: number;
    error: string;
    responseText: string;
    parsedResponse: Record<string, unknown> | null;
  }
> {
  const result = await sendTelegramMessage({ request, payload });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.error,
      responseText: result.responseText,
      parsedResponse: result.parsedResponse,
    };
  }

  const parsedResponse = result.parsedResponse;
  const chatId = String(payload.chat_id ?? payload.chatId ?? '').trim();
  const messageId = readTelegramMessageId(parsedResponse);
  return {
    ok: true,
    responseText: result.responseText,
    parsedResponse,
    ...(chatId && messageId > 0 ? { messageRef: { chatId, messageId } } : {}),
  };
}

export async function writeDispatchMetaRemarks({
  request,
  cookies,
  orderId,
  remarksJson,
  nextMeta,
}: {
  request: Request;
  cookies: RouteCookies;
  orderId: string;
  remarksJson: string;
  nextMeta: DispatchMeta;
}) {
  const nextRemarks = buildDispatchMetaRemarks(remarksJson, nextMeta);
  const remarksRes = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders/remarks`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      remarks: nextRemarks,
    }),
  });
  const remarksText = await remarksRes.text();
  const remarksPayload = readJsonObject(remarksText) || {};

  if (!remarksRes.ok || remarksPayload.success === false) {
    return {
      ok: false as const,
      status: remarksRes.status,
      upstreamBody: remarksText || JSON.stringify(remarksPayload),
    };
  }

  return {
    ok: true as const,
    remarksJson: JSON.stringify(nextRemarks),
  };
}

export async function persistTelegramMessageRef({
  request,
  cookies,
  orderId,
  remarksJson,
  messageRef,
}: {
  request: Request;
  cookies: RouteCookies;
  orderId: string;
  remarksJson: string;
  messageRef: TelegramMessageRef;
}) {
  return writeDispatchMetaRemarks({
    request,
    cookies,
    orderId,
    remarksJson,
    nextMeta: {
      ...readDispatchMetaFromRemarks(remarksJson),
      telegramMessageRef: messageRef,
    },
  });
}
