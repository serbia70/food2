import type { AstroCookies } from 'astro';
import { proxyAdminRequest } from './admin-api-route.ts';
import {
  fetchProtectedAdminMasterSettings,
  readTelegramCallbackSecretFromMasterSettings,
} from './admin-master-settings.ts';
import { type AssignableRider, readOnlineRiders } from './rider-assignment.ts';
import {
  buildDispatchMetaRemarks,
  buildRiderOrderView,
  readDispatchMetaFromRemarks,
  resolveRiderUnifiedStatus,
  type DispatchMeta,
  type ResolveRiderOrderActionResult,
  type RiderOrderAction,
} from './rider-dispatch.ts';
import {
  buildRiderSingleMessageTelegram,
  buildTelegramClaimCallback,
  buildTelegramDeepLink,
  buildTelegramDispatchMessage,
  buildTelegramEditMessagePayload,
  buildTelegramShortClaimCallback,
} from './telegram-dispatch.ts';

export interface RiderRouteOrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone: string;
}

export type AdminRidersReadResult =
  | { success: true; riders: AssignableRider[] }
  | { success: false; status: number; error: string; upstreamBody?: string };

export type AdminRidersReadFailure = Extract<AdminRidersReadResult, { success: false }>;

export function buildAdminRidersReadFailureResponse(
  result: AdminRidersReadFailure,
  options: { coerce2xxTo502?: boolean } = {},
): Response {
  const status = options.coerce2xxTo502 && result.status >= 200 && result.status < 300
    ? 502
    : result.status;

  return new Response(JSON.stringify({
    success: false,
    error: result.error,
    upstream_status: result.status,
    ...(result.upstreamBody ? { upstream_body: result.upstreamBody } : {}),
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildAdminJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildAdminSimpleErrorResponse(error: string, status: number): Response {
  return buildAdminJsonResponse({ success: false, error }, status);
}

export type AdminOrderReadResult =
  | {
    ok: true;
    found: boolean;
    order: Record<string, unknown> | null;
    remarksJson: string;
    rawText: string;
  }
  | {
    ok: false;
    status: number;
    upstreamBody: string;
  };

export type AdminDispatchMetaWriteResult =
  | { ok: true; remarksJson: string }
  | { ok: false; status: number; upstreamBody: string };

export type AdminOrderStatusUpdateResult =
  | { ok: true; status: number; bodyText: string; bodyJson: Record<string, unknown> }
  | { ok: false; status: number; bodyText: string; bodyJson: Record<string, unknown> };

export type AdminTelegramMessageRefPersistResult =
  | {
    ok: true;
    order: Record<string, unknown>;
    remarksJson: string;
  }
  | {
    ok: false;
    code: 'order_read_failed' | 'order_not_found' | 'remarks_write_failed';
    status?: number;
    upstreamBody?: string;
  };

export type AdminWarningShape = {
  code: string;
  upstream_status?: number;
  upstream_body?: string;
};

export type AdminTelegramNotificationFailure = {
  success: false;
  error: string;
};

export type AdminTelegramCompletionSuccessPayload<TTelegramDispatch> = {
  warning?: AdminWarningShape;
  telegram_notification?: AdminTelegramNotificationFailure;
  telegram_dispatch?: TTelegramDispatch;
};

export function buildAdminTelegramCompletionResponse<TTelegramDispatch, TPublicTelegramDispatch = TTelegramDispatch>({
  successPayload,
  transformTelegramDispatch,
}: {
  successPayload: AdminTelegramCompletionSuccessPayload<TTelegramDispatch>;
  transformTelegramDispatch?: (summary: TTelegramDispatch) => TPublicTelegramDispatch;
}): Response {
  const { telegram_dispatch, ...rest } = successPayload;
  return buildAdminJsonResponse({
    success: true,
    ...rest,
    ...(telegram_dispatch === undefined
      ? {}
      : {
          telegram_dispatch: transformTelegramDispatch
            ? transformTelegramDispatch(telegram_dispatch)
            : telegram_dispatch,
        }),
  });
}

export function buildTelegramMessageRefPersistWarning(
  result: Extract<AdminTelegramMessageRefPersistResult, { ok: false }>,
  options: { remarksWriteFailedOnly?: boolean } = {},
): AdminWarningShape {
  const includeUpstream = !options.remarksWriteFailedOnly || result.code === 'remarks_write_failed';
  return {
    code: 'telegram_message_ref_persist_failed',
    ...(includeUpstream && typeof result.status === 'number' ? { upstream_status: result.status } : {}),
    ...(includeUpstream && result.upstreamBody ? { upstream_body: result.upstreamBody } : {}),
  };
}

export async function readProtectedTelegramCallbackSecret(request: Request): Promise<string> {
  const cookie = request.headers.get('cookie') || '';
  const authorization = String(request.headers.get('authorization') || '').trim();
  if (!authorization && !cookie) return '';
  const masterSettings = await fetchProtectedAdminMasterSettings({ authorization, cookie });
  return readTelegramCallbackSecretFromMasterSettings(masterSettings);
}

export function readTelegramRiderChatId(rider: { telegramChatId?: unknown; telegram_chat_id?: unknown }): string {
  const camel = String(rider.telegramChatId || '').trim();
  if (camel) return camel;
  return String(rider.telegram_chat_id || '').trim();
}

export function readResolvedTelegramChatId(
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown },
  fallbackChatId?: string,
): string {
  const riderChatId = readTelegramRiderChatId(rider);
  const requestChatId = String(fallbackChatId || '').trim();
  return riderChatId || requestChatId;
}

export function readOptionalTelegramCallbackData(build: () => string): string {
  try {
    return build();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'missing_telegram_callback_secret') return '';
    throw error;
  }
}

export type AdminTelegramMessageRefPersistHandledResult = {
  warning?: AdminWarningShape;
  persisted?: Extract<AdminTelegramMessageRefPersistResult, { ok: true }>;
};

export async function persistAdminTelegramMessageRefHandled({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  messageRef,
  warningOptions,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  messageRef: NonNullable<DispatchMeta['telegramMessageRef']>;
  warningOptions?: { remarksWriteFailedOnly?: boolean };
}): Promise<AdminTelegramMessageRefPersistHandledResult> {
  const result = await persistAdminTelegramMessageRef({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    messageRef,
  });

  if (!result.ok) {
    return { warning: buildTelegramMessageRefPersistWarning(result, warningOptions) };
  }

  return { persisted: result };
}

export async function maybePersistAdminTelegramMessageRefWarning({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  messageRef,
  warningOptions,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  messageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
  warningOptions?: { remarksWriteFailedOnly?: boolean };
}): Promise<AdminWarningShape | undefined> {
  if (!messageRef) return undefined;
  const handled = await persistAdminTelegramMessageRefHandled({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    messageRef,
    warningOptions,
  });
  return handled.warning;
}

export async function finalizeAdminTelegramCompletionResponse<TTelegramDispatch, TPublicTelegramDispatch = TTelegramDispatch>({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  messageRef,
  successPayload,
  warningOptions,
  transformTelegramDispatch,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  messageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
  successPayload: Omit<AdminTelegramCompletionSuccessPayload<TTelegramDispatch>, 'warning'>;
  warningOptions?: { remarksWriteFailedOnly?: boolean };
  transformTelegramDispatch?: (summary: TTelegramDispatch) => TPublicTelegramDispatch;
}): Promise<Response> {
  const warning = await maybePersistAdminTelegramMessageRefWarning({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    messageRef,
    warningOptions,
  });

  return buildAdminTelegramCompletionResponse({
    successPayload: {
      ...successPayload,
      ...(warning ? { warning } : {}),
    },
    transformTelegramDispatch,
  });
}

export function buildAdminOrderFetchFailedResponse(
  result: Extract<AdminOrderReadResult, { ok: false }>,
  statusOverride?: number,
): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'order_fetch_failed',
    upstream_status: result.status,
    upstream_body: result.upstreamBody,
  }), {
    status: statusOverride ?? result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildAdminOrderSnapshotUnavailableResponse(rawText: string): Response {
  return buildAdminJsonResponse({
    success: false,
    error: 'order_snapshot_unavailable',
    raw_response_text: rawText,
  }, 502);
}

export function buildAdminOrderFetchFailedSimpleResponse(): Response {
  return buildAdminSimpleErrorResponse('order_fetch_failed', 502);
}

export function buildAdminForcedRiderNotFoundResponse(forcedRiderId: string): Response {
  return buildAdminJsonResponse({
    success: false,
    error: 'forced_rider_not_found',
    forcedRiderId,
  }, 400);
}

export function buildAdminOrderIdRequiredResponse(): Response {
  return buildAdminSimpleErrorResponse('order_id_required', 400);
}

export function buildAdminOrderSnapshotRequiredResponse(): Response {
  return buildAdminSimpleErrorResponse('order_snapshot_required', 409);
}

export function buildAdminInvalidActionResponse(error: 'invalid_action' | 'unsupported_action'): Response {
  return buildAdminSimpleErrorResponse(error, 400);
}

export function buildAdminRiderAlreadyDeclinedResponse(): Response {
  return buildAdminSimpleErrorResponse('rider_already_declined_this_order', 409);
}

export function buildAdminNoAvailableRidersResponse(): Response {
  return buildAdminSimpleErrorResponse('no_available_riders', 409);
}

export function pickAdminSingleRiderById<TRider extends { id?: unknown }>({
  riders,
  riderId,
}: {
  riders: TRider[];
  riderId: string;
}): TRider | null {
  const normalizedRiderId = String(riderId || '').trim();
  if (!normalizedRiderId) return null;
  return riders.find((rider) => String(rider?.id || '').trim() === normalizedRiderId) || null;
}

export function readTelegramItemSummaryFromOrder(order: Record<string, unknown> | null | undefined): string[] {
  const raw = order?.itemsJson ?? order?.items_json ?? order?.items;
  if (!raw) return [];

  let items: unknown = raw;
  if (typeof raw === 'string') {
    try {
      items = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }

  const list = Array.isArray(items)
    ? items
    : (items && typeof items === 'object' ? Object.values(items as Record<string, unknown>) : []);

  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const row = item as Record<string, unknown>;
      const name = String(row.name || row.productName || '').trim();
      const subName = String(row.subName || '').trim();
      const quantity = Number(row.quantity || row.qty || 0);
      const price = Number(row.price || 0);
      const title = name && subName ? `${name} / ${subName}` : (name || subName);
      if (!title || !Number.isFinite(quantity) || quantity <= 0) return '';
      const priceLabel = Number.isFinite(price) && price > 0 ? ` · ${price} RSD` : '';
      return `${title} x${quantity}${priceLabel}`;
    })
    .filter(Boolean);
}

export interface AdminAssignOrderSummary {
  orderNo: string;
  shopName: string;
  shopMapUrl: string;
  address: string;
  deliveryMapUrl: string;
  phone: string;
  totalAmount: number;
  scheduledFor: string;
  itemSummary: string[];
}

export interface AdminPublishOrderMessageInput {
  shopName: string;
  address: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  phone: string;
  dashboardLink: string;
  shopMapUrl: string;
  deliveryMapUrl: string;
}

function readAdminOrderSummaryItems(row: Record<string, unknown>): Array<{ name?: unknown; quantity?: unknown }> {
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

function normalizeAdminOrderShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

export function readAdminOrderShopSlug(row: Record<string, unknown> | null | undefined): string {
  if (!row) return '';
  return normalizeAdminOrderShopSlug(row.shopSlug || row.shop_slug || row.restaurantSlug || row.restaurant_slug || '');
}

export function readAdminAssignOrderSummary(row: Record<string, unknown>): AdminAssignOrderSummary {
  const items = readAdminOrderSummaryItems(row);
  const parsedTotalAmount = Number(row.totalAmount ?? row.total_amount);
  const userPhone = String(row.userPhone ?? row.user_phone ?? '').trim();
  const orderView = buildRiderOrderView({
    shopName: String(row.shopName ?? row.shop_name ?? '').trim(),
    restaurantName: String(row.restaurantName ?? row.restaurant_name ?? '').trim(),
    shopAddress: String(row.shopAddress ?? row.shop_address ?? '').trim(),
    restaurantAddress: String(row.restaurantAddress ?? row.restaurant_address ?? '').trim(),
    shopMapUrl: String(row.shopMapUrl ?? row.shop_map_url ?? '').trim(),
    tableInfo: String(row.tableInfo ?? row.table_info ?? '').trim(),
    deliveryAddress: String(row.deliveryAddress ?? row.delivery_address ?? '').trim(),
    deliveryMapUrl: String(row.deliveryMapUrl ?? row.delivery_map_url ?? '').trim(),
    userPhone,
    totalAmount: row.totalAmount ?? row.total_amount,
  });

  return {
    orderNo: String(row.orderNo ?? row.order_no ?? '').trim(),
    shopName: orderView.shopName,
    shopMapUrl: orderView.shopMapUrl,
    address: orderView.deliveryAddress || '未提供地址',
    deliveryMapUrl: orderView.deliveryMapUrl,
    phone: userPhone || '-',
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

export function readAdminPublishOrderMessageInput(
  row: Record<string, unknown>,
  siteBaseUrl: string,
): AdminPublishOrderMessageInput {
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
  const totalAmount = Number(row.totalAmount ?? row.total_amount);
  const pickupEtaMinutes = Number(row.pickupEtaMinutes ?? row.pickup_eta_minutes);
  const phone = String(row.userPhone ?? row.user_phone ?? '').trim();
  const restaurantId = readAdminOrderShopSlug(row)
    || String(row.shopId ?? row.shop_id ?? '').trim();
  const dashboardLink = buildTelegramDeepLink({
    baseUrl: String(siteBaseUrl || '').trim().replace(/\/$/, '') || 'https://food2.serbia70.com',
    restaurantId,
    orderId: String(row.id ?? '').trim(),
  });

  return {
    shopName: orderView.shopName,
    address: orderView.deliveryAddress || '未提供地址',
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    pickupEtaMinutes: Number.isFinite(pickupEtaMinutes) ? pickupEtaMinutes : 0,
    phone,
    dashboardLink,
    shopMapUrl: orderView.shopMapUrl,
    deliveryMapUrl: orderView.deliveryMapUrl,
  };
}

export function readJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function readTelegramSendResult(
  response: Response,
  responseText: string,
): { ok: true; messageId: number } | { ok: false; error: string } {
  const parsedResponse = readJsonObject(responseText);
  if (!response.ok || parsedResponse?.success === false || parsedResponse?.ok === false) {
    return {
      ok: false,
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
    ok: true,
    messageId,
  };
}

export function readAdminTelegramSendOutcome({
  response,
  responseText,
  chatId,
}: {
  response: Response;
  responseText: string;
  chatId: string;
}): { success: true; messageRef?: NonNullable<DispatchMeta['telegramMessageRef']> } | { success: false; error: string } {
  const sendResult = readTelegramSendResult(response, responseText);
  if (!sendResult.ok) {
    return {
      success: false,
      error: sendResult.error,
    };
  }

  return {
    success: true,
    ...(sendResult.messageId > 0 ? { messageRef: { chatId, messageId: sendResult.messageId } } : {}),
  };
}

export async function sendAdminTelegramWithReplyMarkupRetry({
  request,
  payloadBase,
  replyMarkup,
  chatId,
}: {
  request: Request;
  payloadBase: Record<string, unknown>;
  replyMarkup?: unknown;
  chatId: string;
}): Promise<{ success: true; messageRef?: NonNullable<DispatchMeta['telegramMessageRef']> } | { success: false; error: string }> {
  const headers = {
    'Content-Type': 'application/json',
    ...buildForwardHeaders(request),
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
    };
  };

  let { response, responseText } = await sendTelegram({
    ...payloadBase,
    ...(replyMarkup === undefined ? {} : { reply_markup: replyMarkup }),
  });
  const shouldRetryWithoutReplyMarkup = !response.ok
    && response.headers.get('content-type')?.includes('text/html')
    && responseText.includes('502');

  if (shouldRetryWithoutReplyMarkup) {
    ({ response, responseText } = await sendTelegram(payloadBase));
  }

  return readAdminTelegramSendOutcome({
    response,
    responseText,
    chatId,
  });
}

export type AdminTelegramSendMessage = {
  text: string;
  replyMarkup?: unknown;
};

export function normalizeTelegramSendError(error: unknown): string {
  const errorMessage = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  return errorMessage || 'telegram_send_failed';
}

export type AdminTelegramPayloadBaseExtras = {
  shop_slug?: string;
  telegramBotToken?: string;
};

export function buildAdminTelegramPayloadBaseExtras({
  shopSlug,
  shop_slug,
  telegramBotToken,
}: {
  shopSlug?: unknown;
  shop_slug?: unknown;
  telegramBotToken?: unknown;
}): AdminTelegramPayloadBaseExtras {
  const normalizedShopSlug = String(shop_slug ?? shopSlug ?? '').trim();
  const normalizedTelegramBotToken = String(telegramBotToken || '').trim();

  return {
    ...(normalizedShopSlug ? { shop_slug: normalizedShopSlug } : {}),
    ...(normalizedTelegramBotToken ? { telegramBotToken: normalizedTelegramBotToken } : {}),
  };
}

export function buildAdminTelegramSendPreparation({
  orderId,
  rider,
  fallbackChatId,
  shopSlug,
  shop_slug,
  telegramBotToken,
  restaurantId,
  secretOverride,
}: {
  orderId: string | number;
  rider: { id?: unknown; name?: unknown; phone?: unknown; telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: unknown;
  shopSlug?: unknown;
  shop_slug?: unknown;
  telegramBotToken?: unknown;
  restaurantId?: unknown;
  secretOverride?: unknown;
}): {
  chatId: string;
  payloadBaseExtras: AdminTelegramPayloadBaseExtras;
  callbackBase: AdminTelegramSendCallbackBase;
} {
  const chatId = readResolvedTelegramChatId(rider, String(fallbackChatId || ''));
  return {
    chatId,
    payloadBaseExtras: buildAdminTelegramPayloadBaseExtras({
      shopSlug,
      shop_slug,
      telegramBotToken,
    }),
    callbackBase: buildAdminTelegramCallbackBase({
      orderId,
      rider,
      restaurantId: String(restaurantId ?? ''),
      telegramChatId: chatId,
      secretOverride: String(secretOverride || ''),
    }),
  };
}

export async function sendPreparedAdminTelegramToRider({
  request,
  rider,
  fallbackChatId,
  payloadBaseExtras,
  message,
}: {
  request: Request;
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  payloadBaseExtras?: Record<string, unknown>;
  message: AdminTelegramSendMessage;
}): Promise<{ success: true; messageRef?: NonNullable<DispatchMeta['telegramMessageRef']> } | { success: false; error: string }> {
  const chatId = readResolvedTelegramChatId(rider, fallbackChatId);
  if (!chatId) return { success: false, error: 'telegram_chat_id_missing' };

  try {
    return await sendAdminTelegramWithReplyMarkupRetry({
      request,
      payloadBase: {
        ...(payloadBaseExtras || {}),
        chat_id: chatId,
        chatId,
        text: message.text,
      },
      replyMarkup: message.replyMarkup,
      chatId,
    });
  } catch (error) {
    return {
      success: false,
      error: normalizeTelegramSendError(error),
    };
  }
}

export type AdminTelegramSendCallbackBase = {
  orderId: number;
  riderId: number;
  riderName: string;
  riderPhone: string;
  restaurantId: string;
  telegramChatId: string;
  secretOverride?: string;
};

export function buildAdminTelegramCallbackBase({
  orderId,
  rider,
  restaurantId,
  telegramChatId,
  secretOverride,
}: {
  orderId: string | number;
  rider: { id?: unknown; name?: unknown; phone?: unknown };
  restaurantId?: string;
  telegramChatId?: string;
  secretOverride?: string;
}): AdminTelegramSendCallbackBase {
  const normalizedSecretOverride = String(secretOverride || '').trim();

  return {
    orderId: Number(orderId || 0),
    riderId: Number(rider.id || 0),
    riderName: String(rider.name || '').trim(),
    riderPhone: String(rider.phone || '').trim(),
    restaurantId: String(restaurantId || '').trim() || 'admin',
    telegramChatId: String(telegramChatId || '').trim(),
    ...(normalizedSecretOverride ? { secretOverride: normalizedSecretOverride } : {}),
  };
}

export function buildOptionalAdminTelegramClaimCallbackData({
  callbackBase,
  buildCallback,
}: {
  callbackBase: AdminTelegramSendCallbackBase;
  buildCallback: (callbackBase: AdminTelegramSendCallbackBase) => string;
}): string | undefined {
  if (
    callbackBase.riderId <= 0
    || !callbackBase.riderName
    || !callbackBase.riderPhone
    || !callbackBase.telegramChatId
  ) {
    return undefined;
  }

  const callbackData = readOptionalTelegramCallbackData(() => buildCallback(callbackBase));
  return callbackData || undefined;
}

export function buildAdminTelegramSendCallbacks({
  rider,
  fallbackChatId,
  callbackBase,
  builders,
}: {
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  callbackBase: AdminTelegramSendCallbackBase;
  builders: {
    claimCallbackData?: (callbackBase: AdminTelegramSendCallbackBase) => string;
    declineCallbackData?: (callbackBase: AdminTelegramSendCallbackBase) => string;
  };
}): { chatId: string; claimCallbackData?: string; declineCallbackData?: string } | { error: 'telegram_chat_id_missing' } {
  const chatId = readResolvedTelegramChatId(rider, fallbackChatId);
  if (!chatId) return { error: 'telegram_chat_id_missing' };

  const callbackBaseWithChatId = {
    ...callbackBase,
    telegramChatId: chatId,
  };
  const claimCallbackData = builders.claimCallbackData
    ? buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: callbackBaseWithChatId,
      buildCallback: builders.claimCallbackData,
    })
    : undefined;
  const declineCallbackData = builders.declineCallbackData
    ? buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: callbackBaseWithChatId,
      buildCallback: builders.declineCallbackData,
    })
    : undefined;

  return {
    chatId,
    ...(claimCallbackData ? { claimCallbackData } : {}),
    ...(declineCallbackData ? { declineCallbackData } : {}),
  };
}

export async function sendAdminDispatchTelegramToRider({
  request,
  rider,
  fallbackChatId,
  payloadBaseExtras,
  callbackBase,
  messageInput,
}: {
  request: Request;
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  payloadBaseExtras?: Record<string, unknown>;
  callbackBase: AdminTelegramSendCallbackBase;
  messageInput: {
    shopName: string;
    address: string;
    totalAmount: number;
    pickupEtaMinutes: number;
    phone: string;
    dashboardLink: string;
    shopMapUrl?: string;
    deliveryMapUrl?: string;
  };
}): Promise<{ success: true; messageRef?: NonNullable<DispatchMeta['telegramMessageRef']> } | { success: false; error: string }> {
  const callbacks = buildAdminTelegramSendCallbacks({
    rider,
    fallbackChatId,
    callbackBase,
    builders: {
      claimCallbackData: (input) => buildTelegramClaimCallback(input),
    },
  });
  if ('error' in callbacks) return { success: false, error: callbacks.error };

  try {
    const message = buildTelegramDispatchMessage({
      ...messageInput,
      ...(callbacks.claimCallbackData ? { claimCallbackData: callbacks.claimCallbackData } : {}),
    });

    return await sendPreparedAdminTelegramToRider({
      request,
      rider,
      fallbackChatId: callbacks.chatId,
      payloadBaseExtras,
      message,
    });
  } catch (error) {
    return {
      success: false,
      error: normalizeTelegramSendError(error),
    };
  }
}

export async function sendAdminTelegramToRider({
  request,
  rider,
  fallbackChatId,
  payloadBaseExtras,
  callbackBase,
  buildMessage,
}: {
  request: Request;
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  payloadBaseExtras?: Record<string, unknown>;
  callbackBase: AdminTelegramSendCallbackBase;
  buildMessage: (callbacks: { claimCallbackData?: string; declineCallbackData?: string }) => AdminTelegramSendMessage;
}): Promise<{ success: true; messageRef?: NonNullable<DispatchMeta['telegramMessageRef']> } | { success: false; error: string }> {
  const callbacks = buildAdminTelegramSendCallbacks({
    rider,
    fallbackChatId,
    callbackBase,
    builders: {
      claimCallbackData: (input) => buildTelegramShortClaimCallback(input),
      declineCallbackData: (input) => buildTelegramShortClaimCallback({
        ...input,
        action: 'decline',
      }),
    },
  });
  if ('error' in callbacks) return { success: false, error: callbacks.error };

  try {
    const message = buildMessage({
      ...(callbacks.claimCallbackData ? { claimCallbackData: callbacks.claimCallbackData } : {}),
      ...(callbacks.declineCallbackData ? { declineCallbackData: callbacks.declineCallbackData } : {}),
    });

    return await sendPreparedAdminTelegramToRider({
      request,
      rider,
      fallbackChatId: callbacks.chatId,
      payloadBaseExtras,
      message,
    });
  } catch (error) {
    return {
      success: false,
      error: normalizeTelegramSendError(error),
    };
  }
}

function parseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function hasRecognizableRiderList(payload: Record<string, unknown>): boolean {
  if (Array.isArray(payload.riders) || Array.isArray(payload.rows) || Array.isArray(payload.items)) {
    return true;
  }

  const data = payload.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

  const nested = data as Record<string, unknown>;
  return Array.isArray(nested.riders) || Array.isArray(nested.rows) || Array.isArray(nested.items);
}

function readOrderId(row: Record<string, unknown>): string {
  return String(row.id || row.orderId || row.order_id || '').trim();
}

function pickMatchingOrderRow(row: unknown, orderId: string): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const normalizedOrderId = String(orderId || '').trim();
  const rowId = readOrderId(record);
  if (normalizedOrderId) return rowId === normalizedOrderId ? record : null;
  return rowId ? record : null;
}

function readOrderRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as Record<string, unknown>;
  const direct = pickMatchingOrderRow(root, '');
  if (direct) return [direct];

  const directOrders = Array.isArray(root.orders) ? root.orders : [];
  if (directOrders.length > 0) {
    return directOrders.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  const data = root.data;
  if (Array.isArray(data)) {
    return data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    const nestedDirect = pickMatchingOrderRow(nested, '');
    if (nestedDirect) return [nestedDirect];

    const nestedOrders = Array.isArray(nested.orders)
      ? nested.orders as unknown[]
      : [];
    if (nestedOrders.length > 0) {
      return nestedOrders.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
    }
  }

  return [];
}

export function findAdminOrderRow(payload: unknown, orderId: string): Record<string, unknown> | null {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) return null;
  return readOrderRows(payload).find((row) => readOrderId(row) === normalizedOrderId) || null;
}

function readOrderSnapshotRow(row: Record<string, unknown> | null | undefined): RiderRouteOrderSnapshot {
  if (!row || typeof row !== 'object') return { status: '', remarksJson: '', courierPhone: '' };
  return {
    status: String(row.status || '').trim(),
    remarksJson: String(row.remarksJson || row.remarks_json || '').trim(),
    courierPhone: String(row.courierPhone || row.courier_phone || '').trim(),
  };
}

export function buildForwardHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie') || '';
  const authorization = request.headers.get('authorization') || '';
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  return headers;
}

async function readOrderDetailFromRiderOrders(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone: string,
): Promise<Record<string, unknown> | null> {
  const phone = String(riderPhone || '').trim();
  if (!phone) return null;

  const upstream = await fetch(`${apiBaseUrl}/api/rider/orders?phone=${encodeURIComponent(phone)}&view=active`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;

  const parsed = readJsonObject(text);
  const rows = Array.isArray(parsed?.orders) ? parsed.orders : [];
  const matched = rows.find((row) => String((row as Record<string, unknown>)?.id || '').trim() === orderId);
  return matched && typeof matched === 'object' ? matched as Record<string, unknown> : null;
}

export async function readOrderDetail(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone = '',
): Promise<Record<string, unknown> | null> {
  const upstream = await fetch(`${apiBaseUrl}/api/admin/orders`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (upstream.ok && text) {
    const matched = findAdminOrderRow(parseJsonValue(text), orderId);
    if (matched) return matched;
  }

  return readOrderDetailFromRiderOrders(request, apiBaseUrl, orderId, riderPhone);
}

export async function readOrderDispatchSnapshot(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone = '',
): Promise<RiderRouteOrderSnapshot> {
  return readOrderSnapshotRow(await readOrderDetail(request, apiBaseUrl, orderId, riderPhone));
}

function readTelegramSendShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  if (!slug || slug === 'admin') return '';
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

function readOrderTelegramShopSlug(order: Record<string, unknown>, fallback?: unknown): string {
  return readTelegramSendShopSlug(order.shopSlug)
    || readTelegramSendShopSlug(order.slug)
    || readTelegramSendShopSlug(order.restaurantSlug)
    || readTelegramSendShopSlug(order.shop_slug)
    || readTelegramSendShopSlug(order.restaurant_slug)
    || readTelegramSendShopSlug(order.restaurantId)
    || readTelegramSendShopSlug(order.shopId)
    || readTelegramSendShopSlug(fallback);
}

export async function syncTelegramDeliveryProgressMessage({
  request,
  apiBaseUrl,
  telegramSendUrl,
  orderId,
  rider,
  remarksJson,
  targetStatus,
  fallbackShopSlug,
  fallbackChatId,
  fallbackOrder,
}: {
  request: Request;
  apiBaseUrl: string;
  telegramSendUrl: string | URL;
  orderId: string;
  rider: {
    riderId: string;
    riderName: string;
    riderPhone: string;
  };
  remarksJson: string;
  targetStatus: 'delivering' | 'picked_up' | 'completed';
  fallbackShopSlug?: string;
  fallbackChatId?: string;
  fallbackOrder?: Record<string, unknown> | null;
}): Promise<void> {
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const messageRef = meta.telegramMessageRef;
  if (!messageRef) return;

  const order = fallbackOrder || await readOrderDetail(request, apiBaseUrl, orderId, rider.riderPhone);
  if (!order) return;

  const orderView = buildRiderOrderView({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: rider.riderPhone,
  });
  const unifiedStatus = resolveRiderUnifiedStatus({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: rider.riderPhone,
  }, {
    riderId: rider.riderId,
    riderName: rider.riderName,
    riderPhone: rider.riderPhone,
  });
  const shopSlug = readOrderTelegramShopSlug(order, fallbackShopSlug);
  const chatId = String(messageRef.chatId || fallbackChatId || '').trim();
  const primaryCallbackData = unifiedStatus.primaryAction && shopSlug
    ? buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId: Number(rider.riderId),
        riderName: rider.riderName,
        riderPhone: rider.riderPhone,
        restaurantId: shopSlug,
        telegramChatId: chatId,
        action: unifiedStatus.primaryAction === '送达' ? 'complete' : 'picked_up',
      })
    : '';

  const message = buildRiderSingleMessageTelegram({
    orderNo: String(order.orderNo || orderId || '').trim(),
    shopName: orderView.shopName,
    address: orderView.deliveryAddress || '未提供地址',
    phone: String(order.userPhone || '').trim() || '-',
    statusLabel: unifiedStatus.statusLabel,
    acceptedAtLabel: unifiedStatus.acceptedAt,
    pickedUpAtLabel: unifiedStatus.pickedUpAt,
    completedAtLabel: unifiedStatus.completedAt,
    itemSummary: readTelegramItemSummaryFromOrder(order),
    shopMapUrl: orderView.shopMapUrl,
    deliveryMapUrl: orderView.deliveryMapUrl,
    primaryAction: unifiedStatus.primaryAction && primaryCallbackData
      ? { text: unifiedStatus.primaryAction, callbackData: primaryCallbackData }
      : null,
    secondaryAction: null,
  });

  await fetch(telegramSendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      ...(shopSlug ? { shopSlug } : {}),
      ...buildTelegramEditMessagePayload({
        chatId,
        messageId: messageRef.messageId,
        text: message.text,
        replyMarkup: message.replyMarkup,
      }),
    }),
  });
}
export function buildRiderActionUpdateStatusRemarks({
  action,
  remarksJson,
  actionDecisionNextRemarksJson,
  acceptedAt,
  pickedUpAt,
  completedAt,
}: {
  action: 'accept' | 'decline' | 'picked_up' | 'complete';
  remarksJson: string;
  actionDecisionNextRemarksJson: string;
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
}): string {
  if (action === 'accept' || action === 'decline') return actionDecisionNextRemarksJson;

  const currentMeta = readDispatchMetaFromRemarks(remarksJson);
  return JSON.stringify(buildDispatchMetaRemarks(remarksJson, {
    ...currentMeta,
    acceptedAt,
    pickedUpAt,
    completedAt,
  }));
}

export function buildRiderActionUpdateStatusPayload({
  orderId,
  action,
  expectedCurrentStatus,
  targetStatus,
  feedbackWriteMode,
  nextRemarksJson,
  riderName,
  riderPhone,
}: {
  orderId: string;
  action: 'accept' | 'decline' | 'picked_up' | 'complete';
  expectedCurrentStatus: string;
  targetStatus: string;
  feedbackWriteMode: 'none' | 'admin_remarks' | 'update_status_remarks';
  nextRemarksJson: string;
  riderName: string;
  riderPhone: string;
}): Record<string, unknown> {
  const numericOrderId = Number(orderId);
  const payload: Record<string, unknown> = {
    id: Number.isInteger(numericOrderId) && numericOrderId > 0 ? numericOrderId : orderId,
    expectedCurrentStatus,
    status: targetStatus,
  };

  if (feedbackWriteMode === 'update_status_remarks' || action === 'picked_up' || action === 'complete') {
    payload.remarksJson = nextRemarksJson;
  }
  if (feedbackWriteMode !== 'update_status_remarks') {
    payload.courierName = riderName;
    payload.courierPhone = riderPhone;
  }

  return payload;
}

export type SharedRiderProgressTargetStatus = 'delivering' | 'picked_up' | 'completed';

export interface SharedRiderProgressActionOrderState {
  status: string;
  remarksJson: string;
  courierPhone: string;
}

export interface SharedRiderProgressActionTelegramOptions {
  fallbackShopSlug?: string;
  fallbackChatId?: string;
  fallbackOrder?: Record<string, unknown> | null;
}

export interface SharedRiderProgressActionInput {
  request: Request;
  apiBaseUrl: string;
  telegramSendUrl: string | URL;
  orderId: string;
  action: Extract<RiderOrderAction, 'accept' | 'picked_up' | 'complete'>;
  rider: {
    riderId: string;
    riderName: string;
    riderPhone: string;
  };
  order: SharedRiderProgressActionOrderState;
  actionDecision: ResolveRiderOrderActionResult;
  nowIso: string;
  successBody?: string;
  telegram?: SharedRiderProgressActionTelegramOptions;
}

export async function runSharedRiderProgressAction({
  request,
  apiBaseUrl,
  telegramSendUrl,
  orderId,
  action,
  rider,
  order,
  actionDecision,
  nowIso,
  successBody,
  telegram,
}: SharedRiderProgressActionInput): Promise<Response> {
  if (actionDecision.feedbackWriteMode === 'admin_remarks') {
    await writeOrderDispatchRemarks(request, apiBaseUrl, orderId, actionDecision.nextRemarksJson);
  }

  const currentMeta = readDispatchMetaFromRemarks(order.remarksJson);
  const nextRemarksJson = buildRiderActionUpdateStatusRemarks({
    action,
    remarksJson: order.remarksJson,
    actionDecisionNextRemarksJson: actionDecision.nextRemarksJson,
    acceptedAt: currentMeta.acceptedAt,
    pickedUpAt: action === 'picked_up' ? nowIso : currentMeta.pickedUpAt,
    completedAt: action === 'complete' ? nowIso : currentMeta.completedAt,
  });

  const payload = buildRiderActionUpdateStatusPayload({
    orderId,
    action,
    expectedCurrentStatus: actionDecision.expectedCurrentStatus,
    targetStatus: actionDecision.targetStatus,
    feedbackWriteMode: actionDecision.feedbackWriteMode,
    nextRemarksJson,
    riderName: rider.riderName,
    riderPhone: rider.riderPhone,
  });

  const upstream = await fetch(`${apiBaseUrl}/api/order/update_status/${encodeURIComponent(orderId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify(payload),
  });
  const text = await upstream.text();

  if (!upstream.ok) {
    return buildUpstreamFailureResponse(upstream, text, {
      success: false,
      error: action === 'complete' ? 'order_completed' : 'order_status_updated',
    });
  }

  try {
    await syncTelegramDeliveryProgressMessage({
      request,
      apiBaseUrl,
      telegramSendUrl,
      orderId,
      rider,
      remarksJson: nextRemarksJson,
      targetStatus: actionDecision.targetStatus === 'completed'
        ? 'completed'
        : (actionDecision.targetStatus === 'picked_up' ? 'picked_up' : 'delivering'),
      fallbackShopSlug: telegram?.fallbackShopSlug,
      fallbackChatId: telegram?.fallbackChatId,
      fallbackOrder: telegram?.fallbackOrder,
    });
  } catch {
    // 不阻断主流程成功回包
  }

  return new Response(successBody || JSON.stringify({ success: true, action }), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function writeOrderDispatchRemarks(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  remarksJson: string,
): Promise<boolean> {
  const parsedRemarks = parseJsonValue(remarksJson);
  const remarks = Array.isArray(parsedRemarks) ? parsedRemarks : [];
  const upstream = await fetch(`${apiBaseUrl}/api/admin/orders/remarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      orderId,
      remarks,
    }),
  });
  const text = await upstream.text();
  const payload = readJsonObject(text) || {};
  return upstream.ok && payload.success !== false;
}

export async function readAdminAssignableRiders({
  request,
  cookies,
  apiBaseUrl,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
}): Promise<AdminRidersReadResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/riders`,
    method: 'GET',
  });
  const text = await upstream.text();
  const parsed = readJsonObject(text);
  const payloadInvalid = !parsed || !hasRecognizableRiderList(parsed);

  if (!upstream.ok || payloadInvalid || parsed.success === false) {
    const error = typeof parsed?.error === 'string' && parsed.error.trim() ? parsed.error.trim() : 'riders_upstream_failed';
    return {
      success: false,
      status: upstream.status || 502,
      error,
      upstreamBody: text || undefined,
    };
  }

  return {
    success: true,
    riders: readOnlineRiders(parsed),
  };
}

export async function readAdminAssignableRidersOrResponse({
  request,
  cookies,
  apiBaseUrl,
  coerce2xxTo502 = false,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  coerce2xxTo502?: boolean;
}): Promise<
  | { ok: true; riders: AssignableRider[] }
  | { ok: false; response: Response }
> {
  const ridersResult = await readAdminAssignableRiders({
    request,
    cookies,
    apiBaseUrl,
  });
  if (!ridersResult.success) {
    return {
      ok: false,
      response: buildAdminRidersReadFailureResponse(ridersResult, { coerce2xxTo502 }),
    };
  }
  return {
    ok: true,
    riders: ridersResult.riders,
  };
}

export async function readAdminOrderById({
  request,
  cookies,
  apiBaseUrl,
  orderId,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
}): Promise<AdminOrderReadResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders`,
    method: 'GET',
  });
  const rawText = await upstream.text();
  const parsed = parseJsonValue(rawText);

  if (!upstream.ok || parsed == null) {
    return {
      ok: false,
      status: upstream.status || 502,
      upstreamBody: rawText,
    };
  }

  const order = findAdminOrderRow(parsed, orderId);
  return {
    ok: true,
    found: Boolean(order),
    order,
    remarksJson: order ? String(order.remarksJson || order.remarks_json || '').trim() : '',
    rawText,
  };
}

export async function writeAdminDispatchMetaRemarks({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  remarksJson,
  nextMeta,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  remarksJson: string;
  nextMeta: DispatchMeta;
}): Promise<AdminDispatchMetaWriteResult> {
  const nextRemarks = buildDispatchMetaRemarks(remarksJson, nextMeta);
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders/remarks`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      remarks: nextRemarks,
    }),
  });
  const text = await upstream.text();

  const payload = readJsonObject(text) || {};
  if (!upstream.ok || payload.success === false) {
    return {
      ok: false,
      status: upstream.status,
      upstreamBody: text || JSON.stringify(payload),
    };
  }

  return {
    ok: true,
    remarksJson: JSON.stringify(nextRemarks),
  };
}

export async function updateAdminOrderStatus({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  payload,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  payload: Record<string, unknown>;
}): Promise<AdminOrderStatusUpdateResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders/${encodeURIComponent(orderId)}/status`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const bodyText = await upstream.text();
  const bodyJson = readJsonObject(bodyText) || {};

  if (!upstream.ok || bodyJson.success === false) {
    return {
      ok: false,
      status: upstream.status || 502,
      bodyText,
      bodyJson,
    };
  }

  return {
    ok: true,
    status: upstream.status || 200,
    bodyText,
    bodyJson,
  };
}

export async function updateAdminOrderStatusOrResponse({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  payload,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  payload: Record<string, unknown>;
}): Promise<
  | { ok: true; result: Extract<AdminOrderStatusUpdateResult, { ok: true }> }
  | { ok: false; response: Response }
> {
  const result = await updateAdminOrderStatus({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    payload,
  });

  if (!result.ok) {
    return {
      ok: false,
      response: buildAdminOrderUpdateFailedResponse(result),
    };
  }

  return {
    ok: true,
    result,
  };
}

export async function persistAdminTelegramMessageRef({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  messageRef,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  messageRef: NonNullable<DispatchMeta['telegramMessageRef']>;
}): Promise<AdminTelegramMessageRefPersistResult> {
  const latestOrderResult = await readAdminOrderById({
    request,
    cookies,
    apiBaseUrl,
    orderId,
  });

  if (!latestOrderResult.ok) {
    return {
      ok: false,
      code: 'order_read_failed',
      status: latestOrderResult.status,
      upstreamBody: latestOrderResult.upstreamBody,
    };
  }

  if (!latestOrderResult.found || !latestOrderResult.order) {
    return {
      ok: false,
      code: 'order_not_found',
    };
  }

  const nextMeta: DispatchMeta = {
    ...readDispatchMetaFromRemarks(latestOrderResult.remarksJson),
    telegramMessageRef: messageRef,
  };
  const remarksResult = await writeAdminDispatchMetaRemarks({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    remarksJson: latestOrderResult.remarksJson,
    nextMeta,
  });

  if (!remarksResult.ok) {
    return {
      ok: false,
      code: 'remarks_write_failed',
      status: remarksResult.status,
      upstreamBody: remarksResult.upstreamBody,
    };
  }

  return {
    ok: true,
    order: latestOrderResult.order,
    remarksJson: remarksResult.remarksJson,
  };
}

export function buildAdminDispatchMetaWriteFailedResponse(
  result: Extract<AdminDispatchMetaWriteResult, { ok: false }>,
): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'dispatch_meta_write_failed',
    upstream_status: result.status,
    upstream_body: result.upstreamBody,
  }), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildAdminOrderUpdateFailedResponse(result: {
  status: number;
  bodyText: string;
  bodyJson: Record<string, unknown>;
},
statusOverride?: number,
): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'order_update_failed',
    upstream_status: result.status,
    upstream_body: result.bodyText || JSON.stringify(result.bodyJson),
  }), {
    status: statusOverride ?? result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildUpstreamFailureResponse(
  upstream: Response,
  text: string,
  fallbackBody: Record<string, unknown>,
): Response {
  return new Response(text || JSON.stringify(fallbackBody), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}
