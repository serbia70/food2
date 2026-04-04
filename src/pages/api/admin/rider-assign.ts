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
  tableInfo?: unknown;
  userPhone?: unknown;
  totalAmount?: unknown;
  scheduledFor?: unknown;
  items?: unknown;
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
  const items = Array.isArray(raw.items) ? raw.items as OrderSummaryItem[] : [];

  const parsedTotalAmount = Number(raw.totalAmount);

  return {
    orderNo: String(raw.orderNo || orderId || '').trim(),
    address: String(raw.tableInfo || '').trim() || '未提供地址',
    phone: String(raw.userPhone || '').trim() || '-',
    totalAmount: Number.isFinite(parsedTotalAmount) ? parsedTotalAmount : 0,
    scheduledFor: String(raw.scheduledFor || '').trim(),
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

function readOrderShopSlug(payload: unknown, orderId: string): string {
  const normalizedOrderId = String(orderId || '').trim();
  if (!payload) return '';

  const pickFromRow = (row: unknown): string => {
    if (!row || typeof row !== 'object') return '';
    const data = row as Record<string, unknown>;
    const id = String(data.id || data.orderId || data.order_id || '').trim();
    if (id && normalizedOrderId && id !== normalizedOrderId) return '';
    return String(data.shopSlug || data.shop_slug || data.restaurantSlug || data.restaurant_slug || '').trim();
  };

  if (Array.isArray(payload)) {
    for (const row of payload) {
      const slug = pickFromRow(row);
      if (slug) return slug;
    }
    return '';
  }

  if (typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const direct = pickFromRow(data);
    if (direct) return direct;

    const nestedData = data.data;
    if (Array.isArray(nestedData)) {
      for (const row of nestedData) {
        const slug = pickFromRow(row);
        if (slug) return slug;
      }
    } else if (nestedData && typeof nestedData === 'object') {
      const nested = nestedData as Record<string, unknown>;
      const nestedDirect = pickFromRow(nested);
      if (nestedDirect) return nestedDirect;
      if (Array.isArray(nested.orders)) {
        for (const row of nested.orders) {
          const slug = pickFromRow(row);
          if (slug) return slug;
        }
      }
    }

    if (Array.isArray(data.orders)) {
      for (const row of data.orders) {
        const slug = pickFromRow(row);
        if (slug) return slug;
      }
    }
  }

  return '';
}

async function fetchOrderShopSlug(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies'], orderId: string): Promise<string> {
  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders`,
    method: 'GET',
  });
  const text = await res.text();
  if (!res.ok || !text) return '';
  const parsed = readJsonObject(text);
  if (!parsed) return '';
  return readOrderShopSlug(parsed, orderId);
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
}): Promise<{ success: true } | { success: false; error: string }> {
  const chatId = readRiderChatId(rider);
  if (!chatId) return { success: false, error: 'telegram_chat_id_missing' };

  try {
    const claimCallbackData = buildTelegramShortClaimCallback({
      orderId: Number(orderId),
      riderId: Number(rider.id || 0),
      riderName: String(rider.name || '').trim(),
      riderPhone: String(rider.phone || '').trim(),
      restaurantId: String(shopSlug || 'admin').trim() || 'admin',
      telegramChatId: chatId,
    });

    const message = buildAdminAssignedOrderTelegramMessage({
      orderNo: orderSummary.orderNo,
      address: orderSummary.address,
      totalAmount: orderSummary.totalAmount,
      phone: orderSummary.phone,
      pickupEtaMinutes,
      scheduledFor: orderSummary.scheduledFor,
      itemSummary: orderSummary.itemSummary,
      claimCallbackData,
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cookie = request.headers.get('cookie') || '';
    if (cookie) headers.cookie = cookie;

    const response = await fetch(`${new URL(request.url).origin}/api/telegram/send`, {
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
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'telegram_send_failed',
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

  const notifyShopSlug = providedShopSlug || await fetchOrderShopSlug(request, cookies, orderId);
  const orderSummary = readOrderSummary(body, orderId);
  const telegramNotification = await notifyAssignedRider({
    request,
    rider: target,
    shopSlug: notifyShopSlug,
    orderId,
    pickupEtaMinutes,
    orderSummary,
  });

  return new Response(JSON.stringify({
    success: true,
    rider: {
      id: target.id,
      name: target.name,
      phone: target.phone,
    },
    ...(telegramNotification.success ? {} : { telegram_notification: telegramNotification }),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
