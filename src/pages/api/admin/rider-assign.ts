import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import {
  buildAdminInvalidActionResponse,
  buildAdminOrderIdRequiredResponse,
  buildAdminSimpleErrorResponse,
} from '../../../lib/rider-route-admin-http.ts';
import {
  runAdminSingleRiderExecution,
} from '../../../lib/rider-route-admin-execution.ts';
import {
  readAdminAssignOrderDetails,
} from '../../../lib/rider-route-admin-orders.ts';
import {
  sendAdminAssignedOrderTelegramToRider,
} from '../../../lib/rider-route-admin-telegram.ts';
import {
  readAdminAssignableRidersOrResponse,
  readProtectedTelegramCallbackSecret,
  resolveAdminRequestedRiderSelection,
} from '../../../lib/rider-route-admin-state.ts';
import {
  buildAssignedOrderStatusPayload,
  pickNextAvailableRider,
  type AssignableRider,
} from '../../../lib/rider-assignment.ts';
import {
  filterAvailableRidersForOrder,
} from '../../../lib/rider-dispatch.ts';

export const prerender = false;

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
  const inlineTelegramBotToken = String(body.telegramBotToken || body.telegram_bot_token || '').trim();

  if (action !== 'manual_assign' && action !== 'auto_assign') {
    return buildAdminInvalidActionResponse('invalid_action');
  }

  if (!orderId) {
    return buildAdminOrderIdRequiredResponse();
  }

  const ridersResult = await readAdminAssignableRidersOrResponse({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
  });
  if (!ridersResult.ok) {
    return ridersResult.response;
  }

  const fetchedOrderDetails = await readAdminAssignOrderDetails({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
  });
  if (!fetchedOrderDetails.ok) {
    return buildAdminSimpleErrorResponse('order_fetch_failed', 502);
  }

  const eligibleRiders = filterAvailableRidersForOrder(ridersResult.riders, fetchedOrderDetails.remarksJson);
  let target: AssignableRider | null = null;

  if (action === 'manual_assign') {
    const selected = resolveAdminRequestedRiderSelection({
      riderId: manualRiderId,
      eligibleRiders,
      allRiders: ridersResult.riders,
    });
    if (selected.kind === 'selected') {
      target = selected.rider;
    } else if (selected.kind === 'declined') {
      return buildAdminSimpleErrorResponse('rider_already_declined_this_order', 409);
    }
  }

  if (action === 'auto_assign') {
    target = pickNextAvailableRider({ riders: eligibleRiders, lastAssignedRiderId });
  }

  if (!target) {
    return buildAdminSimpleErrorResponse('no_available_riders', 409);
  }

  if (!fetchedOrderDetails.orderSummary) {
    return buildAdminSimpleErrorResponse('order_snapshot_required', 409);
  }

  return runAdminSingleRiderExecution({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
    updatePayload: buildAssignedOrderStatusPayload({ rider: target, pickupEtaMinutes }),
    sendTelegram: async () => {
      const notifyShopSlug = fetchedOrderDetails.shopSlug || String(providedShopSlug || '').trim();
      const callbackSecretOverride = await readProtectedTelegramCallbackSecret(request);

      return {
        ok: true,
        result: await sendAdminAssignedOrderTelegramToRider({
          request,
          rider: target,
          shopSlug: notifyShopSlug,
          orderId,
          pickupEtaMinutes,
          orderSummary: fetchedOrderDetails.orderSummary,
          fallbackChatId: riderTelegramChatId,
          inlineTelegramBotToken,
          callbackSecretOverride,
        }),
      };
    },
    finalize: ({ result: telegramNotification }) => ({
      ...(telegramNotification.success && telegramNotification.messageRef ? { messageRef: telegramNotification.messageRef } : {}),
      successPayload: {
        ...(!telegramNotification.success ? { telegram_notification: telegramNotification } : {}),
      },
    }),
  });
};


