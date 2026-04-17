import type { APIRoute } from 'astro';
import { API_BASE_URL, DISPATCH_AUTO_REASSIGN_MINUTES, SITE_BASE_URL } from '../../../config.ts';
import { buildAdminAuthHeader, proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import { buildOrderItemTextLinesShared } from '../../../lib/order-items-shared.ts';
import { buildRiderOrderView, readDispatchMetaFromRemarks } from '../../../lib/rider-dispatch.ts';
import { readOnlineRiders, type AssignableRider } from '../../../lib/rider-assignment.ts';
import { buildTelegramClaimCallback, buildTelegramDeepLink, buildTelegramDispatchMessage } from '../../../lib/telegram-dispatch.ts';
import {
  fetchAdminOrderDetails,
  persistTelegramMessageRef,
  sendTelegramDispatchMessage,
  writeDispatchMetaRemarks,
} from '../../../lib/admin-telegram-dispatch.ts';

export const prerender = false;

interface DispatchOrderSnapshot {
  id: number | string;
  shopSlug?: string | null;
  shopId?: number | string | null;
  shopName?: string | null;
  restaurantName?: string | null;
  shopAddress?: string | null;
  restaurantAddress?: string | null;
  shopMapUrl?: string | null;
  tableInfo?: string | null;
  deliveryAddress?: string | null;
  deliveryMapUrl?: string | null;
  totalAmount?: number | string | null;
  pickupEtaMinutes?: number | string | null;
  userPhone?: string | null;
  items?: unknown;
  itemsJson?: unknown;
  items_json?: unknown;
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


interface TelegramDispatchAttempt {
  riderId: string;
  riderName: string;
  riderPhone: string;
  telegramChatIdBound: boolean;
  delivered: boolean;
  error?: string;
  messageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
}

interface TelegramDispatchSummary {
  availableRiderCount: number;
  telegramBoundCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedReason?: string;
  telegramMessageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
  attempts: TelegramDispatchAttempt[];
}

function isDispatchOrderSnapshot(value: unknown): value is DispatchOrderSnapshot {
  return !!value && typeof value === 'object' && 'id' in value;
}

function extractDispatchOrder(payload: unknown, orderId: string): DispatchOrderSnapshot | null {
  if (Array.isArray(payload)) {
    const matched = payload.find((item) => String((item as { id?: unknown })?.id || '').trim() === orderId);
    return matched && isDispatchOrderSnapshot(matched) ? matched : null;
  }
  if (!payload || typeof payload !== 'object') return null;

  const direct = payload as {
    order?: DispatchOrderSnapshot;
    orders?: DispatchOrderSnapshot[];
    data?: { order?: DispatchOrderSnapshot; orders?: DispatchOrderSnapshot[] } | DispatchOrderSnapshot;
  };

  if (isDispatchOrderSnapshot(direct.order)) return direct.order;
  if (Array.isArray(direct.orders)) {
    const matched = direct.orders.find((item) => String(item?.id || '').trim() === orderId);
    if (matched) return matched;
  }
  if (direct.data && typeof direct.data === 'object' && 'order' in direct.data && isDispatchOrderSnapshot(direct.data.order)) {
    return direct.data.order || null;
  }
  if (direct.data && typeof direct.data === 'object' && 'orders' in direct.data && Array.isArray(direct.data.orders)) {
    const matched = direct.data.orders.find((item) => String(item?.id || '').trim() === orderId);
    if (matched) return matched;
  }
  if (isDispatchOrderSnapshot(direct.data)) return direct.data;
  return null;
}

function readDispatchOrderFromBody(payload: Record<string, unknown>, orderId: string): DispatchOrderSnapshot | null {
  const directOrder = extractDispatchOrder(payload, orderId);
  if (directOrder) return directOrder;

  const shopSlug = String(readDispatchBodyValue(payload, 'shopSlug', 'shop_slug') || '').trim();
  const shopId = String(readDispatchBodyValue(payload, 'shopId', 'shop_id') || '').trim();
  const shopName = String(readDispatchBodyValue(payload, 'shopName', 'shop_name') || '').trim();
  const restaurantName = String(readDispatchBodyValue(payload, 'restaurantName', 'restaurant_name') || '').trim();
  const shopAddress = String(readDispatchBodyValue(payload, 'shopAddress', 'shop_address') || '').trim();
  const restaurantAddress = String(readDispatchBodyValue(payload, 'restaurantAddress', 'restaurant_address') || '').trim();
  const shopMapUrl = String(readDispatchBodyValue(payload, 'shopMapUrl', 'shop_map_url') || '').trim();
  const tableInfo = String(readDispatchBodyValue(payload, 'tableInfo', 'table_info') || '').trim();
  const deliveryAddress = String(readDispatchBodyValue(payload, 'deliveryAddress', 'delivery_address') || '').trim();
  const deliveryMapUrl = String(readDispatchBodyValue(payload, 'deliveryMapUrl', 'delivery_map_url') || '').trim();
  const totalAmount = String(readDispatchBodyValue(payload, 'totalAmount', 'total_amount') || '').trim();
  const userPhone = String(readDispatchBodyValue(payload, 'userPhone', 'user_phone') || '').trim();
  const status = String(readDispatchBodyValue(payload, 'status', 'status') || '').trim();
  const hasSnapshotFields = !!(
    shopSlug
    || shopId
    || shopName
    || restaurantName
    || shopAddress
    || restaurantAddress
    || shopMapUrl
    || tableInfo
    || deliveryAddress
    || deliveryMapUrl
    || totalAmount
    || userPhone
  );
  if (!hasSnapshotFields) return null;

  return {
    id: orderId,
    shopSlug: shopSlug || undefined,
    shopId: shopId || undefined,
    shopName: shopName || undefined,
    restaurantName: restaurantName || undefined,
    shopAddress: shopAddress || undefined,
    restaurantAddress: restaurantAddress || undefined,
    shopMapUrl: shopMapUrl || undefined,
    tableInfo: tableInfo || undefined,
    deliveryAddress: deliveryAddress || undefined,
    deliveryMapUrl: deliveryMapUrl || undefined,
    totalAmount: totalAmount || undefined,
    userPhone: userPhone || undefined,
    items: payload.items,
    itemsJson: payload.itemsJson ?? payload.items_json,
    items_json: payload.items_json ?? payload.itemsJson,
    status: status || undefined,
    pickupEtaMinutes: readDispatchBodyValue(payload, 'pickupEtaMinutes', 'pickup_eta_minutes') != null
      ? String(readDispatchBodyValue(payload, 'pickupEtaMinutes', 'pickup_eta_minutes'))
      : undefined,
    pickupReadyAt: String(readDispatchBodyValue(payload, 'pickupReadyAt', 'pickup_ready_at') || '').trim() || undefined,
    riderBroadcastedAt: String(readDispatchBodyValue(payload, 'riderBroadcastedAt', 'rider_broadcasted_at') || '').trim() || undefined,
    riderRemindCount: readDispatchBodyValue(payload, 'riderRemindCount', 'rider_remind_count') != null
      ? String(readDispatchBodyValue(payload, 'riderRemindCount', 'rider_remind_count'))
      : undefined,
    riderLastRemindedAt: String(readDispatchBodyValue(payload, 'riderLastRemindedAt', 'rider_last_reminded_at') || '').trim() || undefined,
  };
}

function shouldHydratePublishOrderSummary(order: DispatchOrderSnapshot, remarksJsonHint = ''): boolean {
  const shopName = String((order as { shopName?: unknown; restaurantName?: unknown }).shopName || (order as { restaurantName?: unknown }).restaurantName || '').trim();
  if (!shopName) return true;

  const hasPickupLocation = !!String(order.shopMapUrl || order.shopAddress || order.restaurantAddress || '').trim();
  const hasDeliveryAddress = !!String(order.tableInfo || order.deliveryAddress || '').trim();
  const hasPhone = !!String(order.userPhone || '').trim();
  const hasPositiveAmount = Number(order.totalAmount || 0) > 0;
  const hasItemSummary = order.items != null
    || !!String(order.itemsJson || order.items_json || '').trim();
  const hasRemarksSnapshot = !!String(remarksJsonHint || order.remarksJson || '').trim();

  if (!hasDeliveryAddress || !hasPhone || !hasPositiveAmount) {
    return true;
  }

  return !hasRemarksSnapshot && !hasPickupLocation && !hasItemSummary;
}

function shouldHydrateNonPublishOrderSummary(order: DispatchOrderSnapshot, remarksJsonHint = ''): boolean {
  const shopName = String((order as { shopName?: unknown; restaurantName?: unknown }).shopName || (order as { restaurantName?: unknown }).restaurantName || '').trim();
  if (!shopName) return true;

  const hasPickupLocation = !!String(order.shopMapUrl || order.shopAddress || order.restaurantAddress || '').trim();
  const hasItemSummary = order.items != null
    || !!String(order.itemsJson || order.items_json || '').trim();
  const hasRemarksSnapshot = !!String(remarksJsonHint || order.remarksJson || '').trim();

  return !hasRemarksSnapshot && !hasPickupLocation && !hasItemSummary;
}

async function fetchDispatchOrderSnapshot({
  request,
  cookies,
  orderId,
}: {
  request: Request;
  cookies: Parameters<APIRoute['POST']>[0]['cookies'];
  orderId: string;
}): Promise<
  | { ok: true; order: DispatchOrderSnapshot | null }
  | { ok: false; status: number; upstreamBody: string }
> {
  const result = await fetchAdminOrderDetails({ request, cookies, orderId });
  if (!result.ok) {
    return {
      ok: false,
      status: result.upstreamStatus || 502,
      upstreamBody: result.upstreamBody || '',
    };
  }

  return {
    ok: true,
    order: result.orderRow as DispatchOrderSnapshot | null,
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

function readDispatchBodyValue(body: Record<string, unknown>, camelKey: string, snakeKey: string): unknown {
  return body[camelKey] ?? body[snakeKey];
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

async function fetchLatestOrderRemarks({
  request,
  cookies,
  orderId,
}: {
  request: Request;
  cookies: Parameters<APIRoute['POST']>[0]['cookies'];
  orderId: string;
}) {
  const result = await fetchAdminOrderDetails({ request, cookies, orderId });
  if (!result.ok || !result.orderRow) {
    return {
      ok: false as const,
      status: result.upstreamStatus || 502,
      upstreamBody: result.upstreamBody || '',
    };
  }

  return {
    ok: true as const,
    order: result.orderRow as DispatchOrderSnapshot,
    remarksJson: result.remarksJson,
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
  const itemSummary = buildOrderItemTextLinesShared(order.items ?? order.itemsJson ?? order.items_json)
    .map((line) => line.replace(/^•\s*/, ''));

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
      itemSummary,
      shopMapUrl: orderView.shopMapUrl,
      deliveryMapUrl: orderView.deliveryMapUrl,
      claimCallbackData,
    });

    try {
      const sendResult = await sendTelegramDispatchMessage({
        request,
        payload: {
          shopSlug: String(order.shopSlug || '').trim(),
          chat_id: riderChatId,
          ...message,
        },
      });
      if (!sendResult.ok) {
        return {
          riderId: String(rider.id || '').trim(),
          riderName: String(rider.name || '未命名骑手').trim(),
          riderPhone: riderPhone,
          telegramChatIdBound: true,
          delivered: false,
          error: sendResult.error,
        };
      }

      return {
        riderId: String(rider.id || '').trim(),
        riderName: String(rider.name || '未命名骑手').trim(),
        riderPhone: riderPhone,
        telegramChatIdBound: true,
        delivered: true,
        ...(sendResult.messageRef ? { messageRef: sendResult.messageRef } : {}),
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

  const firstDeliveredMessageRef = mergedAttempts.find((attempt) => attempt.delivered && attempt.messageRef)?.messageRef;

  return {
    availableRiderCount,
    telegramBoundCount,
    deliveredCount,
    failedCount,
    ...(firstDeliveredMessageRef ? { telegramMessageRef: firstDeliveredMessageRef } : {}),
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

  const orderId = String(parsedBody.orderId || parsedBody.order_id || parsedBody.id || '').trim();
  if (!orderId) {
    return new Response(JSON.stringify({ success: false, error: 'order_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  buildAdminAuthHeader(request, cookies);

  if (action === 'publish' || action === 'remind' || action === 'republish_on_timeout') {
    let order = readDispatchOrderFromBody(parsedBody, orderId);

    const remarksJsonHint = String(readDispatchBodyValue(parsedBody, 'remarksJson', 'remarks_json') || '').trim();
    const shouldHydrateOrderSummary = !order
      ? true
      : action === 'publish'
        ? shouldHydratePublishOrderSummary(order, remarksJsonHint)
        : shouldHydrateNonPublishOrderSummary(order, remarksJsonHint);

    if (shouldHydrateOrderSummary) {
      const snapshotResult = await fetchDispatchOrderSnapshot({
        request,
        cookies,
        orderId,
      });

      if (!snapshotResult.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'order_fetch_failed',
          upstream_status: snapshotResult.status,
          upstream_body: snapshotResult.upstreamBody,
        }), {
          status: snapshotResult.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!order) {
        order = snapshotResult.order;
      } else if (snapshotResult.order) {
        order = {
          ...snapshotResult.order,
          ...order,
          shopName: order.shopName || snapshotResult.order.shopName,
          restaurantName: order.restaurantName || snapshotResult.order.restaurantName,
          shopAddress: order.shopAddress || snapshotResult.order.shopAddress || snapshotResult.order.restaurantAddress,
          restaurantAddress: order.restaurantAddress || snapshotResult.order.restaurantAddress,
          shopMapUrl: order.shopMapUrl || snapshotResult.order.shopMapUrl,
          tableInfo: snapshotResult.order.tableInfo || order.tableInfo,
          deliveryAddress: snapshotResult.order.deliveryAddress || order.deliveryAddress,
          deliveryMapUrl: snapshotResult.order.deliveryMapUrl || order.deliveryMapUrl,
          totalAmount: order.totalAmount || snapshotResult.order.totalAmount,
          userPhone: order.userPhone || snapshotResult.order.userPhone,
          items: order.items ?? snapshotResult.order.items,
          itemsJson: order.itemsJson ?? snapshotResult.order.itemsJson,
          items_json: order.items_json ?? snapshotResult.order.items_json,
          remarksJson: order.remarksJson || snapshotResult.order.remarksJson,
          status: order.status || snapshotResult.order.status,
        };
      }

      if (!order || !order.id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'order_snapshot_unavailable',
          raw_response_text: '',
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const forcedRiderId = readForcedRiderId(readDispatchBodyValue(parsedBody, 'forceRiderId', 'force_rider_id'));
    const nowIso = readNowIsoFromBody(parsedBody);
    const existingRemarksJson = String(readDispatchBodyValue(parsedBody, 'remarksJson', 'remarks_json') || order.remarksJson || '').trim();
    const existingMeta = readDispatchMetaFromRemarks(existingRemarksJson);

    const parsedStatus = String(readDispatchBodyValue(parsedBody, 'status', 'status') || '').trim();
    const parsedPickupEtaMinutes = readDispatchBodyValue(parsedBody, 'pickupEtaMinutes', 'pickup_eta_minutes');
    const parsedPickupReadyAt = readDispatchBodyValue(parsedBody, 'pickupReadyAt', 'pickup_ready_at');
    const parsedRiderBroadcastedAt = readDispatchBodyValue(parsedBody, 'riderBroadcastedAt', 'rider_broadcasted_at');
    const parsedRiderRemindCount = readDispatchBodyValue(parsedBody, 'riderRemindCount', 'rider_remind_count');
    const parsedRiderLastRemindedAt = readDispatchBodyValue(parsedBody, 'riderLastRemindedAt', 'rider_last_reminded_at');

    const currentStatus = String(order.status || '').trim();
    const publishStatus = parsedStatus || (currentStatus === 'awaiting_courier' ? currentStatus : 'awaiting_courier');

    const updatePayload = action === 'publish'
      ? {
          status: publishStatus,
          pickupEtaMinutes: parsedPickupEtaMinutes,
          pickupReadyAt: parsedPickupReadyAt,
          riderBroadcastedAt: parsedRiderBroadcastedAt,
          riderRemindCount: parsedRiderRemindCount,
          riderLastRemindedAt: parsedRiderLastRemindedAt,
        }
      : {
          status: currentStatus || 'awaiting_courier',
          riderRemindCount: parsedRiderRemindCount,
          riderLastRemindedAt: parsedRiderLastRemindedAt,
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
      pickupEtaMinutes: parsedPickupEtaMinutes ?? order.pickupEtaMinutes,
      pickupReadyAt: parsedPickupReadyAt ?? order.pickupReadyAt,
      riderBroadcastedAt: parsedRiderBroadcastedAt ?? order.riderBroadcastedAt,
      riderRemindCount: parsedRiderRemindCount ?? order.riderRemindCount,
      riderLastRemindedAt: parsedRiderLastRemindedAt ?? order.riderLastRemindedAt,
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
        remarksJson: String(mergedOrderBase.remarksJson || '').trim(),
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
          remarksJson: String(mergedOrderBase.remarksJson || '').trim(),
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

    let warning: { code: string; upstream_status?: number; upstream_body?: string } | undefined;

    if (action === 'publish' && telegram_dispatch.telegramMessageRef) {
      const latestRemarksResult = await fetchLatestOrderRemarks({
        request,
        cookies,
        orderId,
      });

      if (!latestRemarksResult.ok) {
        warning = {
          code: 'telegram_message_ref_persist_failed',
          upstream_status: latestRemarksResult.status,
          upstream_body: latestRemarksResult.upstreamBody,
        };
      } else {
        const latestOrder = latestRemarksResult.order;
        const remarksResult = await persistTelegramMessageRef({
          request,
          cookies,
          orderId,
          remarksJson: latestRemarksResult.remarksJson,
          messageRef: telegram_dispatch.telegramMessageRef,
        });
        if (!remarksResult.ok) {
          warning = {
            code: 'telegram_message_ref_persist_failed',
            upstream_status: remarksResult.status,
            upstream_body: remarksResult.upstreamBody,
          };
        } else {
          mergedOrder = {
            ...mergedOrder,
            ...latestOrder,
            remarksJson: remarksResult.remarksJson,
          };
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      action,
      order: mergedOrder,
      telegram_dispatch,
      ...(warning ? { warning } : {}),
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
