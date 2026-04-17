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
  buildRiderOrderView,
  filterAvailableRidersForOrder,
} from '../../../lib/rider-dispatch.ts';
import {
  buildAdminAssignedOrderTelegramMessage,
  buildTelegramShortClaimCallback,
} from '../../../lib/telegram-dispatch.ts';
import {
  fetchAdminOrderDetails,
  persistTelegramMessageRef,
  readAdminOrderSummary,
  sendTelegramDispatchMessage,
} from '../../../lib/admin-telegram-dispatch.ts';
import { readTelegramSendShopSlug } from '../../../lib/rider-progress-shared.ts';

export const prerender = false;


type RiderFetchResult =
  | { success: true; riders: AssignableRider[] }
  | { success: false; status: number; error: string; upstreamBody?: string };

function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
}

function readJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
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
  fallbackChatId,
  inlineTelegramBotToken,
}: {
  request: Request;
  rider: AssignableRider;
  shopSlug: string;
  orderId: string;
  pickupEtaMinutes: number;
  orderSummary: {
    orderNo: string;
    shopName: string;
    shopAddress: string;
    shopMapUrl: string;
    address: string;
    deliveryMapUrl: string;
    phone: string;
    totalAmount: number;
    scheduledFor: string;
    itemSummary: string[];
  };
  fallbackChatId?: string;
  inlineTelegramBotToken?: string;
}): Promise<
  | {
    success: true;
    chatId: string;
    chatIdSource: 'rider' | 'request';
    shopSlug: string;
    hasReplyMarkup: boolean;
    inlineKeyboardRows: number;
    inlineKeyboardButtons: number;
    callbackDataLength: number;
    messageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
    upstreamHasReplyMarkup?: boolean;
    upstreamInlineKeyboardRows?: number;
    upstreamInlineKeyboardButtons?: number;
  }
  | { success: false; error: string; chatId?: string; chatIdSource?: 'rider' | 'request' | 'missing'; shopSlug: string }
> {
  const riderChatId = String(readRiderChatId(rider) || '').trim();
  const requestChatId = String(fallbackChatId || '').trim();
  const chatId = String(riderChatId || requestChatId).trim();
  const chatIdSource = riderChatId ? 'rider' : requestChatId ? 'request' : 'missing';
  if (!chatId) return { success: false, error: 'telegram_chat_id_missing', chatIdSource, shopSlug };

  try {
    let claimCallbackData = '';
    let declineCallbackData = '';
    try {
      const callbackBase = {
        orderId: Number(orderId),
        riderId: Number(rider.id || 0),
        riderName: String(rider.name || '').trim(),
        riderPhone: String(rider.phone || '').trim(),
        restaurantId: String(shopSlug || 'admin').trim() || 'admin',
        telegramChatId: chatId,
      };
      claimCallbackData = buildTelegramShortClaimCallback(callbackBase);
      declineCallbackData = buildTelegramShortClaimCallback({
        ...callbackBase,
        action: 'decline',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message !== 'missing_telegram_callback_secret') throw error;
      return {
        success: false,
        error: 'telegram_callback_buttons_unavailable',
        chatId,
        chatIdSource,
        shopSlug,
      };
    }

    const message = buildAdminAssignedOrderTelegramMessage({
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
      claimCallbackData: claimCallbackData || undefined,
      declineCallbackData: declineCallbackData || undefined,
    });

    const requestPayload = {
      ...(shopSlug ? { shop_slug: shopSlug } : {}),
      ...(inlineTelegramBotToken ? { telegramBotToken: inlineTelegramBotToken } : {}),
      chat_id: chatId,
      chatId,
      text: message.text,
      reply_markup: message.replyMarkup,
    };
    const inlineKeyboardRows = Array.isArray(message.replyMarkup?.inline_keyboard)
      ? message.replyMarkup.inline_keyboard.length
      : 0;
    const inlineKeyboardButtons = Array.isArray(message.replyMarkup?.inline_keyboard)
      ? message.replyMarkup.inline_keyboard.reduce((sum, row) => sum + row.length, 0)
      : 0;
    const callbackData = Array.isArray(message.replyMarkup?.inline_keyboard)
      ? message.replyMarkup.inline_keyboard
        .flat()
        .map((button) => String((button as { callback_data?: unknown })?.callback_data || '').trim())
        .find(Boolean) || ''
      : '';

    const sendResult = await sendTelegramDispatchMessage({
      request,
      payload: requestPayload,
    });

    if (!sendResult.ok) {
      return {
        success: false,
        error: sendResult.error,
        chatId,
        chatIdSource,
        shopSlug,
      };
    }

    return {
      success: true,
      chatId,
      chatIdSource,
      shopSlug,
      hasReplyMarkup: inlineKeyboardRows > 0,
      inlineKeyboardRows,
      inlineKeyboardButtons,
      callbackDataLength: callbackData.length,
      ...(sendResult.messageRef ? { messageRef: sendResult.messageRef } : {}),
      ...(typeof sendResult.parsedResponse?.hasReplyMarkup === 'boolean' ? { upstreamHasReplyMarkup: sendResult.parsedResponse.hasReplyMarkup } : {}),
      ...(Number.isFinite(Number(sendResult.parsedResponse?.inlineKeyboardRows)) ? { upstreamInlineKeyboardRows: Number(sendResult.parsedResponse?.inlineKeyboardRows) } : {}),
      ...(Number.isFinite(Number(sendResult.parsedResponse?.inlineKeyboardButtons)) ? { upstreamInlineKeyboardButtons: Number(sendResult.parsedResponse?.inlineKeyboardButtons) } : {}),
    };
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
    return {
      success: false,
      error: errorMessage || 'telegram_send_failed',
      chatId,
      chatIdSource,
      shopSlug,
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
  const riderTelegramChatId = String(body.riderTelegramChatId || '').trim();
  const inlineTelegramBotToken = String(body.telegramBotToken || body.telegram_bot_token || '').trim();

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

  const [ridersResult, fetchedOrderDetails] = await Promise.all([
    fetchAvailableRiders(request, cookies),
    fetchAdminOrderDetails({ request, cookies, orderId }),
  ]);
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

  const eligibleRiders = filterAvailableRidersForOrder(ridersResult.riders, fetchedOrderDetails.remarksJson);
  let target: AssignableRider | null = null;

  if (action === 'manual_assign') {
    target = eligibleRiders.find((row) => String(row.id || '').trim() === manualRiderId) || null;
    if (!target && ridersResult.riders.some((row) => String(row.id || '').trim() === manualRiderId)) {
      return new Response(JSON.stringify({ success: false, error: 'rider_already_declined_this_order' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (action === 'auto_assign') {
    target = pickNextAvailableRider({ riders: eligibleRiders, lastAssignedRiderId });
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

  const bodyOrderSummary = readAdminOrderSummary(body, orderId);
  const notifyShopSlug = readTelegramSendShopSlug(providedShopSlug) || fetchedOrderDetails.shopSlug;
  const orderSummary = fetchedOrderDetails.orderSummary ?? bodyOrderSummary;
  const telegramNotification = await notifyAssignedRider({
    request,
    rider: target,
    shopSlug: notifyShopSlug,
    orderId,
    pickupEtaMinutes,
    orderSummary,
    fallbackChatId: riderTelegramChatId,
    inlineTelegramBotToken,
  });

  let nextRemarksJson = fetchedOrderDetails.remarksJson;
  let warning: { code: string; upstream_status?: number; upstream_body?: string } | undefined;
  if (telegramNotification.success && telegramNotification.messageRef) {
    const latestOrderDetails = await fetchAdminOrderDetails({ request, cookies, orderId });
    if (!latestOrderDetails.ok || !latestOrderDetails.found) {
      warning = {
        code: 'telegram_message_ref_persist_failed',
      };
    } else {
      const remarksResult = await persistTelegramMessageRef({
        request,
        cookies,
        orderId,
        remarksJson: latestOrderDetails.remarksJson,
        messageRef: telegramNotification.messageRef,
      });
      if (!remarksResult.ok) {
        warning = {
          code: 'telegram_message_ref_persist_failed',
          upstream_status: remarksResult.status,
          upstream_body: remarksResult.upstreamBody,
        };
      } else {
        nextRemarksJson = remarksResult.remarksJson;
      }
    }
  }

  return new Response(JSON.stringify({
    success: true,
    rider: {
      id: target.id,
      name: target.name,
      phone: target.phone,
    },
    order: {
      remarksJson: nextRemarksJson,
    },
    ...(warning ? { warning } : {}),
    ...(!telegramNotification.success ? { telegram_notification: telegramNotification } : {}),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
