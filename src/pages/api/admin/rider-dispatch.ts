import type { APIRoute } from 'astro';
import { API_BASE_URL, DISPATCH_AUTO_REASSIGN_MINUTES, SITE_BASE_URL } from '../../../config.ts';
import { proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import {
  type AdminWarningShape,
  buildAdminDispatchMetaWriteFailedResponse,
  buildAdminJsonResponse,
  buildAdminOrderFetchFailedResponse,
  buildAdminOrderUpdateFailedResponse,
  buildAdminRidersReadFailureResponse,
  buildAdminSimpleErrorResponse,
  persistAdminTelegramMessageRefHandled,
  readAdminAssignableRiders,
  readJsonObject,
  readAdminOrderById,
  updateAdminOrderStatus,
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

interface TelegramRiderRow {
  id?: number | string | null;
  name?: string | null;
  phone?: string | null;
  telegramChatId?: string | null;
  telegram_chat_id?: string | null;
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

type TelegramDispatchSkippedSummary = Pick<TelegramDispatchSummary, 'failedCount' | 'skippedReason' | 'attempts'>;

type RouteCookies = Parameters<APIRoute['POST']>[0]['cookies'];
type AvailableRidersReadResult = Awaited<ReturnType<typeof readAdminAssignableRiders>>;
type TelegramDispatchResult =
  | { ok: true; summary: TelegramDispatchSummary }
  | { ok: false; error: string; upstreamStatus: number; upstreamBody?: string };

function normalizeOrderId(orderId: unknown): string {
  return String(orderId || '').trim();
}

function normalizeRiderId(value: unknown): string {
  return String(value || '').trim();
}

function readRiderChatId(rider: TelegramRiderRow): string {
  return String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
}

type TelegramDispatchPublicSummary = Omit<
  TelegramDispatchSummary,
  'availableRiderCount' | 'telegramBoundCount' | 'deliveredCount' | 'telegramMessageRef'
>;

type TelegramDispatchPublicResponseBody = {
  success: true;
  telegram_dispatch: TelegramDispatchPublicSummary | TelegramDispatchSkippedSummary;
  warning?: AdminWarningShape;
};

function toPublicTelegramDispatchSummary(
  summary: TelegramDispatchSummary | TelegramDispatchSkippedSummary,
): TelegramDispatchPublicSummary | TelegramDispatchSkippedSummary {
  const normalized: Record<string, unknown> = { ...summary };
  delete normalized.availableRiderCount;
  delete normalized.telegramBoundCount;
  delete normalized.deliveredCount;
  delete normalized.telegramMessageRef;
  return normalized as TelegramDispatchPublicSummary | TelegramDispatchSkippedSummary;
}

function buildTelegramDispatchResponse(
  summary: TelegramDispatchSummary | TelegramDispatchSkippedSummary,
  warning?: AdminWarningShape,
): Response {
  return buildAdminJsonResponse({
    success: true,
    telegram_dispatch: toPublicTelegramDispatchSummary(summary),
    ...(warning ? { warning } : {}),
  } satisfies TelegramDispatchPublicResponseBody);
}

function buildSkippedTelegramDispatchResponse(
  skippedReason: NonNullable<TelegramDispatchSkippedSummary['skippedReason']>,
): Response {
  return buildTelegramDispatchResponse({
    failedCount: 0,
    skippedReason,
    attempts: [],
  });
}

function readDispatchOrderFromBody(payload: Record<string, unknown>, orderId: string): DispatchOrderSnapshot | null {
  const directOrder = payload.order && typeof payload.order === 'object'
    ? payload.order as DispatchOrderSnapshot
    : null;
  if (directOrder && normalizeOrderId(directOrder.id) === orderId) return directOrder;

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

function appendInvalidatedRiderIds(existing: string[], riderId: string): string[] {
  const filtered = existing.filter(Boolean);
  const next = riderId ? [...filtered, riderId] : filtered;
  return Array.from(new Set(next));
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
  const prevCurrentRiderId = normalizeRiderId(existingMeta.currentRiderId);
  const isReassigned = !!forcedRiderId && !!prevCurrentRiderId && prevCurrentRiderId !== selectedRiderId;
  const baseTs = Date.parse(nowIso);
  const assignedAt = Number.isFinite(baseTs) ? new Date(baseTs).toISOString() : new Date().toISOString();
  const expiresAt = new Date(Date.parse(assignedAt) + DISPATCH_AUTO_REASSIGN_MINUTES * 60_000).toISOString();

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

function pickNextRiderOnTimeout({
  riders,
  currentRiderId,
  invalidatedRiderIds,
}: {
  riders: AssignableRider[];
  currentRiderId: string;
  invalidatedRiderIds: string[];
}): AssignableRider | null {
  const normalizedCurrent = normalizeRiderId(currentRiderId);
  if (!normalizedCurrent) return null;

  const excluded = new Set(invalidatedRiderIds.map(normalizeRiderId).filter(Boolean));
  const candidates = riders.filter((rider) => !excluded.has(normalizeRiderId(rider.id)));
  if (candidates.length === 0) return null;

  const currentIndex = candidates.findIndex((rider) => normalizeRiderId(rider.id) === normalizedCurrent);
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
    remarksJson: String(order.remarksJson || '').trim(),
    nextMeta,
  });
}

async function writeDispatchMetaRemarksAndMergeOrder({
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
}): Promise<
  | { ok: true; mergedOrder: DispatchOrderSnapshot }
  | { ok: false; response: Response }
> {
  const remarksResult = await writeDispatchMetaRemarks({
    request,
    cookies,
    orderId,
    order,
    nextMeta,
  });
  if (!remarksResult.ok) {
    return {
      ok: false,
      response: buildAdminDispatchMetaWriteFailedResponse(remarksResult),
    };
  }

  return {
    ok: true,
    mergedOrder: {
      ...order,
      remarksJson: remarksResult.remarksJson,
    } satisfies DispatchOrderSnapshot,
  };
}

async function resolveRiderForPublish({
  request,
  cookies,
  forcedRiderId,
  existingMeta,
}: {
  request: Request;
  cookies: RouteCookies;
  forcedRiderId: string;
  existingMeta: DispatchMeta;
}): Promise<
  | { ok: true; selectedRiderId: string }
  | { ok: false; response: Response }
> {
  const ridersResult = await readAssignableRidersOrResponse(request, cookies);
  if (!ridersResult.ok) {
    return ridersResult;
  }

  const normalizedForcedRiderId = normalizeRiderId(forcedRiderId);
  const scopedRiders = normalizedForcedRiderId
    ? ridersResult.riders.filter((rider) => normalizeRiderId(rider.id) === normalizedForcedRiderId)
    : ridersResult.riders;
  const selectedRiderId = normalizeRiderId(scopedRiders[0]?.id);

  if (normalizedForcedRiderId && !selectedRiderId) {
    return {
      ok: false,
      response: buildAdminJsonResponse({
        success: false,
        error: 'forced_rider_not_found',
        forcedRiderId,
      }, 400),
    };
  }

  return {
    ok: true,
    selectedRiderId: selectedRiderId || normalizeRiderId(existingMeta.currentRiderId),
  };
}

function buildTelegramDispatchFailureResponse(result: Extract<TelegramDispatchResult, { ok: false }>): Response {
  return buildAdminRidersReadFailureResponse({
    success: false,
    status: result.upstreamStatus,
    error: result.error,
    ...(result.upstreamBody ? { upstreamBody: result.upstreamBody } : {}),
  });
}

async function readAssignableRidersOrResponse(
  request: Request,
  cookies: RouteCookies,
): Promise<
  | { ok: true; riders: AvailableRidersReadResult['riders'] }
  | { ok: false; response: Response }
> {
  const ridersResult = await readAdminAssignableRiders({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
  });
  if (!ridersResult.success) {
    return {
      ok: false,
      response: buildAdminRidersReadFailureResponse(ridersResult, { coerce2xxTo502: true }),
    };
  }
  return { ok: true, riders: ridersResult.riders };
}

async function notifyTelegramRecipients(
  request: Request,
  cookies: RouteCookies,
  order: DispatchOrderSnapshot,
  riderFilter?: (rider: TelegramRiderRow) => boolean,
): Promise<TelegramDispatchResult> {
  const ridersResult = await readAdminAssignableRiders({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
  });
  if (!ridersResult.success) {
    return {
      ok: false,
      error: ridersResult.error,
      upstreamStatus: ridersResult.status,
      ...(ridersResult.upstreamBody ? { upstreamBody: ridersResult.upstreamBody } : {}),
    };
  }

  const scopedRiders = riderFilter ? ridersResult.riders.filter(riderFilter) : ridersResult.riders;
  const availableRiderCount = scopedRiders.length;
  const telegramRiders = scopedRiders.filter((rider) => readRiderChatId(rider) !== '');
  const telegramBoundCount = telegramRiders.length;

  const baseSummary: TelegramDispatchSummary = {
    availableRiderCount,
    telegramBoundCount,
    deliveredCount: 0,
    failedCount: 0,
    attempts: scopedRiders.map((rider) => {
      const riderChatId = readRiderChatId(rider);
      const riderName = String(rider.name || '未命名骑手').trim();
      const riderPhone = String(rider.phone || '').trim();
      const telegramChatIdBound = riderChatId !== '';
      return {
        riderId: normalizeRiderId(rider.id),
        riderName,
        riderPhone,
        telegramChatIdBound,
        delivered: false,
        error: telegramChatIdBound ? undefined : 'telegram_not_bound',
      };
    }),
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

  const orderView = buildRiderOrderView(order);
  const totalAmount = Number(order.totalAmount || 0);
  const pickupEtaMinutes = Number(order.pickupEtaMinutes || 0);
  const phone = String(order.userPhone || '');
  const rawCookie = String(request.headers.get('cookie') || '').trim();
  const telegramSendUrl = new URL('/api/telegram/send', request.url).toString();
  const dashboardLink = buildTelegramDeepLink({
    baseUrl: String(SITE_BASE_URL || '').trim().replace(/\/$/, '') || 'https://food2.serbia70.com',
    restaurantId,
    orderId: order.id,
  });

  const attempts = await Promise.all(telegramRiders.map(async (rider): Promise<TelegramDispatchAttempt> => {
    const riderId = Number(rider.id || 0);
    const riderName = String(rider.name || '').trim();
    const riderPhone = String(rider.phone || '').trim();
    const riderChatId = readRiderChatId(rider);
    const attemptBase = {
      riderId: normalizeRiderId(rider.id),
      riderName: riderName || '未命名骑手',
      riderPhone,
      telegramChatIdBound: true,
    };
    let claimCallbackData: string | undefined;
    if (riderId > 0 && riderName && riderPhone && riderChatId) {
      try {
        claimCallbackData = buildTelegramClaimCallback({
          orderId: Number(order.id || 0),
          riderId,
          riderName,
          restaurantId,
          riderPhone,
          telegramChatId: riderChatId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message !== 'missing_telegram_callback_secret') throw error;
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
      const sendRes = await proxyAdminRequest({
        request,
        cookies,
        url: telegramSendUrl,
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
      const parsedResponse = readJsonObject(responseText);
      if (!sendRes.ok || parsedResponse?.success === false || parsedResponse?.ok === false) {
        return {
          ...attemptBase,
          delivered: false,
          error: responseText.trim() || `telegram_send_http_${sendRes.status}`,
        };
      }

      const rawResult = parsedResponse?.result;
      const messageId = Number(
        (rawResult && typeof rawResult === 'object'
          ? (rawResult as { message_id?: unknown }).message_id
          : undefined)
        ?? parsedResponse?.message_id
        ?? 0,
      );

      return {
        ...attemptBase,
        delivered: true,
        ...(messageId > 0 ? { messageRef: { chatId: riderChatId, messageId } } : {}),
      };
    } catch (error) {
      return {
        ...attemptBase,
        delivered: false,
        error: error instanceof Error ? error.message : 'telegram_send_failed',
      };
    }
  }));

  const mergedAttempts = baseSummary.attempts.map((attempt) => {
    if (!attempt.telegramChatIdBound) return attempt;
    return attempts.find((item) => item.riderId === attempt.riderId) || attempt;
  });
  const deliveredCount = mergedAttempts.filter((a) => a.delivered).length;
  const failedCount = mergedAttempts.length - deliveredCount;
  const firstDeliveredMessageRef = mergedAttempts.find((a) => a.delivered && a.messageRef)?.messageRef;

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
  const body = await request.text();
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = JSON.parse(body) as Record<string, unknown>;
  } catch {}

  const action = String(parsedBody.action || '').trim();
  const orderId = normalizeOrderId(parsedBody.orderId || parsedBody.id);
  if (!orderId) {
    return buildAdminSimpleErrorResponse('order_id_required', 400);
  }

  if (action === 'publish' || action === 'remind' || action === 'republish_on_timeout') {
    let order = readDispatchOrderFromBody(parsedBody, orderId);

    if (!order) {
      const orderResult = await readAdminOrderById({
        request,
        cookies,
        apiBaseUrl: API_BASE_URL,
        orderId,
      });

      if (!orderResult.ok) {
        return buildAdminOrderFetchFailedResponse(orderResult);
      }

      order = orderResult.order as DispatchOrderSnapshot | null;
      if (!order || !order.id) {
        return buildAdminJsonResponse({
          success: false,
          error: 'order_snapshot_unavailable',
          raw_response_text: orderResult.rawText,
        }, 502);
      }
    }

    const forcedRiderId = normalizeRiderId(parsedBody.forceRiderId);
    const maybeNowIso = String(parsedBody.nowIso || parsedBody.nowISO || '').trim();
    const nowIso = Date.parse(maybeNowIso) > 0 ? new Date(maybeNowIso).toISOString() : new Date().toISOString();
    const existingRemarksJson = String(parsedBody.remarksJson || order.remarksJson || '').trim();
    const existingMeta = readDispatchMetaFromRemarks(existingRemarksJson);

    const currentStatus = String(order.status || '').trim();
    const awaitingCourierStatus = currentStatus || 'awaiting_courier';
    const publishStatus = String(parsedBody.status || '').trim() || 'awaiting_courier';

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
          status: awaitingCourierStatus,
          riderRemindCount: parsedBody.riderRemindCount,
          riderLastRemindedAt: parsedBody.riderLastRemindedAt,
        };

    const updateResult = await updateAdminOrderStatus({
      request,
      cookies,
      apiBaseUrl: API_BASE_URL,
      orderId,
      payload: updatePayload,
    });

    if (!updateResult.ok) {
      return buildAdminOrderUpdateFailedResponse(updateResult);
    }

    const mergedOrderBase = {
      ...order,
      status: action === 'publish' ? publishStatus : awaitingCourierStatus,
      pickupEtaMinutes: parsedBody.pickupEtaMinutes ?? order.pickupEtaMinutes,
      pickupReadyAt: parsedBody.pickupReadyAt ?? order.pickupReadyAt,
      riderBroadcastedAt: parsedBody.riderBroadcastedAt ?? order.riderBroadcastedAt,
      riderRemindCount: parsedBody.riderRemindCount ?? order.riderRemindCount,
      riderLastRemindedAt: parsedBody.riderLastRemindedAt ?? order.riderLastRemindedAt,
      remarksJson: existingRemarksJson,
    } satisfies DispatchOrderSnapshot;

    if (action === 'republish_on_timeout') {
      if (currentStatus !== 'awaiting_courier') {
        return buildSkippedTelegramDispatchResponse('order_status_changed');
      }

      const ridersResult = await readAssignableRidersOrResponse(request, cookies);
      if (!ridersResult.ok) {
        return ridersResult.response;
      }

      const currentRiderId = normalizeRiderId(existingMeta.currentRiderId);
      const nextRider = pickNextRiderOnTimeout({
        riders: ridersResult.riders,
        currentRiderId,
        invalidatedRiderIds: existingMeta.invalidatedRiderIds,
      });

      const nextRiderId = normalizeRiderId(nextRider?.id);
      const expiresAt = new Date(Date.parse(nowIso) + DISPATCH_AUTO_REASSIGN_MINUTES * 60_000).toISOString();
      const timeoutMeta: DispatchMeta = {
        ...existingMeta,
        currentRiderId: nextRiderId,
        currentAssignedAt: nextRider ? nowIso : '',
        currentExpiresAt: nextRider ? expiresAt : '',
        invalidatedRiderIds: appendInvalidatedRiderIds(existingMeta.invalidatedRiderIds, currentRiderId),
        lastInvalidationReason: 'timeout',
      };

      const remarksMergeResult = await writeDispatchMetaRemarksAndMergeOrder({
        request,
        cookies,
        orderId,
        order: mergedOrderBase,
        nextMeta: timeoutMeta,
      });
      if (!remarksMergeResult.ok) {
        return remarksMergeResult.response;
      }

      if (!nextRider) {
        return buildSkippedTelegramDispatchResponse('no_next_rider');
      }

      const telegramResult = await notifyTelegramRecipients(
        request,
        cookies,
        remarksMergeResult.mergedOrder,
        (rider) => normalizeRiderId(rider.id) === nextRiderId,
      );
      if (!telegramResult.ok) {
        return buildTelegramDispatchFailureResponse(telegramResult);
      }

      return buildTelegramDispatchResponse(telegramResult.summary);
    }

    let mergedOrder = mergedOrderBase;
    let riderFilter: ((rider: TelegramRiderRow) => boolean) | undefined;

    if (action === 'publish') {
      const resolved = await resolveRiderForPublish({
        request,
        cookies,
        forcedRiderId,
        existingMeta,
      });
      if (!resolved.ok) return resolved.response;

      if (resolved.selectedRiderId) {
        const nextMeta = buildNextDispatchMetaForPublish({
          existingMeta,
          forcedRiderId,
          selectedRiderId: resolved.selectedRiderId,
          nowIso,
        });

        const remarksMergeResult = await writeDispatchMetaRemarksAndMergeOrder({
          request,
          cookies,
          orderId,
          order: mergedOrderBase,
          nextMeta,
        });
        if (!remarksMergeResult.ok) {
          return remarksMergeResult.response;
        }
        mergedOrder = remarksMergeResult.mergedOrder;

        riderFilter = (rider) => normalizeRiderId(rider.id) === resolved.selectedRiderId;
      }
    }

    const telegramResult = await notifyTelegramRecipients(
      request,
      cookies,
      mergedOrder,
      riderFilter,
    );
    if (!telegramResult.ok) {
      return buildTelegramDispatchFailureResponse(telegramResult);
    }

    let warning: AdminWarningShape | undefined;

    if (action === 'publish' && telegramResult.summary.telegramMessageRef) {
      const handled = await persistAdminTelegramMessageRefHandled({
        request,
        cookies,
        apiBaseUrl: API_BASE_URL,
        orderId,
        messageRef: telegramResult.summary.telegramMessageRef,
      });

      warning = handled.warning;
    }

    return buildTelegramDispatchResponse(telegramResult.summary, warning);
  }

  return buildAdminSimpleErrorResponse('unsupported_action', 400);
};
