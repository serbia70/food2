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
  buildDispatchMetaRemarks,
  buildRiderOrderView,
  filterAvailableRidersForOrder,
  readDispatchMetaFromRemarks,
  type DispatchMeta,
} from '../../../lib/rider-dispatch.ts';
import {
  buildAdminAssignedOrderTelegramMessage,
  buildTelegramShortClaimCallback,
} from '../../../lib/telegram-dispatch.ts';

export const prerender = false;


type RiderFetchResult =
  | { success: true; riders: AssignableRider[] }
  | { success: false; status: number; error: string; upstreamBody?: string };

type OrderSummaryItem = { name?: unknown; quantity?: unknown };
type OrderSummaryInput = {
  orderNo?: unknown;
  order_no?: unknown;
  shopName?: unknown;
  shop_name?: unknown;
  restaurantName?: unknown;
  restaurant_name?: unknown;
  shopAddress?: unknown;
  shop_address?: unknown;
  restaurantAddress?: unknown;
  restaurant_address?: unknown;
  shopMapUrl?: unknown;
  shop_map_url?: unknown;
  tableInfo?: unknown;
  table_info?: unknown;
  deliveryAddress?: unknown;
  delivery_address?: unknown;
  deliveryMapUrl?: unknown;
  delivery_map_url?: unknown;
  userPhone?: unknown;
  user_phone?: unknown;
  totalAmount?: unknown;
  total_amount?: unknown;
  scheduledFor?: unknown;
  scheduled_for?: unknown;
  items?: unknown;
  itemsJson?: unknown;
  items_json?: unknown;
};

function readJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
}

function readOrderSummaryItems(raw: OrderSummaryInput): OrderSummaryItem[] {
  if (Array.isArray(raw.items)) return raw.items as OrderSummaryItem[];

  const rawItemsJson = raw.itemsJson ?? raw.items_json;
  if (typeof rawItemsJson !== 'string' || !rawItemsJson.trim()) return [];

  try {
    const parsed = JSON.parse(rawItemsJson) as unknown;
    return Array.isArray(parsed) ? parsed as OrderSummaryItem[] : [];
  } catch {
    return [];
  }
}

function readOrderSummary(body: Record<string, unknown>, orderId: string): {
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
  const raw = (body.orderSummary && typeof body.orderSummary === 'object')
    ? body.orderSummary as OrderSummaryInput
    : {};
  const items = readOrderSummaryItems(raw);

  const parsedTotalAmount = Number(raw.totalAmount ?? raw.total_amount);

  const orderView = buildRiderOrderView({
    shopName: String(raw.shopName ?? raw.shop_name ?? '').trim(),
    restaurantName: String(raw.restaurantName ?? raw.restaurant_name ?? '').trim(),
    shopAddress: String(raw.shopAddress ?? raw.shop_address ?? '').trim(),
    restaurantAddress: String(raw.restaurantAddress ?? raw.restaurant_address ?? '').trim(),
    shopMapUrl: String(raw.shopMapUrl ?? raw.shop_map_url ?? '').trim(),
    tableInfo: String(raw.tableInfo ?? raw.table_info ?? '').trim(),
    deliveryAddress: String(raw.deliveryAddress ?? raw.delivery_address ?? '').trim(),
    deliveryMapUrl: String(raw.deliveryMapUrl ?? raw.delivery_map_url ?? '').trim(),
    userPhone: String(raw.userPhone ?? raw.user_phone ?? '').trim(),
    totalAmount: raw.totalAmount ?? raw.total_amount,
  });

  return {
    orderNo: String(raw.orderNo ?? raw.order_no ?? orderId ?? '').trim(),
    shopName: orderView.shopName,
    shopAddress: orderView.shopAddress,
    shopMapUrl: orderView.shopMapUrl,
    address: orderView.deliveryAddress || '未提供地址',
    deliveryMapUrl: orderView.deliveryMapUrl,
    phone: String(raw.userPhone ?? raw.user_phone ?? '').trim() || '-',
    totalAmount: Number.isFinite(parsedTotalAmount) ? parsedTotalAmount : 0,
    scheduledFor: String(raw.scheduledFor ?? raw.scheduled_for ?? '').trim(),
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

function findOrderRow(payload: unknown, orderId: string): Record<string, unknown> | null {
  const normalizedOrderId = String(orderId || '').trim();
  if (!payload) return null;

  const pickFromRow = (row: unknown): Record<string, unknown> | null => {
    if (!row || typeof row !== 'object') return null;
    const data = row as Record<string, unknown>;
    const id = String(data.id || data.orderId || data.order_id || '').trim();
    if (normalizedOrderId) return id === normalizedOrderId ? data : null;
    return id ? data : null;
  };

  if (Array.isArray(payload)) {
    for (const row of payload) {
      const found = pickFromRow(row);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const direct = pickFromRow(data);
    if (direct) return direct;

    const nestedData = data.data;
    if (Array.isArray(nestedData)) {
      for (const row of nestedData) {
        const found = pickFromRow(row);
        if (found) return found;
      }
    } else if (nestedData && typeof nestedData === 'object') {
      const nested = nestedData as Record<string, unknown>;
      const nestedDirect = pickFromRow(nested);
      if (nestedDirect) return nestedDirect;
      if (Array.isArray(nested.orders)) {
        for (const row of nested.orders) {
          const found = pickFromRow(row);
          if (found) return found;
        }
      }
    }

    if (Array.isArray(data.orders)) {
      for (const row of data.orders) {
        const found = pickFromRow(row);
        if (found) return found;
      }
    }
  }

  return null;
}

function normalizeNotifyShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

function readOrderShopSlug(payload: unknown, orderId: string): string {
  const row = findOrderRow(payload, orderId);
  if (!row) return '';
  return normalizeNotifyShopSlug(row.shopSlug || row.shop_slug || row.restaurantSlug || row.restaurant_slug || '');
}

function readOrderSummaryFromRow(row: Record<string, unknown>, orderId: string): {
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
  return readOrderSummary({ orderSummary: row }, orderId);
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
  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders`,
    method: 'GET',
  });
  const text = await res.text();
  if (!res.ok || !text) return { ok: false, found: false, shopSlug: '', remarksJson: '', orderSummary: null };
  const parsed = readJsonObject(text);
  if (!parsed) return { ok: false, found: false, shopSlug: '', remarksJson: '', orderSummary: null };
  const row = findOrderRow(parsed, orderId);
  return {
    ok: true,
    found: Boolean(row),
    shopSlug: readOrderShopSlug(parsed, orderId),
    remarksJson: row && typeof row === 'object' ? String(row.remarksJson || '').trim() : '',
    orderSummary: row ? readOrderSummaryFromRow(row, orderId) : null,
  };
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

async function writeDispatchMetaRemarks({
  request,
  cookies,
  orderId,
  remarksJson,
  nextMeta,
}: {
  request: Request;
  cookies: Parameters<APIRoute['POST']>[0]['cookies'];
  orderId: string;
  remarksJson: string;
  nextMeta: DispatchMeta;
}) {
  const nextRemarks = buildDispatchMetaRemarks(remarksJson, nextMeta);
  const remarksRes = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders/remarks`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      remarks: nextRemarks,
    }),
  });
  const remarksText = await remarksRes.text();

  let remarksPayload: Record<string, unknown> = {};
  try {
    remarksPayload = JSON.parse(remarksText) as Record<string, unknown>;
  } catch {
    remarksPayload = {};
  }

  if (!remarksRes.ok || remarksPayload.success === false) {
    return {
      ok: false as const,
      status: remarksRes.status,
      upstreamBody: remarksText || JSON.stringify(remarksPayload),
    };
  }

  return {
    ok: true as const,
    remarksJson: JSON.stringify(nextRemarks),
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
        chatId,
        chatIdSource,
        shopSlug,
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
      chatId,
      chatIdSource,
      shopSlug,
      hasReplyMarkup: inlineKeyboardRows > 0,
      inlineKeyboardRows,
      inlineKeyboardButtons,
      callbackDataLength: callbackData.length,
      ...(messageId > 0 ? { messageRef: { chatId, messageId } } : {}),
      ...(typeof parsedResponse?.hasReplyMarkup === 'boolean' ? { upstreamHasReplyMarkup: parsedResponse.hasReplyMarkup } : {}),
      ...(Number.isFinite(Number(parsedResponse?.inlineKeyboardRows)) ? { upstreamInlineKeyboardRows: Number(parsedResponse?.inlineKeyboardRows) } : {}),
      ...(Number.isFinite(Number(parsedResponse?.inlineKeyboardButtons)) ? { upstreamInlineKeyboardButtons: Number(parsedResponse?.inlineKeyboardButtons) } : {}),
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

  const ridersResult = await fetchAvailableRiders(request, cookies);
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

  const fetchedOrderDetails = await fetchOrderDetails(request, cookies, orderId);
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

  const bodyOrderSummary = readOrderSummary(body, orderId);
  const notifyShopSlug = normalizeNotifyShopSlug(providedShopSlug) || fetchedOrderDetails.shopSlug;
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
    const latestOrderDetails = await fetchOrderDetails(request, cookies, orderId);
    if (!latestOrderDetails.ok || !latestOrderDetails.found) {
      warning = {
        code: 'telegram_message_ref_persist_failed',
      };
    } else {
      const nextMeta: DispatchMeta = {
        ...readDispatchMetaFromRemarks(latestOrderDetails.remarksJson),
        telegramMessageRef: telegramNotification.messageRef,
      };
      const remarksResult = await writeDispatchMetaRemarks({
        request,
        cookies,
        orderId,
        remarksJson: latestOrderDetails.remarksJson,
        nextMeta,
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
