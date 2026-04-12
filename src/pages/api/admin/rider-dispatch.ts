import type { APIRoute } from 'astro';
import { API_BASE_URL, DISPATCH_AUTO_REASSIGN_MINUTES, SITE_BASE_URL } from '../../../config.ts';
import { buildAdminAuthHeader, proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import { buildDispatchMetaRemarks, buildRiderOrderView, readDispatchMetaFromRemarks, type DispatchMeta } from '../../../lib/rider-dispatch.ts';
import { readOnlineRiders, type AssignableRider } from '../../../lib/rider-assignment.ts';
import { buildTelegramClaimCallback, buildTelegramDeepLink, buildTelegramDispatchMessage } from '../../../lib/telegram-dispatch.ts';

export const prerender = false;

interface DispatchOrderSnapshot {
  id: number | string;
  shopSlug?: string | null;
  shopId?: number | string | null;
  shopName?: string | null;
  shopAddress?: string | null;
  shopMapUrl?: string | null;
  tableInfo?: string | null;
  deliveryAddress?: string | null;
  deliveryMapUrl?: string | null;
  totalAmount?: number | string | null;
  pickupEtaMinutes?: number | string | null;
  userPhone?: string | null;
  status?: string | null;
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  riderRemindCount?: number | string | null;
  riderLastRemindedAt?: string | null;
  remarksJson?: string | null;
}

interface TelegramRiderRow {
  id?: number | string | null;
  name?: string | null;
  phone?: string | null;
  telegramChatId?: string | null;
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

  const shopSlug = String(payload.shopSlug || '').trim();
  const shopId = String(payload.shopId || '').trim();
  const shopName = String(payload.shopName || '').trim();
  const shopAddress = String(payload.shopAddress || '').trim();
  const shopMapUrl = String(payload.shopMapUrl || '').trim();
  const tableInfo = String(payload.tableInfo || '').trim();
  const deliveryAddress = String(payload.deliveryAddress || '').trim();
  const deliveryMapUrl = String(payload.deliveryMapUrl || '').trim();
  const totalAmount = String(payload.totalAmount || '').trim();
  const userPhone = String(payload.userPhone || '').trim();
  const status = String(payload.status || '').trim();
  const hasSnapshotFields = !!(shopSlug || shopId || shopName || shopAddress || shopMapUrl || tableInfo || deliveryAddress || deliveryMapUrl || totalAmount || userPhone);
  if (!hasSnapshotFields) return null;

  return {
    id: orderId,
    shopSlug: shopSlug || undefined,
    shopId: shopId || undefined,
    shopName: shopName || undefined,
    shopAddress: shopAddress || undefined,
    shopMapUrl: shopMapUrl || undefined,
    tableInfo: tableInfo || undefined,
    deliveryAddress: deliveryAddress || undefined,
    deliveryMapUrl: deliveryMapUrl || undefined,
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

function readForcedRiderId(value: unknown): string {
  return String(value || '').trim();
}

function readNowIsoFromBody(body: Record<string, unknown>): string {
  const maybeNowIso = String(body.nowIso || body.nowISO || '').trim();
  if (Date.parse(maybeNowIso) > 0) return new Date(maybeNowIso).toISOString();
  return new Date().toISOString();
}

function buildDispatchTiming(nowIso: string): { assignedAt: string; expiresAt: string } {
  const baseTs = Date.parse(nowIso);
  const assignedAt = Number.isFinite(baseTs) ? new Date(baseTs).toISOString() : new Date().toISOString();
  const expiresAt = new Date(Date.parse(assignedAt) + DISPATCH_AUTO_REASSIGN_MINUTES * 60_000).toISOString();
  return { assignedAt, expiresAt };
}

function appendInvalidatedRiderIds(existing: string[], riderId: string): string[] {
  if (!riderId) return Array.from(new Set(existing.filter(Boolean)));
  return Array.from(new Set([...existing.filter(Boolean), riderId]));
}

function buildNextDispatchMetaForPublish({
  existingMeta,
  forcedRiderId,
  selectedRiderId,
  nowIso,
}: {
  existingMeta: DispatchMeta;
  forcedRiderId: string;
  selectedRiderId: string;
  nowIso: string;
}): DispatchMeta {
  const prevCurrentRiderId = String(existingMeta.currentRiderId || '').trim();
  const isReassigned = !!forcedRiderId && !!prevCurrentRiderId && prevCurrentRiderId !== selectedRiderId;
  const { assignedAt, expiresAt } = buildDispatchTiming(nowIso);

  return {
    ...existingMeta,
    currentRiderId: selectedRiderId,
    currentAssignedAt: assignedAt,
    currentExpiresAt: expiresAt,
    invalidatedRiderIds: isReassigned
      ? appendInvalidatedRiderIds(existingMeta.invalidatedRiderIds, prevCurrentRiderId)
      : existingMeta.invalidatedRiderIds,
    lastInvalidationReason: isReassigned ? 'reassigned' : existingMeta.lastInvalidationReason,
  };
}

function selectRiderForPublish({
  riders,
  forcedRiderId,
}: {
  riders: TelegramRiderRow[];
  forcedRiderId: string;
}): TelegramRiderRow[] {
  if (!forcedRiderId) return riders;
  return riders.filter((rider) => String(rider.id || '').trim() === forcedRiderId);
}

function pickNextRiderOnTimeout({
  riders,
  currentRiderId,
  invalidatedRiderIds,
}: {
  riders: AssignableRider[];
  currentRiderId: string;
  invalidatedRiderIds: string[];
}): AssignableRider | null {
  const normalizedCurrent = String(currentRiderId || '').trim();
  if (!normalizedCurrent) return null;

  const excluded = new Set(invalidatedRiderIds.map((item) => String(item || '').trim()).filter(Boolean));
  const candidates = riders.filter((rider) => !excluded.has(String(rider.id || '').trim()));
  if (candidates.length === 0) return null;

  const currentIndex = candidates.findIndex((rider) => String(rider.id || '').trim() === normalizedCurrent);
  if (currentIndex < 0) return candidates[0] || null;
  if (candidates.length <= 1) return null;
  return candidates[(currentIndex + 1) % candidates.length] || null;
}

async function writeDispatchMetaRemarks({
  request,
  cookies,
  orderId,
  order,
  nextMeta,
}: {
  request: Request;
  cookies: Parameters<APIRoute['POST']>[0]['cookies'];
  orderId: string;
  order: DispatchOrderSnapshot;
  nextMeta: DispatchMeta;
}) {
  const existingRemarksJson = String((order as { remarksJson?: unknown }).remarksJson || '').trim();
  const nextRemarks = buildDispatchMetaRemarks(existingRemarksJson, nextMeta);

  const remarksRes = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders/remarks`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderId,
      remarks: nextRemarks,
    }),
  });
  const remarksText = await remarksRes.text();

  let remarksJson: Record<string, unknown> = {};
  try {
    remarksJson = JSON.parse(remarksText) as Record<string, unknown>;
  } catch {
    remarksJson = {};
  }

  if (!remarksRes.ok || remarksJson.success === false) {
    return {
      ok: false as const,
      status: remarksRes.status,
      upstreamBody: remarksText || JSON.stringify(remarksJson),
    };
  }

  return {
    ok: true as const,
    remarksJson: JSON.stringify(nextRemarks),
  };
}

async function notifyTelegramRecipients(
  request: Request,
  cookies: Parameters<APIRoute['POST']>[0]['cookies'],
  order: DispatchOrderSnapshot,
  riderFilter?: (rider: TelegramRiderRow) => boolean,
): Promise<TelegramDispatchSummary> {
  const riders = await fetchAvailableRiders(request, cookies);
  const readRiderChatId = (rider: TelegramRiderRow) => String(rider.telegramChatId || '').trim();
  const scopedRiders = riderFilter ? riders.filter(riderFilter) : riders;
  const availableRiderCount = scopedRiders.length;
  const telegramRiders = scopedRiders.filter((rider) => readRiderChatId(rider) !== '');
  const telegramBoundCount = telegramRiders.length;

  const baseSummary: TelegramDispatchSummary = {
    availableRiderCount,
    telegramBoundCount,
    deliveredCount: 0,
    failedCount: 0,
    attempts: scopedRiders.map((rider) => ({
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

  const restaurantId = String(order.shopSlug || order.shopId || '').trim();
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

  const dashboardBaseUrl = String(SITE_BASE_URL || '').trim().replace(/\/$/, '') || 'https://food2.serbia70.com';
  const orderView = buildRiderOrderView(order);
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
      shopName: orderView.shopName,
      address: orderView.deliveryAddress || '未提供地址',
      totalAmount,
      pickupEtaMinutes,
      phone,
      dashboardLink,
      shopMapUrl: orderView.shopMapUrl,
      deliveryMapUrl: orderView.deliveryMapUrl,
      claimCallbackData,
    });

    try {
      const rawCookie = String(request.headers.get('cookie') || '').trim();
      const sendRes = await proxyAdminRequest({
        request,
        cookies,
        url: `${API_BASE_URL}/api/telegram/send`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(rawCookie ? { cookie: rawCookie } : {}),
        },
        body: JSON.stringify({
          shopSlug: String(order.shopSlug || '').trim(),
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
    return attempts.find((item) => item.riderId === attempt.riderId) || attempt;
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

  if (action === 'publish' || action === 'remind' || action === 'republish_on_timeout') {
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

    const forcedRiderId = readForcedRiderId(parsedBody.forceRiderId);
    const nowIso = readNowIsoFromBody(parsedBody);
    const existingRemarksJson = String(parsedBody.remarksJson || order.remarksJson || '').trim();
    const existingMeta = readDispatchMetaFromRemarks(existingRemarksJson);

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

    const mergedOrderBase = {
      ...order,
      status: action === 'publish' ? publishStatus : (currentStatus || 'awaiting_courier'),
      pickupEtaMinutes: parsedBody.pickupEtaMinutes ?? order.pickupEtaMinutes,
      pickupReadyAt: parsedBody.pickupReadyAt ?? order.pickupReadyAt,
      riderBroadcastedAt: parsedBody.riderBroadcastedAt ?? order.riderBroadcastedAt,
      riderRemindCount: parsedBody.riderRemindCount ?? order.riderRemindCount,
      riderLastRemindedAt: parsedBody.riderLastRemindedAt ?? order.riderLastRemindedAt,
      remarksJson: existingRemarksJson,
    } satisfies DispatchOrderSnapshot;

    if (action === 'republish_on_timeout') {
      if (currentStatus !== 'awaiting_courier') {
        return new Response(JSON.stringify({
          success: true,
          action,
          skipped: true,
          reason: 'order_status_changed',
          order: mergedOrderBase,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const riders = readOnlineRiders({ riders: await fetchAvailableRiders(request, cookies) });
      const currentRiderId = String(existingMeta.currentRiderId || '').trim();
      const nextRider = pickNextRiderOnTimeout({
        riders,
        currentRiderId,
        invalidatedRiderIds: existingMeta.invalidatedRiderIds,
      });

      const invalidatedWithCurrent = appendInvalidatedRiderIds(existingMeta.invalidatedRiderIds, currentRiderId);
      const { assignedAt, expiresAt } = buildDispatchTiming(nowIso);
      const timeoutMeta: DispatchMeta = nextRider
        ? {
            ...existingMeta,
            currentRiderId: String(nextRider.id || '').trim(),
            currentAssignedAt: assignedAt,
            currentExpiresAt: expiresAt,
            invalidatedRiderIds: invalidatedWithCurrent,
            lastInvalidationReason: 'timeout',
          }
        : {
            ...existingMeta,
            currentRiderId: '',
            currentAssignedAt: '',
            currentExpiresAt: '',
            invalidatedRiderIds: invalidatedWithCurrent,
            lastInvalidationReason: 'timeout',
          };

      const remarksResult = await writeDispatchMetaRemarks({
        request,
        cookies,
        orderId,
        order: mergedOrderBase,
        nextMeta: timeoutMeta,
      });
      if (!remarksResult.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'dispatch_meta_write_failed',
          upstream_status: remarksResult.status,
          upstream_body: remarksResult.upstreamBody,
        }), {
          status: remarksResult.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const mergedOrder = {
        ...mergedOrderBase,
        remarksJson: remarksResult.remarksJson,
      } satisfies DispatchOrderSnapshot;

      if (!nextRider) {
        return new Response(JSON.stringify({
          success: true,
          action,
          skipped: true,
          reason: 'no_next_rider',
          order: mergedOrder,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const nextRiderId = String(nextRider.id || '').trim();
      const telegram_dispatch = await notifyTelegramRecipients(
        request,
        cookies,
        mergedOrder,
        (rider) => String(rider.id || '').trim() === nextRiderId,
      );

      return new Response(JSON.stringify({
        success: true,
        action,
        skipped: false,
        order: mergedOrder,
        telegram_dispatch,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let mergedOrder = mergedOrderBase;
    let riderFilter: ((rider: TelegramRiderRow) => boolean) | undefined;

    if (action === 'publish') {
      const riders = await fetchAvailableRiders(request, cookies);
      const scopedRiders = selectRiderForPublish({ riders, forcedRiderId });
      const selectedRiderId = String((scopedRiders[0]?.id || '')).trim();
      if (forcedRiderId && !selectedRiderId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'forced_rider_not_found',
          forcedRiderId,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const safeSelectedRiderId = selectedRiderId || String(existingMeta.currentRiderId || '').trim();

      if (safeSelectedRiderId) {
        const nextMeta = buildNextDispatchMetaForPublish({
          existingMeta,
          forcedRiderId,
          selectedRiderId: safeSelectedRiderId,
          nowIso,
        });

        const remarksResult = await writeDispatchMetaRemarks({
          request,
          cookies,
          orderId,
          order: mergedOrderBase,
          nextMeta,
        });
        if (!remarksResult.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: 'dispatch_meta_write_failed',
            upstream_status: remarksResult.status,
            upstream_body: remarksResult.upstreamBody,
          }), {
            status: remarksResult.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        mergedOrder = {
          ...mergedOrderBase,
          remarksJson: remarksResult.remarksJson,
        };

        riderFilter = (rider) => String(rider.id || '').trim() === safeSelectedRiderId;
      }
    }

    const telegram_dispatch = await notifyTelegramRecipients(request, cookies, mergedOrder, riderFilter);
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
