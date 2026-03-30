import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { buildAdminAuthHeader, proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import { buildTelegramClaimCallback, buildTelegramDeepLink, buildTelegramDispatchMessage } from '../../../lib/telegram-dispatch.ts';

export const prerender = false;

interface DispatchOrderSnapshot {
  id: number | string;
  shop_slug?: string | null;
  restaurant_slug?: string | null;
  restaurant_id?: number | string | null;
  shop_id?: number | string | null;
  shop_name?: string | null;
  restaurant_name?: string | null;
  table_info?: string | null;
  total_amount?: number | string | null;
  pickup_eta_minutes?: number | string | null;
  user_phone?: string | null;
}

interface TelegramRiderRow {
  id?: number | string | null;
  name?: string | null;
  phone?: string | null;
  telegram_chat_id?: string | null;
}

interface DispatchProxyPayload {
  success?: boolean;
  order?: DispatchOrderSnapshot;
  orders?: DispatchOrderSnapshot[];
  data?: {
    order?: DispatchOrderSnapshot;
    orders?: DispatchOrderSnapshot[];
  } | DispatchOrderSnapshot;
}

function isDispatchOrderSnapshot(value: unknown): value is DispatchOrderSnapshot {
  return !!value && typeof value === 'object' && 'id' in value;
}

interface TelegramDispatchAttempt {
  riderId: string;
  riderName: string;
  riderPhone: string;
  telegramChatIdBound: boolean;
  delivered: boolean;
  error?: string;
}

interface TelegramDispatchSummary {
  availableRiderCount: number;
  telegramBoundCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedReason?: string;
  attempts: TelegramDispatchAttempt[];
}

function extractDispatchOrder(payload: DispatchProxyPayload | DispatchOrderSnapshot[] | unknown, orderId: string): DispatchOrderSnapshot | null {
  if (Array.isArray(payload)) {
    const matched = payload.find((item) => String(item?.id || '').trim() === orderId);
    return matched && isDispatchOrderSnapshot(matched) ? matched : null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (isDispatchOrderSnapshot((payload as DispatchProxyPayload).order)) return (payload as DispatchProxyPayload).order;
  if (Array.isArray((payload as DispatchProxyPayload).orders)) {
    const matched = (payload as DispatchProxyPayload).orders?.find((item) => String(item?.id || '').trim() === orderId);
    if (matched) return matched;
  }
  if ((payload as DispatchProxyPayload).data && typeof (payload as DispatchProxyPayload).data === 'object' && 'order' in (payload as DispatchProxyPayload).data! && isDispatchOrderSnapshot((payload as { data?: { order?: DispatchOrderSnapshot } }).data?.order)) {
    return (payload as { data?: { order?: DispatchOrderSnapshot } }).data?.order || null;
  }
  if ((payload as DispatchProxyPayload).data && typeof (payload as DispatchProxyPayload).data === 'object' && 'orders' in (payload as DispatchProxyPayload).data! && Array.isArray((payload as { data?: { orders?: DispatchOrderSnapshot[] } }).data?.orders)) {
    const matched = (payload as { data?: { orders?: DispatchOrderSnapshot[] } }).data?.orders?.find((item) => String(item?.id || '').trim() === orderId);
    if (matched) return matched;
  }
  if (isDispatchOrderSnapshot((payload as DispatchProxyPayload).data)) {
    return (payload as DispatchProxyPayload).data as DispatchOrderSnapshot;
  }
  return null;
}

async function fetchAvailableRiders(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies']) {
  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/riders`,
    method: 'GET',
  });

  const text = await res.text();
  if (!res.ok) return [] as TelegramRiderRow[];

  try {
    const parsed = JSON.parse(text) as { riders?: TelegramRiderRow[] };
    return Array.isArray(parsed.riders) ? parsed.riders : [];
  } catch {
    return [];
  }
}

async function notifyTelegramRecipients(
  request: Request,
  cookies: Parameters<APIRoute['POST']>[0]['cookies'],
  order: DispatchOrderSnapshot,
): Promise<TelegramDispatchSummary> {
  const riders = await fetchAvailableRiders(request, cookies);
  const availableRiderCount = riders.length;
  const telegramRiders = riders.filter((rider) => String(rider.telegram_chat_id || '').trim() !== '');
  const telegramBoundCount = telegramRiders.length;

  const baseSummary: TelegramDispatchSummary = {
    availableRiderCount,
    telegramBoundCount,
    deliveredCount: 0,
    failedCount: 0,
    attempts: riders.map((rider) => ({
      riderId: String(rider.id || '').trim(),
      riderName: String(rider.name || '未命名骑手').trim(),
      riderPhone: String(rider.phone || '').trim(),
      telegramChatIdBound: String(rider.telegram_chat_id || '').trim() !== '',
      delivered: false,
      error: String(rider.telegram_chat_id || '').trim() !== '' ? undefined : 'telegram_not_bound',
    })),
  };

  if (availableRiderCount === 0) {
    return {
      ...baseSummary,
      skippedReason: 'no_available_riders',
    };
  }

  if (telegramBoundCount === 0) {
    return {
      ...baseSummary,
      failedCount: availableRiderCount,
      skippedReason: 'no_telegram_bound_riders',
    };
  }

  const restaurantId = String(order.shop_slug || order.restaurant_slug || order.restaurant_id || order.shop_id || '').trim();
  if (!restaurantId) {
    return {
      ...baseSummary,
      failedCount: telegramBoundCount,
      skippedReason: 'missing_restaurant_id',
      attempts: baseSummary.attempts.map((attempt) => (
        attempt.telegramChatIdBound
          ? { ...attempt, error: 'missing_restaurant_id' }
          : attempt
      )),
    };
  }

  const requestUrl = new URL(request.url);
  const dashboardBaseUrl = requestUrl.origin;
  const shopName = String(order.shop_name || order.restaurant_name || '店铺');
  const address = String(order.table_info || '');
  const totalAmount = Number(order.total_amount || 0);
  const pickupEtaMinutes = Number(order.pickup_eta_minutes || 0);
  const phone = String(order.user_phone || '');

  const attempts = await Promise.all(telegramRiders.map(async (rider): Promise<TelegramDispatchAttempt> => {
    const dashboardLink = buildTelegramDeepLink({
      baseUrl: dashboardBaseUrl,
      restaurantId,
      orderId: order.id,
    });
    const riderId = Number(rider.id || 0);
    const riderPhone = String(rider.phone || '').trim();
    const riderChatId = String(rider.telegram_chat_id || '').trim();
    const claimCallbackData = riderId > 0 && String(rider.name || '').trim() && riderPhone && riderChatId
      ? buildTelegramClaimCallback({
          orderId: Number(order.id || 0),
          riderId,
          riderName: String(rider.name || '').trim(),
          restaurantId,
          riderPhone,
          telegramChatId: riderChatId,
        })
      : undefined;
    const message = buildTelegramDispatchMessage({
      shopName,
      address,
      totalAmount,
      pickupEtaMinutes,
      phone,
      dashboardLink,
      claimCallbackData,
    });

    try {
      const sendRes = await fetch(`${API_BASE_URL}/api/telegram/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shop_slug: String(order.shop_slug || order.restaurant_slug || '').trim(),
          chat_id: rider.telegram_chat_id,
          ...message,
        }),
      });
      const responseText = await sendRes.text();
      if (!sendRes.ok) {
        return {
          riderId: String(rider.id || '').trim(),
          riderName: String(rider.name || '未命名骑手').trim(),
          riderPhone: riderPhone,
          telegramChatIdBound: true,
          delivered: false,
          error: responseText.trim() || `telegram_send_http_${sendRes.status}`,
        };
      }

      return {
        riderId: String(rider.id || '').trim(),
        riderName: String(rider.name || '未命名骑手').trim(),
        riderPhone: riderPhone,
        telegramChatIdBound: true,
        delivered: true,
      };
    } catch (error) {
      return {
        riderId: String(rider.id || '').trim(),
        riderName: String(rider.name || '未命名骑手').trim(),
        riderPhone: riderPhone,
        telegramChatIdBound: true,
        delivered: false,
        error: error instanceof Error ? error.message : 'telegram_send_failed',
      };
    }
  }));

  const mergedAttempts = baseSummary.attempts.map((attempt) => {
    if (!attempt.telegramChatIdBound) return attempt;
    return attempts.find((item) => item.riderId === attempt.riderId && item.riderPhone === attempt.riderPhone) || attempt;
  });
  const deliveredCount = mergedAttempts.filter((attempt) => attempt.delivered).length;
  const failedCount = mergedAttempts.filter((attempt) => !attempt.delivered).length;

  return {
    availableRiderCount,
    telegramBoundCount,
    deliveredCount,
    failedCount,
    attempts: mergedAttempts,
  };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.text();

  let parsedBody: Record<string, unknown> = {};
  let action = '';
  try {
    parsedBody = JSON.parse(body) as Record<string, unknown>;
    action = String(parsedBody.action || '').trim();
  } catch {
    parsedBody = {};
    action = '';
  }

  const orderId = String(parsedBody.orderId || parsedBody.id || '').trim();
  if (!orderId) {
    return new Response(JSON.stringify({ success: false, error: 'order_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeaders = buildAdminAuthHeader(request, cookies);

  if (action === 'publish' || action === 'remind') {
    const orderRes = await proxyAdminRequest({
      request,
      cookies,
      url: `${API_BASE_URL}/api/admin/orders`,
      method: 'GET',
    });
    const orderText = await orderRes.text();

    let orderPayload: Record<string, unknown> = {};
    try {
      orderPayload = JSON.parse(orderText) as Record<string, unknown>;
    } catch {
      orderPayload = {};
    }

    if (!orderRes.ok || orderPayload.success === false) {
      return new Response(JSON.stringify({
        success: false,
        error: 'order_fetch_failed',
        upstream_status: orderRes.status,
        upstream_body: orderText || JSON.stringify(orderPayload),
      }), {
        status: orderRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const order = extractDispatchOrder(orderPayload as DispatchProxyPayload, orderId) || (orderPayload as DispatchOrderSnapshot);
    if (!order || !order.id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'order_snapshot_unavailable',
        raw_response_text: orderText,
      }), {
        status: orderRes.status || 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updatePayload = action === 'publish'
      ? {
          status: parsedBody.status,
          pickup_eta_minutes: parsedBody.pickup_eta_minutes,
          pickup_ready_at: parsedBody.pickup_ready_at,
          rider_broadcasted_at: parsedBody.rider_broadcasted_at,
          rider_remind_count: parsedBody.rider_remind_count,
          rider_last_reminded_at: parsedBody.rider_last_reminded_at,
        }
      : {
          status: String(order.status || '').trim(),
          rider_remind_count: parsedBody.rider_remind_count,
          rider_last_reminded_at: parsedBody.rider_last_reminded_at,
        };

    const updateRes = await proxyAdminRequest({
      request,
      cookies,
      url: `${API_BASE_URL}/api/admin/orders/${encodeURIComponent(orderId)}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
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
        status: updateRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'publish') {
      const mergedOrder = {
        ...order,
        status: String(parsedBody.status || order.status || ''),
        pickup_eta_minutes: parsedBody.pickup_eta_minutes ?? order.pickup_eta_minutes,
        pickup_ready_at: parsedBody.pickup_ready_at ?? order.pickup_ready_at,
        rider_broadcasted_at: parsedBody.rider_broadcasted_at ?? order.rider_broadcasted_at,
        rider_remind_count: parsedBody.rider_remind_count ?? order.rider_remind_count,
        rider_last_reminded_at: parsedBody.rider_last_reminded_at ?? order.rider_last_reminded_at,
      } satisfies DispatchOrderSnapshot;

      const telegram_dispatch = await notifyTelegramRecipients(request, cookies, mergedOrder);
      return new Response(JSON.stringify({
        success: true,
        order: mergedOrder,
        telegram_dispatch,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      order: {
        ...order,
        rider_remind_count: parsedBody.rider_remind_count ?? order.rider_remind_count,
        rider_last_reminded_at: parsedBody.rider_last_reminded_at ?? order.rider_last_reminded_at,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: false, error: 'unsupported_action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
