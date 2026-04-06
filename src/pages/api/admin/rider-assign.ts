import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import {
  buildAssignedOrderStatusPayload,
  pickNextAvailableRider,
  readOnlineRiders,
  type AssignableRider,
} from '../../../lib/rider-assignment.ts';
import {
  buildAdminAssignedOrderTelegramMessage,
  buildTelegramShortClaimCallback,
} from '../../../lib/telegram-dispatch.ts';

export const prerender = false;

type RiderFetchResult =
  | { success: true; riders: AssignableRider[] }
  | { success: false; status: number; error: string; upstreamBody?: string };

type OrderSummaryItem = { name?: unknown; quantity?: unknown };
type OrderSummaryInput = {
  orderNo?: unknown;
  order_no?: unknown;
  tableInfo?: unknown;
  table_info?: unknown;
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

function readJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
}

function readOrderSummaryItems(raw: OrderSummaryInput): OrderSummaryItem[] {
  if (Array.isArray(raw.items)) return raw.items as OrderSummaryItem[];

  const rawItemsJson = raw.itemsJson ?? raw.items_json;
  if (typeof rawItemsJson !== 'string' || !rawItemsJson.trim()) return [];

  try {
    const parsed = JSON.parse(rawItemsJson) as unknown;
    return Array.isArray(parsed) ? parsed as OrderSummaryItem[] : [];
  } catch {
    return [];
  }
}

function readOrderSummary(body: Record<string, unknown>, orderId: string): {
  orderNo: string;
  address: string;
  phone: string;
  totalAmount: number;
  scheduledFor: string;
  itemSummary: string[];
} {
  const raw = (body.orderSummary && typeof body.orderSummary === 'object')
    ? body.orderSummary as OrderSummaryInput
    : {};
  const items = readOrderSummaryItems(raw);

  const parsedTotalAmount = Number(raw.totalAmount ?? raw.total_amount);

  return {
    orderNo: String(raw.orderNo ?? raw.order_no ?? orderId ?? '').trim(),
    address: String(raw.tableInfo ?? raw.table_info ?? '').trim() || '未提供地址',
    phone: String(raw.userPhone ?? raw.user_phone ?? '').trim() || '-',
    totalAmount: Number.isFinite(parsedTotalAmount) ? parsedTotalAmount : 0,
    scheduledFor: String(raw.scheduledFor ?? raw.scheduled_for ?? '').trim(),
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

function findOrderRow(payload: unknown, orderId: string): Record<string, unknown> | null {
  const normalizedOrderId = String(orderId || '').trim();
  if (!payload) return null;

  const pickFromRow = (row: unknown): Record<string, unknown> | null => {
    if (!row || typeof row !== 'object') return null;
    const data = row as Record<string, unknown>;
    const id = String(data.id || data.orderId || data.order_id || '').trim();
    if (id && normalizedOrderId && id !== normalizedOrderId) return null;
    return data;
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

function readOrderShopSlug(payload: unknown, orderId: string): string {
  const row = findOrderRow(payload, orderId);
  if (!row) return '';
  return String(row.shopSlug || row.shop_slug || row.restaurantSlug || row.restaurant_slug || '').trim();
}

function readOrderSummaryFromRow(row: Record<string, unknown>, orderId: string): {
  orderNo: string;
  address: string;
  phone: string;
  totalAmount: number;
  scheduledFor: string;
  itemSummary: string[];
} {
  return readOrderSummary({ orderSummary: row }, orderId);
}

async function fetchOrderDetails(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies'], orderId: string): Promise<{
  shopSlug: string;
  orderSummary: {
    orderNo: string;
    address: string;
    phone: string;
    totalAmount: number;
    scheduledFor: string;
    itemSummary: string[];
  } | null;
}> {
  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders`,
    method: 'GET',
  });
  const text = await res.text();
  if (!res.ok || !text) return { shopSlug: '', orderSummary: null };
  const parsed = readJsonObject(text);
  if (!parsed) return { shopSlug: '', orderSummary: null };
  const row = findOrderRow(parsed, orderId);
  return {
    shopSlug: readOrderShopSlug(parsed, orderId),
    orderSummary: row ? readOrderSummaryFromRow(row, orderId) : null,
  };
}

async function fetchAvailableRiders(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies']): Promise<RiderFetchResult> {
  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/riders`,
    method: 'GET',
  });
  const text = await res.text();
  const parsed = readJsonObject(text);

  if (!res.ok) {
    const error = typeof parsed?.error === 'string' && parsed.error.trim() ? parsed.error.trim() : 'riders_upstream_failed';
    return {
      success: false,
      status: res.status || 502,
      error,
      upstreamBody: text || undefined,
    };
  }

  return {
    success: true,
    riders: readOnlineRiders(parsed),
  };
}

async function notifyAssignedRider({
  request,
  rider,
  shopSlug,
  orderId,
  pickupEtaMinutes,
  orderSummary,
  fallbackChatId,
}: {
  request: Request;
  rider: AssignableRider;
  shopSlug: string;
  orderId: string;
  pickupEtaMinutes: number;
  orderSummary: {
    orderNo: string;
    address: string;
    phone: string;
    totalAmount: number;
    scheduledFor: string;
    itemSummary: string[];
  };
  fallbackChatId?: string;
}): Promise<
  | { success: true; chatId: string; chatIdSource: 'rider' | 'request'; shopSlug: string }
  | { success: false; error: string; chatId?: string; chatIdSource?: 'rider' | 'request' | 'missing'; shopSlug: string }
> {
  const riderChatId = String(readRiderChatId(rider) || '').trim();
  const requestChatId = String(fallbackChatId || '').trim();
  const chatId = String(riderChatId || requestChatId).trim();
  const chatIdSource = riderChatId ? 'rider' : requestChatId ? 'request' : 'missing';
  if (!chatId) return { success: false, error: 'telegram_chat_id_missing', chatIdSource, shopSlug };

  try {
    let claimCallbackData = '';
    try {
      claimCallbackData = buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId: Number(rider.id || 0),
        riderName: String(rider.name || '').trim(),
        riderPhone: String(rider.phone || '').trim(),
        restaurantId: String(shopSlug || 'admin').trim() || 'admin',
        telegramChatId: chatId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message !== 'missing_telegram_callback_secret') throw error;
      claimCallbackData = '';
    }

    const message = buildAdminAssignedOrderTelegramMessage({
      orderNo: orderSummary.orderNo,
      address: orderSummary.address,
      totalAmount: orderSummary.totalAmount,
      phone: orderSummary.phone,
      pickupEtaMinutes,
      scheduledFor: orderSummary.scheduledFor,
      itemSummary: orderSummary.itemSummary,
      claimCallbackData: claimCallbackData || undefined,
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cookie = request.headers.get('cookie') || '';
    if (cookie) headers.cookie = cookie;

    const response = await fetch(`${API_BASE_URL}/api/telegram/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        shop_slug: shopSlug,
        chat_id: chatId,
        text: message.text,
        reply_markup: message.replyMarkup,
      }),
    });
    const responseText = await response.text();
    if (!response.ok) {
      return {
        success: false,
        error: responseText.trim() || `telegram_send_http_${response.status}`,
        chatId,
        chatIdSource,
        shopSlug,
      };
    }
    return { success: true, chatId, chatIdSource, shopSlug };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'telegram_send_failed',
      chatId,
      chatIdSource,
      shopSlug,
    };
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || '').trim();
  const orderId = String(body.orderId || '').trim();
  const providedShopSlug = String(body.shopSlug || '').trim();
  const lastAssignedRiderId = String(body.lastAssignedRiderId || '').trim();
  const manualRiderId = String(body.riderId || '').trim();
  const pickupEtaMinutesRaw = Number(body.pickupEtaMinutes);
  const pickupEtaMinutes = Number.isFinite(pickupEtaMinutesRaw) ? pickupEtaMinutesRaw : 0;
  const riderTelegramChatId = String(body.riderTelegramChatId || '').trim();
  const debugTelegram = body.debugTelegram === true;

  if (action !== 'manual_assign' && action !== 'auto_assign') {
    return new Response(JSON.stringify({ success: false, error: 'invalid_action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!orderId) {
    return new Response(JSON.stringify({ success: false, error: 'order_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ridersResult = await fetchAvailableRiders(request, cookies);
  if (!ridersResult.success) {
    return new Response(JSON.stringify({
      success: false,
      error: ridersResult.error,
      upstream_status: ridersResult.status,
      ...(ridersResult.upstreamBody ? { upstream_body: ridersResult.upstreamBody } : {}),
    }), {
      status: ridersResult.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const riders = ridersResult.riders;
  let target: AssignableRider | null = null;

  if (action === 'manual_assign') {
    target = riders.find((row) => String(row.id || '').trim() === manualRiderId) || null;
  }

  if (action === 'auto_assign') {
    target = pickNextAvailableRider({ riders, lastAssignedRiderId });
  }

  if (!target) {
    return new Response(JSON.stringify({ success: false, error: 'no_available_riders' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updateRes = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders/${encodeURIComponent(orderId)}/status`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAssignedOrderStatusPayload({ rider: target, pickupEtaMinutes })),
  });

  const updateText = await updateRes.text();
  let updateJson: Record<string, unknown> = {};
  try {
    updateJson = JSON.parse(updateText) as Record<string, unknown>;
  } catch {
    updateJson = {};
  }

  if (!updateRes.ok || updateJson.success === false) {
    return new Response(JSON.stringify({
      success: false,
      error: 'order_update_failed',
      upstream_status: updateRes.status,
      upstream_body: updateText || JSON.stringify(updateJson),
    }), {
      status: updateRes.status || 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bodyOrderSummary = readOrderSummary(body, orderId);
  const needsOrderDetails = !providedShopSlug || bodyOrderSummary.orderNo === orderId;
  const fetchedOrderDetails = needsOrderDetails ? await fetchOrderDetails(request, cookies, orderId) : { shopSlug: '', orderSummary: null };
  const notifyShopSlug = providedShopSlug || fetchedOrderDetails.shopSlug;
  const orderSummary = fetchedOrderDetails.orderSummary && bodyOrderSummary.orderNo === orderId
    ? fetchedOrderDetails.orderSummary
    : bodyOrderSummary;
  const telegramNotification = await notifyAssignedRider({
    request,
    rider: target,
    shopSlug: notifyShopSlug,
    orderId,
    pickupEtaMinutes,
    orderSummary,
    fallbackChatId: riderTelegramChatId,
  });

  return new Response(JSON.stringify({
    success: true,
    rider: {
      id: target.id,
      name: target.name,
      phone: target.phone,
    },
    ...((!telegramNotification.success || debugTelegram) ? { telegram_notification: telegramNotification } : {}),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
