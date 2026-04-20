import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import {
  type AdminWarningShape,
  buildAdminOrderUpdateFailedResponse,
  buildAdminRidersReadFailureResponse,
  buildTelegramMessageRefPersistWarning,
  persistAdminTelegramMessageRef,
  readAdminAssignableRiders,
  readAdminOrderById,
  readJsonObject,
  updateAdminOrderStatus,
} from '../../../lib/rider-route-shared.ts';
import {
  buildAssignedOrderStatusPayload,
  pickNextAvailableRider,
  type AssignableRider,
} from '../../../lib/rider-assignment.ts';
import {
  buildRiderOrderView,
  filterAvailableRidersForOrder,
  type DispatchMeta,
} from '../../../lib/rider-dispatch.ts';
import {
  buildAdminAssignedOrderTelegramMessage,
  buildTelegramShortClaimCallback,
} from '../../../lib/telegram-dispatch.ts';

export const prerender = false;


function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
}

function readOrderSummaryItems(row: Record<string, unknown>): Array<{ name?: unknown; quantity?: unknown }> {
  if (Array.isArray(row.items)) return row.items as Array<{ name?: unknown; quantity?: unknown }>;

  const rawItemsJson = row.itemsJson ?? row.items_json;
  if (typeof rawItemsJson !== 'string' || !rawItemsJson.trim()) return [];

  try {
    const parsed = JSON.parse(rawItemsJson) as unknown;
    return Array.isArray(parsed) ? parsed as Array<{ name?: unknown; quantity?: unknown }> : [];
  } catch {
    return [];
  }
}

function normalizeNotifyShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

function readOrderShopSlug(row: Record<string, unknown> | null | undefined): string {
  if (!row) return '';
  return normalizeNotifyShopSlug(row.shopSlug || row.shop_slug || row.restaurantSlug || row.restaurant_slug || '');
}

function readOrderSummaryFromRow(row: Record<string, unknown>): {
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
} {
  const items = readOrderSummaryItems(row);
  const parsedTotalAmount = Number(row.totalAmount ?? row.total_amount);
  const orderView = buildRiderOrderView({
    shopName: String(row.shopName ?? row.shop_name ?? '').trim(),
    restaurantName: String(row.restaurantName ?? row.restaurant_name ?? '').trim(),
    shopAddress: String(row.shopAddress ?? row.shop_address ?? '').trim(),
    restaurantAddress: String(row.restaurantAddress ?? row.restaurant_address ?? '').trim(),
    shopMapUrl: String(row.shopMapUrl ?? row.shop_map_url ?? '').trim(),
    tableInfo: String(row.tableInfo ?? row.table_info ?? '').trim(),
    deliveryAddress: String(row.deliveryAddress ?? row.delivery_address ?? '').trim(),
    deliveryMapUrl: String(row.deliveryMapUrl ?? row.delivery_map_url ?? '').trim(),
    userPhone: String(row.userPhone ?? row.user_phone ?? '').trim(),
    totalAmount: row.totalAmount ?? row.total_amount,
  });

  return {
    orderNo: String(row.orderNo ?? row.order_no ?? '').trim(),
    shopName: orderView.shopName,
    shopAddress: orderView.shopAddress,
    shopMapUrl: orderView.shopMapUrl,
    address: orderView.deliveryAddress || '未提供地址',
    deliveryMapUrl: orderView.deliveryMapUrl,
    phone: String(row.userPhone ?? row.user_phone ?? '').trim() || '-',
    totalAmount: Number.isFinite(parsedTotalAmount) ? parsedTotalAmount : 0,
    scheduledFor: String(row.scheduledFor ?? row.scheduled_for ?? '').trim(),
    itemSummary: items
      .map((item) => {
        const name = String(item?.name || '').trim();
        const quantity = Number(item?.quantity || 0);
        if (!name || !Number.isFinite(quantity) || quantity <= 0) return '';
        return `${name} x${quantity}`;
      })
      .filter(Boolean),
  };
}

async function fetchOrderDetails(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies'], orderId: string): Promise<{
  ok: boolean;
  found: boolean;
  shopSlug: string;
  remarksJson: string;
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
  } | null;
}> {
  const result = await readAdminOrderById({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
  });
  if (!result.ok) return { ok: false, found: false, shopSlug: '', remarksJson: '', orderSummary: null };
  return {
    ok: true,
    found: result.found,
    shopSlug: readOrderShopSlug(result.order),
    remarksJson: result.remarksJson,
    orderSummary: result.order ? readOrderSummaryFromRow(result.order) : null,
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
    messageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
  }
  | { success: false; error: string }
> {
  const riderChatId = String(readRiderChatId(rider) || '').trim();
  const requestChatId = String(fallbackChatId || '').trim();
  const chatId = String(riderChatId || requestChatId).trim();
  if (!chatId) return { success: false, error: 'telegram_chat_id_missing' };

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

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cookie = request.headers.get('cookie') || '';
    const authorization = String(request.headers.get('authorization') || '').trim();
    if (cookie) headers.cookie = cookie;
    if (authorization) headers.authorization = authorization;

    const requestPayload = {
      ...(shopSlug ? { shop_slug: shopSlug } : {}),
      ...(inlineTelegramBotToken ? { telegramBotToken: inlineTelegramBotToken } : {}),
      chat_id: chatId,
      chatId,
      text: message.text,
      reply_markup: message.replyMarkup,
    };

    const sendTelegram = async (payload: Record<string, unknown>) => {
      const response = await fetch(new URL('/api/telegram/send', request.url), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const responseText = await response.text();
      return {
        response,
        responseText,
        parsedResponse: readJsonObject(responseText),
      };
    };

    let { response, responseText, parsedResponse } = await sendTelegram(requestPayload);
    const shouldRetryWithoutReplyMarkup = !response.ok
      && response.headers.get('content-type')?.includes('text/html')
      && responseText.includes('502');

    if (shouldRetryWithoutReplyMarkup) {
      const retryPayload = {
        ...(shopSlug ? { shop_slug: shopSlug } : {}),
        ...(inlineTelegramBotToken ? { telegramBotToken: inlineTelegramBotToken } : {}),
        chat_id: chatId,
        chatId,
        text: message.text,
      };
      ({ response, responseText, parsedResponse } = await sendTelegram(retryPayload));
    }

    if (!response.ok || parsedResponse?.success === false || parsedResponse?.ok === false) {
      return {
        success: false,
        error: responseText.trim() || `telegram_send_http_${response.status}`,
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
      success: true,
      ...(messageId > 0 ? { messageRef: { chatId, messageId } } : {}),
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

  const ridersResult = await readAdminAssignableRiders({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
  });
  if (!ridersResult.success) {
    return buildAdminRidersReadFailureResponse(ridersResult);
  }

  const fetchedOrderDetails = await fetchOrderDetails(request, cookies, orderId);
  if (!fetchedOrderDetails.ok) {
    return new Response(JSON.stringify({ success: false, error: 'order_fetch_failed' }), {
      status: 502,
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

  if (!fetchedOrderDetails.orderSummary) {
    return new Response(JSON.stringify({ success: false, error: 'order_snapshot_required' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updateResult = await updateAdminOrderStatus({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
    payload: buildAssignedOrderStatusPayload({ rider: target, pickupEtaMinutes }),
  });

  if (!updateResult.ok) {
    return buildAdminOrderUpdateFailedResponse(updateResult, updateResult.status || 502);
  }

  const notifyShopSlug = normalizeNotifyShopSlug(providedShopSlug) || fetchedOrderDetails.shopSlug;

  const telegramNotification = await notifyAssignedRider({
    request,
    rider: target,
    shopSlug: notifyShopSlug,
    orderId,
    pickupEtaMinutes,
    orderSummary: fetchedOrderDetails.orderSummary,
    fallbackChatId: riderTelegramChatId,
    inlineTelegramBotToken,
  });

  let warning: AdminWarningShape | undefined;
  if (telegramNotification.success && telegramNotification.messageRef) {
    const persistResult = await persistAdminTelegramMessageRef({
      request,
      cookies,
      apiBaseUrl: API_BASE_URL,
      orderId,
      messageRef: telegramNotification.messageRef,
    });
    if (!persistResult.ok) {
      warning = buildTelegramMessageRefPersistWarning(persistResult, { remarksWriteFailedOnly: true });
    }
  }

  return new Response(JSON.stringify({
    success: true,
    ...(warning ? { warning } : {}),
    ...(!telegramNotification.success ? { telegram_notification: telegramNotification } : {}),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
