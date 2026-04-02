import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { buildAdminAuthHeader, proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import { buildTelegramClaimCallback, buildTelegramDeepLink, buildTelegramDispatchMessage } from '../../../lib/telegram-dispatch.ts';

export const prerender = false;

interface DispatchOrderSnapshot {
  id: number | string;
  shopSlug?: string | null;
  restaurantSlug?: string | null;
  restaurantId?: number | string | null;
  shopId?: number | string | null;
  shopName?: string | null;
  restaurantName?: string | null;
  tableInfo?: string | null;
  totalAmount?: number | string | null;
  pickupEtaMinutes?: number | string | null;
  userPhone?: string | null;
  status?: string | null;
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  riderRemindCount?: number | string | null;
  riderLastRemindedAt?: string | null;
}

interface TelegramRiderRow {
  id?: number | string | null;
  name?: string | null;
  phone?: string | null;
  telegramChatId?: string | null;
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

function readDispatchOrderFromBody(payload: Record<string, unknown>, orderId: string): DispatchOrderSnapshot | null {
  const directOrder = extractDispatchOrder(payload, orderId);
  if (directOrder) return directOrder;

  const shopSlug = String(payload.shopSlug || payload.restaurantSlug || '').trim();
  const shopId = String(payload.shopId || payload.restaurantId || '').trim();
  const shopName = String(payload.shopName || payload.restaurantName || '').trim();
  const tableInfo = String(payload.tableInfo || '').trim();
  const totalAmount = String(payload.totalAmount || '').trim();
  const userPhone = String(payload.userPhone || '').trim();
  const status = String(payload.status || '').trim();
  const hasSnapshotFields = !!(shopSlug || shopId || shopName || tableInfo || totalAmount || userPhone);
  if (!hasSnapshotFields) return null;

  return {
    id: orderId,
    shopSlug: shopSlug || undefined,
    restaurantSlug: String(payload.restaurantSlug || '').trim() || undefined,
    shopId: shopId || undefined,
    restaurantId: String(payload.restaurantId || '').trim() || undefined,
    shopName: shopName || undefined,
    restaurantName: String(payload.restaurantName || '').trim() || undefined,
    tableInfo: tableInfo || undefined,
    totalAmount: totalAmount || undefined,
    userPhone: userPhone || undefined,
    status: status || undefined,
    pickupEtaMinutes: payload.pickupEtaMinutes != null ? String(payload.pickupEtaMinutes) : undefined,
    pickupReadyAt: String(payload.pickupReadyAt || '').trim() || undefined,
    riderBroadcastedAt: String(payload.riderBroadcastedAt || '').trim() || undefined,
    riderRemindCount: payload.riderRemindCount != null ? String(payload.riderRemindCount) : undefined,
    riderLastRemindedAt: String(payload.riderLastRemindedAt || '').trim() || undefined,
  };
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
  const readRiderChatId = (rider: TelegramRiderRow) => String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
  const telegramRiders = riders.filter((rider) => readRiderChatId(rider) !== '');
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
      telegramChatIdBound: readRiderChatId(rider) !== '',
      delivered: false,
      error: readRiderChatId(rider) !== '' ? undefined : 'telegram_not_bound',
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

  const restaurantId = String(order.shopSlug || order.restaurantSlug || order.restaurantId || order.shopId || '').trim();
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
  const shopName = String(order.shopName || order.restaurantName || '店铺');
  const address = String(order.tableInfo || '');
  const totalAmount = Number(order.totalAmount || 0);
  const pickupEtaMinutes = Number(order.pickupEtaMinutes || 0);
  const phone = String(order.userPhone || '');

  const attempts = await Promise.all(telegramRiders.map(async (rider): Promise<TelegramDispatchAttempt> => {
    const dashboardLink = buildTelegramDeepLink({
      baseUrl: dashboardBaseUrl,
      restaurantId,
      orderId: order.id,
    });
    const riderId = Number(rider.id || 0);
    const riderPhone = String(rider.phone || '').trim();
    const riderChatId = readRiderChatId(rider);
    let claimCallbackData: string | undefined;
    if (riderId > 0 && String(rider.name || '').trim() && riderPhone && riderChatId) {
      try {
        claimCallbackData = buildTelegramClaimCallback({
          orderId: Number(order.id || 0),
          riderId,
          riderName: String(rider.name || '').trim(),
          restaurantId,
          riderPhone,
          telegramChatId: riderChatId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message !== 'missing_telegram_callback_secret') throw error;
        claimCallbackData = undefined;
      }
    }
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
      const sendRes = await fetch(new URL('/api/telegram/send', request.url).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopSlug: String(order.shopSlug || order.restaurantSlug || '').trim(),
          chat_id: riderChatId,
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

  buildAdminAuthHeader(request, cookies);

  if (action === 'publish' || action === 'remind') {
    let order = readDispatchOrderFromBody(parsedBody, orderId);

    if (!order) {
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

      order = extractDispatchOrder(orderPayload as DispatchProxyPayload, orderId) || (orderPayload as DispatchOrderSnapshot);
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
    }

    const currentStatus = String(order.status || '').trim();
    const publishStatus = String(parsedBody.status || '').trim() || (currentStatus === 'awaiting_courier' ? currentStatus : 'awaiting_courier');

    const updatePayload = action === 'publish'
      ? {
          status: publishStatus,
          pickupEtaMinutes: parsedBody.pickupEtaMinutes,
          pickupReadyAt: parsedBody.pickupReadyAt,
          riderBroadcastedAt: parsedBody.riderBroadcastedAt,
          riderRemindCount: parsedBody.riderRemindCount,
          riderLastRemindedAt: parsedBody.riderLastRemindedAt,
        }
      : {
          status: currentStatus || 'awaiting_courier',
          riderRemindCount: parsedBody.riderRemindCount,
          riderLastRemindedAt: parsedBody.riderLastRemindedAt,
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

    const mergedOrder = {
      ...order,
      status: action === 'publish' ? publishStatus : (currentStatus || 'awaiting_courier'),
      pickupEtaMinutes: parsedBody.pickupEtaMinutes ?? order.pickupEtaMinutes,
      pickupReadyAt: parsedBody.pickupReadyAt ?? order.pickupReadyAt,
      riderBroadcastedAt: parsedBody.riderBroadcastedAt ?? order.riderBroadcastedAt,
      riderRemindCount: parsedBody.riderRemindCount ?? order.riderRemindCount,
      riderLastRemindedAt: parsedBody.riderLastRemindedAt ?? order.riderLastRemindedAt,
    } satisfies DispatchOrderSnapshot;

    const telegram_dispatch = await notifyTelegramRecipients(request, cookies, mergedOrder);
    return new Response(JSON.stringify({
      success: true,
      action,
      order: mergedOrder,
      telegram_dispatch,
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
