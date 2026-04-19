import type { APIRoute } from 'astro';
import { API_BASE_URL, DISPATCH_AUTO_REASSIGN_MINUTES, SITE_BASE_URL } from '../../../config.ts';
import { proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import {
  persistAdminTelegramMessageRef,
  readAdminAssignableRiders,
  readAdminOrderById,
  writeAdminDispatchMetaRemarks,
} from '../../../lib/rider-route-shared.ts';
import { buildRiderOrderView, readDispatchMetaFromRemarks, type DispatchMeta } from '../../../lib/rider-dispatch.ts';
import { type AssignableRider } from '../../../lib/rider-assignment.ts';
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

type AvailableRidersReadResult = Awaited<ReturnType<typeof readAdminAssignableRiders>>;
type AvailableRidersReadFailure = Extract<AvailableRidersReadResult, { success: false }>;
type TelegramDispatchResult =
  | { ok: true; summary: TelegramDispatchSummary }
  | { ok: false; error: string; upstreamStatus: number; upstreamBody?: string };
type RouteCookies = Parameters<APIRoute['POST']>[0]['cookies'];
type DispatchAction = 'publish' | 'remind' | 'republish_on_timeout';
type TelegramDispatchPayload = TelegramDispatchSummary | {
  failedCount: number;
  skippedReason: string;
  attempts: TelegramDispatchAttempt[];
};

interface ParsedDispatchRequest {
  parsedBody: Record<string, unknown>;
  action: string;
  orderId: string;
}

interface DispatchWarning {
  code: string;
  upstream_status?: number;
  upstream_body?: string;
}

interface PreparedDispatchContext {
  forcedRiderId: string;
  nowIso: string;
  existingMeta: DispatchMeta;
  currentStatus: string;
  mergedOrderBase: DispatchOrderSnapshot;
}

function buildJsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildSuccessResponse(payload: Record<string, unknown>): Response {
  return buildJsonResponse({ success: true, ...payload }, 200);
}

function buildFailureResponse({
  error,
  status,
  extras,
}: {
  error: string;
  status: number;
  extras?: Record<string, unknown>;
}): Response {
  return buildJsonResponse({ success: false, error, ...(extras || {}) }, status);
}

function buildUpstreamFailureResponse({
  error,
  upstreamStatus,
  upstreamBody,
  responseStatus = upstreamStatus,
}: {
  error: string;
  upstreamStatus: number;
  upstreamBody?: string;
  responseStatus?: number;
}): Response {
  return buildFailureResponse({
    error,
    status: responseStatus,
    extras: {
      upstream_status: upstreamStatus,
      ...(upstreamBody ? { upstream_body: upstreamBody } : {}),
    },
  });
}

function buildDispatchSuccessResponse({
  telegramDispatch,
  warning,
}: {
  telegramDispatch: TelegramDispatchPayload;
  warning?: DispatchWarning;
}): Response {
  return buildSuccessResponse({
    telegram_dispatch: telegramDispatch,
    ...(warning ? { warning } : {}),
  });
}

function buildSkippedTelegramDispatchSuccessResponse(skippedReason: string): Response {
  return buildDispatchSuccessResponse({
    telegramDispatch: {
      failedCount: 0,
      skippedReason,
      attempts: [],
    },
  });
}

function buildAvailableRidersErrorResponse(result: AvailableRidersReadFailure): Response {
  return buildUpstreamFailureResponse({
    error: result.error,
    upstreamStatus: result.status,
    upstreamBody: result.upstreamBody,
    responseStatus: readAvailableRidersErrorHttpStatus(result),
  });
}

function buildTelegramDispatchErrorResponse(result: Extract<TelegramDispatchResult, { ok: false }>): Response {
  return buildAvailableRidersErrorResponse({
    success: false,
    status: result.upstreamStatus,
    error: result.error,
    ...(result.upstreamBody ? { upstreamBody: result.upstreamBody } : {}),
  });
}

function buildOrderUpdateFailedResponse(status: number, upstreamBody: string): Response {
  return buildUpstreamFailureResponse({
    error: 'order_update_failed',
    upstreamStatus: status,
    upstreamBody,
  });
}

function buildDispatchMetaWriteFailedResponse(status: number, upstreamBody: string): Response {
  return buildUpstreamFailureResponse({
    error: 'dispatch_meta_write_failed',
    upstreamStatus: status,
    upstreamBody,
  });
}

function parseDispatchRequest(body: string): ParsedDispatchRequest {
  let parsedBody: Record<string, unknown> = {};
  let action = '';

  try {
    parsedBody = JSON.parse(body) as Record<string, unknown>;
    action = String(parsedBody.action || '').trim();
  } catch {
    parsedBody = {};
    action = '';
  }

  return {
    parsedBody,
    action,
    orderId: String(parsedBody.orderId || parsedBody.id || '').trim(),
  };
}

function isDispatchAction(action: string): action is DispatchAction {
  return action === 'publish' || action === 'remind' || action === 'republish_on_timeout';
}

function readDispatchOrderFromBody(payload: Record<string, unknown>, orderId: string): DispatchOrderSnapshot | null {
  const directOrder = payload.order && typeof payload.order === 'object'
    ? payload.order as DispatchOrderSnapshot
    : null;
  if (directOrder && String(directOrder.id || '').trim() === orderId) return directOrder;

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

async function fetchAvailableRiders(
  request: Request,
  cookies: RouteCookies,
): Promise<AvailableRidersReadResult> {
  return readAdminAssignableRiders({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
  });
}

function readAvailableRidersErrorHttpStatus(result: AvailableRidersReadFailure): number {
  return result.status >= 200 && result.status < 300 ? 502 : result.status;
}

function readUpstreamLogicalFailureHttpStatus(status: number): number {
  return status >= 200 && status < 300 ? 502 : status;
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
  riders: AssignableRider[];
  forcedRiderId: string;
}): AssignableRider[] {
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
  cookies: RouteCookies;
  orderId: string;
  order: DispatchOrderSnapshot;
  nextMeta: DispatchMeta;
}) {
  return writeAdminDispatchMetaRemarks({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
    remarksJson: String((order as { remarksJson?: unknown }).remarksJson || '').trim(),
    nextMeta,
  });
}

async function loadDispatchOrder({
  request,
  cookies,
  parsedBody,
  orderId,
}: {
  request: Request;
  cookies: RouteCookies;
  parsedBody: Record<string, unknown>;
  orderId: string;
}): Promise<{ ok: true; order: DispatchOrderSnapshot } | { ok: false; response: Response }> {
  const snapshotOrder = readDispatchOrderFromBody(parsedBody, orderId);
  if (snapshotOrder) {
    return {
      ok: true,
      order: snapshotOrder,
    };
  }

  const orderResult = await readAdminOrderById({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
  });

  if (!orderResult.ok) {
    return {
      ok: false,
      response: buildUpstreamFailureResponse({
        error: 'order_fetch_failed',
        upstreamStatus: orderResult.status,
        upstreamBody: orderResult.upstreamBody,
        responseStatus: readUpstreamLogicalFailureHttpStatus(orderResult.status),
      }),
    };
  }

  const order = orderResult.order as DispatchOrderSnapshot | null;
  if (!order || !order.id) {
    return {
      ok: false,
      response: buildFailureResponse({
        error: 'order_snapshot_unavailable',
        status: 502,
        extras: {
          raw_response_text: orderResult.rawText,
        },
      }),
    };
  }

  return {
    ok: true,
    order,
  };
}

async function prepareDispatchContext({
  request,
  cookies,
  action,
  orderId,
  order,
  parsedBody,
}: {
  request: Request;
  cookies: RouteCookies;
  action: DispatchAction;
  orderId: string;
  order: DispatchOrderSnapshot;
  parsedBody: Record<string, unknown>;
}): Promise<{ ok: true; prepared: PreparedDispatchContext } | { ok: false; response: Response }> {
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
    return {
      ok: false,
      response: buildOrderUpdateFailedResponse(updateRes.status, updateText || JSON.stringify(updateJson)),
    };
  }

  return {
    ok: true,
    prepared: {
      forcedRiderId,
      nowIso,
      existingMeta,
      currentStatus,
      mergedOrderBase: {
        ...order,
        status: action === 'publish' ? publishStatus : (currentStatus || 'awaiting_courier'),
        pickupEtaMinutes: parsedBody.pickupEtaMinutes ?? order.pickupEtaMinutes,
        pickupReadyAt: parsedBody.pickupReadyAt ?? order.pickupReadyAt,
        riderBroadcastedAt: parsedBody.riderBroadcastedAt ?? order.riderBroadcastedAt,
        riderRemindCount: parsedBody.riderRemindCount ?? order.riderRemindCount,
        riderLastRemindedAt: parsedBody.riderLastRemindedAt ?? order.riderLastRemindedAt,
        remarksJson: existingRemarksJson,
      } satisfies DispatchOrderSnapshot,
    },
  };
}

async function handleRepublishOnTimeout({
  request,
  cookies,
  orderId,
  order,
  parsedBody,
}: {
  request: Request;
  cookies: RouteCookies;
  orderId: string;
  order: DispatchOrderSnapshot;
  parsedBody: Record<string, unknown>;
}): Promise<Response> {
  const preparedResult = await prepareDispatchContext({
    request,
    cookies,
    action: 'republish_on_timeout',
    orderId,
    order,
    parsedBody,
  });
  if (!preparedResult.ok) return preparedResult.response;

  const {
    existingMeta,
    nowIso,
    currentStatus,
    mergedOrderBase,
  } = preparedResult.prepared;

  if (currentStatus !== 'awaiting_courier') {
    return buildSkippedTelegramDispatchSuccessResponse('order_status_changed');
  }

  const ridersResult = await fetchAvailableRiders(request, cookies);
  if (!ridersResult.success) {
    return buildAvailableRidersErrorResponse(ridersResult);
  }

  const riders = ridersResult.riders;
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
    return buildDispatchMetaWriteFailedResponse(remarksResult.status, remarksResult.upstreamBody);
  }

  const mergedOrder = {
    ...mergedOrderBase,
    remarksJson: remarksResult.remarksJson,
  } satisfies DispatchOrderSnapshot;

  if (!nextRider) {
    return buildSkippedTelegramDispatchSuccessResponse('no_next_rider');
  }

  const nextRiderId = String(nextRider.id || '').trim();
  const telegramDispatchResult = await notifyTelegramRecipients(
    request,
    cookies,
    mergedOrder,
    (rider) => String(rider.id || '').trim() === nextRiderId,
  );
  if (!telegramDispatchResult.ok) {
    return buildTelegramDispatchErrorResponse(telegramDispatchResult);
  }

  return buildDispatchSuccessResponse({
    telegramDispatch: telegramDispatchResult.summary,
  });
}

async function handlePublishOrRemind({
  request,
  cookies,
  orderId,
  order,
  parsedBody,
  action,
}: {
  request: Request;
  cookies: RouteCookies;
  orderId: string;
  order: DispatchOrderSnapshot;
  parsedBody: Record<string, unknown>;
  action: Extract<DispatchAction, 'publish' | 'remind'>;
}): Promise<Response> {
  const preparedResult = await prepareDispatchContext({
    request,
    cookies,
    action,
    orderId,
    order,
    parsedBody,
  });
  if (!preparedResult.ok) return preparedResult.response;

  const {
    forcedRiderId,
    nowIso,
    existingMeta,
    mergedOrderBase,
  } = preparedResult.prepared;

  let mergedOrder = mergedOrderBase;
  let riderFilter: ((rider: AssignableRider) => boolean) | undefined;

  if (action === 'publish') {
    const ridersResult = await fetchAvailableRiders(request, cookies);
    if (!ridersResult.success) {
      return buildAvailableRidersErrorResponse(ridersResult);
    }

    const scopedRiders = selectRiderForPublish({ riders: ridersResult.riders, forcedRiderId });
    const selectedRiderId = String((scopedRiders[0]?.id || '')).trim();
    if (forcedRiderId && !selectedRiderId) {
      return buildFailureResponse({
        error: 'forced_rider_not_found',
        status: 400,
        extras: { forcedRiderId },
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
        return buildDispatchMetaWriteFailedResponse(remarksResult.status, remarksResult.upstreamBody);
      }
      mergedOrder = {
        ...mergedOrderBase,
        remarksJson: remarksResult.remarksJson,
      } satisfies DispatchOrderSnapshot;

      riderFilter = (rider) => String(rider.id || '').trim() === safeSelectedRiderId;
    }
  }

  const telegramDispatchResult = await notifyTelegramRecipients(request, cookies, mergedOrder, riderFilter);
  if (!telegramDispatchResult.ok) {
    return buildTelegramDispatchErrorResponse(telegramDispatchResult);
  }

  const telegramDispatch = telegramDispatchResult.summary;
  let warning: DispatchWarning | undefined;

  if (action === 'publish' && telegramDispatch.telegramMessageRef) {
    const persistResult = await persistAdminTelegramMessageRef({
      request,
      cookies,
      apiBaseUrl: API_BASE_URL,
      orderId,
      messageRef: telegramDispatch.telegramMessageRef,
    });

    if (!persistResult.ok) {
      warning = {
        code: 'telegram_message_ref_persist_failed',
        ...(typeof persistResult.status === 'number' ? { upstream_status: persistResult.status } : {}),
        ...(persistResult.upstreamBody ? { upstream_body: persistResult.upstreamBody } : {}),
      };
    } else {
      mergedOrder = {
        ...mergedOrder,
        ...persistResult.order as DispatchOrderSnapshot,
        remarksJson: persistResult.remarksJson,
      };
    }
  }

  return buildDispatchSuccessResponse({
    telegramDispatch,
    ...(warning ? { warning } : {}),
  });
}

async function notifyTelegramRecipients(
  request: Request,
  cookies: RouteCookies,
  order: DispatchOrderSnapshot,
  riderFilter?: (rider: AssignableRider) => boolean,
): Promise<TelegramDispatchResult> {
  const ridersResult = await fetchAvailableRiders(request, cookies);
  if (!ridersResult.success) {
    return {
      ok: false,
      error: ridersResult.error,
      upstreamStatus: ridersResult.status,
      ...(ridersResult.upstreamBody ? { upstreamBody: ridersResult.upstreamBody } : {}),
    };
  }

  const riders = ridersResult.riders;
  const readRiderChatId = (rider: AssignableRider) => String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
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
      ok: true,
      summary: {
        ...baseSummary,
        skippedReason: 'no_available_riders',
      },
    };
  }

  if (telegramBoundCount === 0) {
    return {
      ok: true,
      summary: {
        ...baseSummary,
        failedCount: availableRiderCount,
        skippedReason: 'no_telegram_bound_riders',
      },
    };
  }

  const restaurantId = String(order.shopSlug || order.shopId || '').trim();
  if (!restaurantId) {
    return {
      ok: true,
      summary: {
        ...baseSummary,
        failedCount: telegramBoundCount,
        skippedReason: 'missing_restaurant_id',
        attempts: baseSummary.attempts.map((attempt) => (
          attempt.telegramChatIdBound
            ? { ...attempt, error: 'missing_restaurant_id' }
            : attempt
        )),
      },
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
        url: new URL('/api/telegram/send', request.url).toString(),
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
      let parsedResponse: Record<string, unknown> = {};
      try {
        parsedResponse = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        parsedResponse = {};
      }
      if (!sendRes.ok || parsedResponse.success === false || parsedResponse.ok === false) {
        return {
          riderId: String(rider.id || '').trim(),
          riderName: String(rider.name || '未命名骑手').trim(),
          riderPhone: riderPhone,
          telegramChatIdBound: true,
          delivered: false,
          error: responseText.trim() || `telegram_send_http_${sendRes.status}`,
        };
      }

      const rawResult = parsedResponse.result;
      const messageId = Number(
        (rawResult && typeof rawResult === 'object'
          ? (rawResult as { message_id?: unknown }).message_id
          : undefined)
        ?? parsedResponse.message_id
        ?? 0,
      );

      return {
        riderId: String(rider.id || '').trim(),
        riderName: String(rider.name || '未命名骑手').trim(),
        riderPhone: riderPhone,
        telegramChatIdBound: true,
        delivered: true,
        ...(messageId > 0 ? { messageRef: { chatId: riderChatId, messageId } } : {}),
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
    ok: true,
    summary: {
      availableRiderCount,
      telegramBoundCount,
      deliveredCount,
      failedCount,
      ...(firstDeliveredMessageRef ? { telegramMessageRef: firstDeliveredMessageRef } : {}),
      attempts: mergedAttempts,
    },
  };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const { parsedBody, action, orderId } = parseDispatchRequest(await request.text());

  if (!orderId) {
    return buildFailureResponse({
      error: 'order_id_required',
      status: 400,
    });
  }

  if (!isDispatchAction(action)) {
    return buildFailureResponse({
      error: 'unsupported_action',
      status: 400,
    });
  }

  const orderResult = await loadDispatchOrder({
    request,
    cookies,
    parsedBody,
    orderId,
  });
  if (!orderResult.ok) return orderResult.response;

  if (action === 'republish_on_timeout') {
    return handleRepublishOnTimeout({
      request,
      cookies,
      orderId,
      order: orderResult.order,
      parsedBody,
    });
  }

  return handlePublishOrRemind({
    request,
    cookies,
    orderId,
    order: orderResult.order,
    parsedBody,
    action,
  });
};
