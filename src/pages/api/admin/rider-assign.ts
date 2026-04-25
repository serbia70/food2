import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import {
  buildAdminInvalidActionResponse,
  buildAdminNoAvailableRidersResponse,
  buildAdminOrderFetchFailedSimpleResponse,
  buildAdminOrderIdRequiredResponse,
  buildAdminOrderSnapshotRequiredResponse,
  buildAdminRiderAlreadyDeclinedResponse,
  finalizeAdminTelegramCompletionResponse,
  readAdminAssignOrderSummary,
  readAdminAssignableRidersOrResponse,
  readAdminOrderById,
  readAdminOrderShopSlug,
  readProtectedTelegramCallbackSecret,
  sendAdminTelegramToRider,
  updateAdminOrderStatusOrResponse,
  buildAdminTelegramSendPreparation,
  pickAdminSingleRiderById,
} from '../../../lib/rider-route-shared.ts';
import {
  buildAssignedOrderStatusPayload,
  pickNextAvailableRider,
  type AssignableRider,
} from '../../../lib/rider-assignment.ts';
import {
  filterAvailableRidersForOrder,
} from '../../../lib/rider-dispatch.ts';
import {
  buildAdminAssignedOrderTelegramMessage,
} from '../../../lib/telegram-dispatch.ts';

export const prerender = false;

type RiderAssignOrderSummary = {
  orderNo: string;
  shopName: string;
  shopMapUrl: string;
  address: string;
  deliveryMapUrl: string;
  phone: string;
  totalAmount: number;
  scheduledFor: string;
  itemSummary: string[];
};

async function fetchOrderDetails(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies'], orderId: string): Promise<{
  ok: boolean;
  shopSlug: string;
  remarksJson: string;
  orderSummary: RiderAssignOrderSummary | null;
}> {
  const result = await readAdminOrderById({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
  });
  if (!result.ok) return { ok: false, shopSlug: '', remarksJson: '', orderSummary: null };
  return {
    ok: true,
    shopSlug: readAdminOrderShopSlug(result.order),
    remarksJson: result.remarksJson,
    orderSummary: result.order ? readAdminAssignOrderSummary(result.order) : null,
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
  inlineTelegramBotToken,
  callbackSecretOverride,
}: {
  request: Request;
  rider: AssignableRider;
  shopSlug: string;
  orderId: string;
  pickupEtaMinutes: number;
  orderSummary: RiderAssignOrderSummary;
  fallbackChatId?: string;
  inlineTelegramBotToken?: string;
  callbackSecretOverride?: string;
}) {
  const prepared = buildAdminTelegramSendPreparation({
    orderId,
    rider,
    fallbackChatId,
    shopSlug,
    telegramBotToken: inlineTelegramBotToken,
    restaurantId: shopSlug,
    secretOverride: callbackSecretOverride,
  });

  return sendAdminTelegramToRider({
    request,
    rider,
    fallbackChatId: prepared.chatId,
    payloadBaseExtras: prepared.payloadBaseExtras,
    callbackBase: prepared.callbackBase,
    buildMessage: ({ claimCallbackData, declineCallbackData }) => buildAdminAssignedOrderTelegramMessage({
      orderNo: orderSummary.orderNo,
      shopName: orderSummary.shopName,
      address: orderSummary.address,
      totalAmount: orderSummary.totalAmount,
      phone: orderSummary.phone,
      pickupEtaMinutes,
      scheduledFor: orderSummary.scheduledFor,
      itemSummary: orderSummary.itemSummary,
      shopMapUrl: orderSummary.shopMapUrl,
      deliveryMapUrl: orderSummary.deliveryMapUrl,
      claimCallbackData,
      declineCallbackData,
    }),
  });
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

  const fetchedOrderDetails = await fetchOrderDetails(request, cookies, orderId);
  if (!fetchedOrderDetails.ok) {
    return buildAdminOrderFetchFailedSimpleResponse();
  }

  const eligibleRiders = filterAvailableRidersForOrder(ridersResult.riders, fetchedOrderDetails.remarksJson);
  let target: AssignableRider | null = null;

  if (action === 'manual_assign') {
    target = pickAdminSingleRiderById({ riders: eligibleRiders, riderId: manualRiderId });
    if (!target && pickAdminSingleRiderById({ riders: ridersResult.riders, riderId: manualRiderId })) {
      return buildAdminRiderAlreadyDeclinedResponse();
    }
  }

  if (action === 'auto_assign') {
    target = pickNextAvailableRider({ riders: eligibleRiders, lastAssignedRiderId });
  }

  if (!target) {
    return buildAdminNoAvailableRidersResponse();
  }

  if (!fetchedOrderDetails.orderSummary) {
    return buildAdminOrderSnapshotRequiredResponse();
  }

  const updateResult = await updateAdminOrderStatusOrResponse({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
    payload: buildAssignedOrderStatusPayload({ rider: target, pickupEtaMinutes }),
  });

  if (!updateResult.ok) {
    return updateResult.response;
  }

  const notifyShopSlug = fetchedOrderDetails.shopSlug || String(providedShopSlug || '').trim();
  const callbackSecretOverride = await readProtectedTelegramCallbackSecret(request);

  const telegramNotification = await notifyAssignedRider({
    request,
    rider: target,
    shopSlug: notifyShopSlug,
    orderId,
    pickupEtaMinutes,
    orderSummary: fetchedOrderDetails.orderSummary,
    fallbackChatId: riderTelegramChatId,
    inlineTelegramBotToken,
    callbackSecretOverride,
  });

  return finalizeAdminTelegramCompletionResponse({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
    ...(telegramNotification.success ? { messageRef: telegramNotification.messageRef } : {}),
    successPayload: {
      ...(!telegramNotification.success ? { telegram_notification: telegramNotification } : {}),
    },
    warningOptions: { remarksWriteFailedOnly: true },
  });
};

