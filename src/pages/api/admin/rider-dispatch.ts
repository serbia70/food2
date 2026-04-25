import type { APIRoute } from 'astro';
import { API_BASE_URL, DISPATCH_AUTO_REASSIGN_MINUTES } from '../../../config.ts';
import {
  readAdminOrderById,
} from '../../../lib/rider-route-admin-orders.ts';
import {
  readAdminAssignableRidersOrResponse,
} from '../../../lib/rider-route-admin-state.ts';
import {
  buildAdminInvalidActionResponse,
  buildAdminOrderIdRequiredResponse,
  buildAdminSimpleErrorResponse,
} from '../../../lib/rider-route-admin-http.ts';
import {
  runAdminSingleRiderExecution,
} from '../../../lib/rider-route-admin-execution.ts';
import {
  type DispatchOrderSnapshot,
  type RouteCookies,
  type TelegramDispatchResult,
  appendInvalidatedRiderIds,
  buildNextDispatchMetaForPublish,
  buildSkippedTelegramDispatchResponse,
  normalizeOrderId,
  normalizeRiderId,
  notifyTelegramRecipients,
  pickNextRiderOnTimeout,
  readDispatchOrderFromBody,
  resolveRiderForPublish,
  toPublicTelegramDispatchSummary,
  writeDispatchMetaRemarksAndMergeOrder,
} from '../../../lib/rider-route-admin-dispatch-flow.ts';
import { readDispatchMetaFromRemarks, type DispatchMeta } from '../../../lib/rider-dispatch.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.text();
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = JSON.parse(body) as Record<string, unknown>;
  } catch {}

  const action = String(parsedBody.action || '').trim();
  const orderId = normalizeOrderId(parsedBody.orderId || parsedBody.id);
  if (!orderId) {
    return buildAdminOrderIdRequiredResponse();
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
        return buildAdminSimpleErrorResponse('order_fetch_failed', orderResult.status);
      }

      order = orderResult.order as DispatchOrderSnapshot | null;
      if (!order || !order.id) {
        return buildAdminSimpleErrorResponse('order_snapshot_unavailable', 502);
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

      const ridersResult = await readAdminAssignableRidersOrResponse({
        request,
        cookies,
        apiBaseUrl: API_BASE_URL,
        coerce2xxTo502: true,
      });
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
      if (!telegramResult.ok) return telegramResult.response;

      return buildAdminTelegramCompletionResponse({
        successPayload: {
          telegram_dispatch: telegramResult.summary,
        },
        transformTelegramDispatch: toPublicTelegramDispatchSummary,
      });
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

    return runAdminSingleRiderExecution({
      request,
      cookies,
      apiBaseUrl: API_BASE_URL,
      orderId,
      updatePayload,
      sendTelegram: async () => {
        const telegramResult = await notifyTelegramRecipients(
          request,
          cookies,
          mergedOrder,
          riderFilter,
        );
        return telegramResult.ok
          ? { ok: true, result: telegramResult.summary }
          : telegramResult;
      },
      finalize: ({ result: telegramSummary }) => ({
        ...(action === 'publish' && telegramSummary.telegramMessageRef
          ? { messageRef: telegramSummary.telegramMessageRef }
          : {}),
        successPayload: {
          telegram_dispatch: telegramSummary,
        },
      }),
      transformTelegramDispatch: toPublicTelegramDispatchSummary,
    });
  }

  return buildAdminInvalidActionResponse('unsupported_action');
};
