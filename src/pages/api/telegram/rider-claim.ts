import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { API_BASE_URL } from '../../../config.ts';
import { resolveRiderOrderAction } from '../../../lib/rider-dispatch.ts';
import {
  buildForwardHeaders,
  buildUpstreamFailureResponse,
  readJsonObject,
  readOrderDetail,
  sendTelegramMessage,
  writeOrderDispatchRemarks,
} from '../../../lib/rider-route-shared.ts';
import {
  buildRiderProgressUpdate,
  buildRiderTelegramProgressSyncPayload,
} from '../../../lib/rider-progress-shared.ts';
import { matchesShortTelegramClaimChatId, parseTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { pickNextAvailableRider, readOnlineRiders, type AssignableRider } from '../../../lib/rider-assignment.ts';
import { readTelegramRequestSecret } from '../../../lib/telegram-secrets.ts';

export const prerender = false;

interface TelegramClaimBody {
  callbackData?: unknown;
  chatId?: unknown;
}

type TelegramClaimCallback = ReturnType<typeof parseTelegramClaimCallback>;
type TelegramClaimAction = TelegramClaimCallback['action'];
type TelegramClaimActionDecision = ReturnType<typeof resolveRiderOrderAction>;

type TelegramClaimRiderIdentity = { riderName: string; riderPhone: string };

type TelegramClaimRequestBodyResolution = {
  callbackData: string;
  chatId: string;
  response: Response | null;
};

type TelegramClaimCallbackResolution = {
  callback: TelegramClaimCallback | null;
  response: Response | null;
};

type TelegramClaimIdentityResolution = {
  resolvedName: string;
  resolvedPhone: string;
  response: Response | null;
};

type TelegramClaimProgressContextResult = {
  orderIdText: string;
  riderIdText: string;
  nowIso: string;
  orderDetailForProgress: Record<string, unknown> | null;
  actionDecision: TelegramClaimActionDecision;
  isDeclineAction: boolean;
};

type TelegramClaimContextResult = {
  chatId: string;
  callback: TelegramClaimCallback | null;
  resolvedName: string;
  resolvedPhone: string;
  orderIdText: string;
  riderIdText: string;
  nowIso: string;
  orderDetailForProgress: Record<string, unknown> | null;
  actionDecision: TelegramClaimActionDecision;
  isDeclineAction: boolean;
  response: Response | null;
};

function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
}

function readInternalApiBaseUrl(): string {
  return String(process.env.PUBLIC_API_URL || API_BASE_URL || '').trim().replace(/\/$/, '');
}

async function readRiderIdentityByChatId(request: Request, chatId: string): Promise<TelegramClaimRiderIdentity | null> {
  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/rider/status?action=list_available`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;
  const parsed = readJsonObject(text);
  if (!parsed) return null;
  const riders = readOnlineRiders(parsed.riders);
  const matched = riders.find((rider) => readRiderChatId(rider) === chatId);
  if (!matched) return null;
  const riderName = String(matched.name || '').trim();
  const riderPhone = String(matched.phone || '').trim();
  if (!riderName || !riderPhone) return null;
  return { riderName, riderPhone };
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isTrustedTelegramRequest(request: Request): boolean {
  const expected = readTelegramRequestSecret();
  if (!expected) return false;
  const provided = String(
    request.headers.get('x-telegram-bot-api-secret-token')
      || request.headers.get('x-telegram-claim-secret')
      || '',
  ).trim();
  return provided !== '' && safeEqualText(provided, expected);
}

function resolveTelegramClaimStage(action: TelegramClaimAction): 'delivering' | 'picked_up' | 'completed' | null {
  if (action === 'accept') return 'delivering';
  if (action === 'picked_up') return 'picked_up';
  if (action === 'complete') return 'completed';
  return null;
}

function toTelegramClaimPublicError(error: unknown): string {
  const message = error instanceof Error ? String(error.message || '').trim() : '';
  return new Set(['expired_callback', 'invalid_signature', 'rider_identity_mismatch']).has(message)
    ? message
    : 'invalid_callback_data';
}

export function buildTelegramClaimFailureResponse(error: unknown): Response {
  return new Response(JSON.stringify({ success: false, error: toTelegramClaimPublicError(error) }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildTelegramClaimFailureResult(error: unknown): TelegramClaimCallbackResolution {
  return {
    callback: null,
    response: buildTelegramClaimFailureResponse(error),
  };
}

export function buildTelegramClaimCallbackIdentityFailureResult(): TelegramClaimCallbackResolution {
  return buildTelegramClaimFailureResult(new Error('rider_identity_mismatch'));
}

export async function resolveTelegramClaimCallbackOrFailureResponse({
  request,
  callbackData,
  chatId,
}: {
  request: Request;
  callbackData: string;
  chatId: string;
}): Promise<TelegramClaimCallbackResolution> {
  try {
    return {
      callback: parseTelegramClaimCallback(callbackData, { chatId }),
      response: null,
    };
  } catch (error) {
    const firstError = error instanceof Error ? String(error.message || '').trim() : '';
    if (firstError !== 'rider_identity_mismatch') {
      return buildTelegramClaimFailureResult(error);
    }

    if (matchesShortTelegramClaimChatId(callbackData, chatId) === false) {
      return buildTelegramClaimCallbackIdentityFailureResult();
    }

    const riderIdentity = await readRiderIdentityByChatId(request, chatId);
    if (!riderIdentity?.riderPhone) {
      return buildTelegramClaimCallbackIdentityFailureResult();
    }

    try {
      return {
        callback: parseTelegramClaimCallback(callbackData, {
          chatId,
          riderPhone: riderIdentity.riderPhone,
        }),
        response: null,
      };
    } catch (secondError) {
      return buildTelegramClaimFailureResult(secondError);
    }
  }
}

export function buildTelegramClaimInvalidCallbackFailureResponse(): Response {
  return buildTelegramClaimFailureResponse(new Error('invalid_callback_data'));
}

export function buildTelegramClaimIdentityFailureResponse(): Response {
  return buildTelegramClaimFailureResponse(new Error('rider_identity_mismatch'));
}

export function buildTelegramClaimIdentityFailureResult(): TelegramClaimIdentityResolution {
  return {
    resolvedName: '',
    resolvedPhone: '',
    response: buildTelegramClaimIdentityFailureResponse(),
  };
}

export function resolveTelegramClaimIdentityOrFailureResponse({
  callback,
  chatId,
}: {
  callback: TelegramClaimCallback;
  chatId: string;
}): TelegramClaimIdentityResolution {
  const resolvedPhone = String(callback.riderPhone || '').trim();
  const resolvedName = String(callback.riderName || '').trim();
  const matchedChatId = String(callback.telegramChatId || '').trim();
  if (!resolvedPhone || !matchedChatId || matchedChatId !== chatId) {
    return buildTelegramClaimIdentityFailureResult();
  }
  return {
    resolvedName,
    resolvedPhone,
    response: null,
  };
}

export function buildTelegramClaimRequestBodyFailureResult(error: 'invalid_json' | 'callback_data_required' | 'chat_id_required'): TelegramClaimRequestBodyResolution {
  return {
    callbackData: '',
    chatId: '',
    response: new Response(JSON.stringify({ success: false, error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

export async function resolveTelegramClaimRequestBodyOrFailureResponse(request: Request): Promise<TelegramClaimRequestBodyResolution> {
  let parsedBody: TelegramClaimBody;

  try {
    parsedBody = (await request.json()) as TelegramClaimBody;
  } catch {
    return buildTelegramClaimRequestBodyFailureResult('invalid_json');
  }

  const callbackData = String(parsedBody.callbackData || '').trim();
  const chatId = String(parsedBody.chatId || '').trim();
  if (!callbackData) {
    return buildTelegramClaimRequestBodyFailureResult('callback_data_required');
  }
  if (!chatId) {
    return buildTelegramClaimRequestBodyFailureResult('chat_id_required');
  }

  return {
    callbackData,
    chatId,
    response: null,
  };
}

export function buildTelegramClaimActionDecisionFailureResponse(actionDecision: Pick<TelegramClaimActionDecision, 'error' | 'reason'>): Response {
  const body: Record<string, unknown> = { success: false, error: actionDecision.error };
  if (actionDecision.reason) body.reason = actionDecision.reason;
  return new Response(JSON.stringify(body), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildTelegramClaimProgressSuccessResponse(action: 'picked_up' | 'complete', status: number): Response {
  return new Response(JSON.stringify({ success: true, action }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function buildTelegramClaimProgressContext({
  request,
  callback,
  resolvedName,
  resolvedPhone,
}: {
  request: Request;
  callback: TelegramClaimCallback;
  resolvedName: string;
  resolvedPhone: string;
}): Promise<TelegramClaimProgressContextResult> {
  const orderIdText = String(callback.orderId || '').trim();
  const riderIdText = String(callback.riderId || '').trim();
  const nowIso = new Date().toISOString();
  const orderDetailForProgress = await readOrderDetail(request, readInternalApiBaseUrl(), orderIdText, resolvedPhone);
  const actionDecision = resolveRiderOrderAction({
    action: callback.action,
    order: {
      status: String(orderDetailForProgress?.status || '').trim() || 'awaiting_courier',
      remarksJson: String(orderDetailForProgress?.remarksJson || orderDetailForProgress?.remarks_json || '').trim(),
      courierPhone: String(orderDetailForProgress?.courierPhone || orderDetailForProgress?.courier_phone || '').trim() || resolvedPhone,
    },
    riderId: riderIdText,
    riderName: resolvedName,
    riderPhone: resolvedPhone,
    nowIso,
  });
  return {
    orderIdText,
    riderIdText,
    nowIso,
    orderDetailForProgress,
    actionDecision,
    isDeclineAction: callback.action === 'decline',
  };
}

export async function handleTelegramProgressSubmission({
  request,
  callback,
  orderIdText,
  resolvedName,
  resolvedPhone,
  chatId,
  nowIso,
  orderDetailForProgress,
  actionDecision,
}: {
  request: Request;
  callback: { orderId?: unknown; riderId?: unknown; action?: TelegramClaimAction };
  orderIdText: string;
  resolvedName: string;
  resolvedPhone: string;
  chatId: string;
  nowIso: string;
  orderDetailForProgress: Record<string, unknown> | null;
  actionDecision: Pick<TelegramClaimActionDecision, 'expectedCurrentStatus' | 'targetStatus' | 'feedbackWriteMode' | 'nextRemarksJson'>;
}): Promise<{
  feedbackWritten: boolean;
  nextRemarksJson: string;
  upstream: Response;
  text: string;
}> {
  const feedbackWritten = actionDecision.feedbackWriteMode !== 'admin_remarks'
    ? true
    : await writeOrderDispatchRemarks(request, readInternalApiBaseUrl(), orderIdText, actionDecision.nextRemarksJson);

  const {
    nextRemarksJson,
    updateStatusPayload,
  } = buildRiderProgressUpdate({
    action: String(callback.action || '').trim() as TelegramClaimAction,
    orderId: orderIdText,
    riderName: resolvedName,
    riderPhone: resolvedPhone,
    remarksJson: String(orderDetailForProgress?.remarksJson || orderDetailForProgress?.remarks_json || ''),
    nowIso,
    actionDecision,
  });

  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(String(callback.orderId || '').trim())}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify(updateStatusPayload),
  });

  const text = await upstream.text();
  if (!feedbackWritten) {
    console.warn('[telegram/rider-claim:feedback-write-skipped]', JSON.stringify({
      orderId: callback.orderId,
      riderId: callback.riderId,
      chatId,
    }));
  }

  return {
    feedbackWritten,
    nextRemarksJson,
    upstream,
    text,
  };
}

export async function handleTelegramProgressActionTransition({
  request,
  callback,
  actionDecision,
  orderIdText,
  riderIdText,
  resolvedName,
  resolvedPhone,
  nextRemarksJson,
  orderDetailForProgress,
  upstream,
  text,
}: {
  request: Request;
  callback: { orderId?: unknown; riderId?: unknown; restaurantId?: unknown; action?: TelegramClaimAction };
  actionDecision: Pick<TelegramClaimActionDecision, 'targetStatus'>;
  orderIdText: string;
  riderIdText: string;
  resolvedName: string;
  resolvedPhone: string;
  nextRemarksJson: string;
  orderDetailForProgress: Record<string, unknown> | null;
  upstream: Response;
  text: string;
}): Promise<Response> {
  const progressStage = resolveTelegramClaimStage(String(callback.action || '').trim() as TelegramClaimAction);
  if (upstream.ok && progressStage) {
    try {
      const syncPayload = orderDetailForProgress
        ? buildRiderTelegramProgressSyncPayload({
            order: orderDetailForProgress,
            orderId: orderIdText,
            riderId: riderIdText,
            riderName: resolvedName,
            riderPhone: resolvedPhone,
            remarksJson: nextRemarksJson,
            targetStatus: actionDecision.targetStatus === 'completed'
              ? 'completed'
              : (actionDecision.targetStatus === 'picked_up' ? 'picked_up' : 'delivering'),
            fallbackShopSlug: callback.restaurantId,
          })
        : null;
      if (syncPayload) {
        await sendTelegramMessage({
          request,
          payload: syncPayload.payload,
        });
      }
    } catch {
      // 不阻断接单成功回包
    }
  }

  if (!upstream.ok) {
    const error = callback.action === 'complete' ? 'order_completed' : 'order_status_updated';
    return buildUpstreamFailureResponse(upstream, text, { success: false, error });
  }

  if (callback.action === 'picked_up' || callback.action === 'complete') {
    return buildTelegramClaimProgressSuccessResponse(callback.action, upstream.status);
  }

  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

export async function handleTelegramDeclineAction({
  request,
  callback,
  actionDecision,
  orderIdText,
  riderIdText,
  resolvedName,
  resolvedPhone,
  chatId,
}: {
  request: Request;
  callback: { orderId?: unknown; riderId?: unknown; riderName?: unknown; riderPhone?: unknown };
  actionDecision: Pick<TelegramClaimActionDecision, 'expectedCurrentStatus' | 'targetStatus' | 'feedbackWriteMode' | 'nextRemarksJson' | 'excludedRiderIds'>;
  orderIdText: string;
  riderIdText: string;
  resolvedName: string;
  resolvedPhone: string;
  chatId: string;
}): Promise<Response> {
  const { updateStatusPayload } = buildRiderProgressUpdate({
    action: 'decline',
    orderId: orderIdText,
    riderName: resolvedName,
    riderPhone: resolvedPhone,
    remarksJson: '',
    nowIso: new Date().toISOString(),
    actionDecision,
  });

  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(orderIdText)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify(updateStatusPayload),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text || JSON.stringify({ success: false, error: 'decline_feedback_failed' }), {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  }

  let reassigned = false;
  try {
    const riderListUpstream = await fetch(`${readInternalApiBaseUrl()}/api/rider/status?action=list_available`, {
      headers: buildForwardHeaders(request),
    });
    const riders = readOnlineRiders((readJsonObject(await riderListUpstream.text()) || {}).riders);
    const nextRider = pickNextAvailableRider({
      riders,
      lastAssignedRiderId: riderIdText,
      excludedRiderIds: actionDecision.excludedRiderIds,
    });

    if (nextRider) {
      const redispatch = await fetch(`${readInternalApiBaseUrl()}/api/admin/rider-dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildForwardHeaders(request),
        },
        body: JSON.stringify({
          orderId: callback.orderId,
          action: 'publish',
          forceRiderId: String(nextRider.id || '').trim(),
        }),
      });
      reassigned = redispatch.ok;
    }
  } catch {
    reassigned = false;
  }

  console.info('[telegram/rider-claim:decline]', JSON.stringify({
    orderId: callback.orderId,
    riderId: callback.riderId,
    riderName: resolvedName,
    riderPhone: resolvedPhone,
    chatId,
    feedbackWritten: true,
    reassigned,
  }));
  return new Response(JSON.stringify({ success: true, action: 'decline', reassigned }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildDefaultTelegramClaimActionDecision(): TelegramClaimActionDecision {
  return resolveRiderOrderAction({
    action: 'accept',
    order: { status: '', remarksJson: '', courierPhone: '' },
    riderId: '',
    riderName: '',
    riderPhone: '',
    nowIso: '',
  });
}

export function buildTelegramClaimEmptyContextResult({
  chatId = '',
  callback = null,
  resolvedName = '',
  resolvedPhone = '',
  response = null,
}: {
  chatId?: string;
  callback?: TelegramClaimCallback | null;
  resolvedName?: string;
  resolvedPhone?: string;
  response?: Response | null;
}): TelegramClaimContextResult {
  return {
    chatId,
    callback,
    resolvedName,
    resolvedPhone,
    orderIdText: '',
    riderIdText: '',
    nowIso: '',
    orderDetailForProgress: null,
    actionDecision: buildDefaultTelegramClaimActionDecision(),
    isDeclineAction: false,
    response,
  };
}

export function buildTelegramClaimContextFailureResult({
  chatId = '',
  callback = null,
  response,
}: {
  chatId?: string;
  callback?: TelegramClaimCallback | null;
  response: Response;
}): TelegramClaimContextResult {
  return buildTelegramClaimEmptyContextResult({
    chatId,
    callback,
    response,
  });
}

export function buildTelegramClaimContextFailureWithEmptyChatId(response: Response): TelegramClaimContextResult {
  return buildTelegramClaimContextFailureWithChatId(response);
}

export function buildTelegramClaimContextFailureWithChatId(
  chatIdOrResponse: string | Response,
  maybeResponse?: Response,
): TelegramClaimContextResult {
  const chatId = typeof chatIdOrResponse === 'string' ? chatIdOrResponse : '';
  const response = (typeof chatIdOrResponse === 'string' ? maybeResponse : chatIdOrResponse) as Response;
  return buildTelegramClaimContextFailureResult({
    chatId,
    callback: null,
    response,
  });
}

export function buildTelegramClaimContextFailureWithCallback(
  chatIdOrCallback: string | TelegramClaimCallback,
  callbackOrResponse: TelegramClaimCallback | Response,
  maybeResponse?: Response,
): TelegramClaimContextResult {
  const chatId = typeof chatIdOrCallback === 'string' ? chatIdOrCallback : '';
  const callback = typeof chatIdOrCallback === 'string'
    ? callbackOrResponse as TelegramClaimCallback
    : chatIdOrCallback;
  const response = (typeof chatIdOrCallback === 'string' ? maybeResponse : callbackOrResponse) as Response;
  return buildTelegramClaimContextFailureResult({
    chatId,
    callback,
    response,
  });
}

export function buildTelegramClaimContextSuccessResult({
  chatId,
  callback,
  resolvedName,
  resolvedPhone,
  progressContext,
}: {
  chatId: string;
  callback: TelegramClaimCallback;
  resolvedName: string;
  resolvedPhone: string;
  progressContext: TelegramClaimProgressContextResult;
}): TelegramClaimContextResult {
  return {
    chatId,
    callback,
    resolvedName,
    resolvedPhone,
    orderIdText: progressContext.orderIdText,
    riderIdText: progressContext.riderIdText,
    nowIso: progressContext.nowIso,
    orderDetailForProgress: progressContext.orderDetailForProgress,
    actionDecision: progressContext.actionDecision,
    isDeclineAction: progressContext.isDeclineAction,
    response: null,
  };
}

export function resolveTelegramClaimContextProgressContextSuccessResult(args: {
  chatId: string;
  callback: TelegramClaimCallback;
  resolvedName: string;
  resolvedPhone: string;
  progressContext: TelegramClaimProgressContextResult;
}): TelegramClaimContextResult {
  return buildTelegramClaimContextSuccessResult(args);
}

export function resolveTelegramClaimContextCallbackOrFailureResult(
  chatIdOrCallback: string | TelegramClaimCallback | null,
  maybeCallback?: TelegramClaimCallback | null,
): TelegramClaimContextResult {
  const chatId = typeof chatIdOrCallback === 'string' ? chatIdOrCallback : '';
  const callback = typeof chatIdOrCallback === 'string' ? (maybeCallback ?? null) : chatIdOrCallback;
  if (!callback) {
    return buildTelegramClaimContextFailureWithChatId(chatId, buildTelegramClaimInvalidCallbackFailureResponse());
  }
  return buildTelegramClaimEmptyContextResult({
    chatId,
    callback,
  });
}

export function resolveTelegramClaimContextCallbackResolutionOrFailureResult(
  chatIdOrCallbackResolution: string | TelegramClaimCallbackResolution,
  maybeCallbackResolution?: TelegramClaimCallbackResolution,
): TelegramClaimContextResult {
  const chatId = typeof chatIdOrCallbackResolution === 'string' ? chatIdOrCallbackResolution : '';
  const callbackResolution = typeof chatIdOrCallbackResolution === 'string'
    ? maybeCallbackResolution as TelegramClaimCallbackResolution
    : chatIdOrCallbackResolution;
  if (callbackResolution.response) {
    return buildTelegramClaimContextFailureWithChatId(chatId, callbackResolution.response);
  }
  return resolveTelegramClaimContextCallbackOrFailureResult(chatId, callbackResolution.callback);
}

export function resolveTelegramClaimContextCallbackContextOrFailureResult({
  chatId,
  callbackContext,
}: {
  chatId?: string;
  callbackContext: TelegramClaimContextResult;
}): TelegramClaimContextResult {
  if (callbackContext.response) {
    return callbackContext;
  }
  return resolveTelegramClaimContextCallbackOrFailureResult(chatId ?? callbackContext.chatId, callbackContext.callback);
}

export function resolveTelegramClaimContextIdentityResolutionOrFailureResult(
  chatIdOrCallback: string | TelegramClaimCallback,
  callbackOrIdentityResolution: TelegramClaimCallback | TelegramClaimIdentityResolution,
  maybeIdentityResolution?: TelegramClaimIdentityResolution,
): TelegramClaimContextResult {
  const chatId = typeof chatIdOrCallback === 'string' ? chatIdOrCallback : '';
  const callback = typeof chatIdOrCallback === 'string'
    ? callbackOrIdentityResolution as TelegramClaimCallback
    : chatIdOrCallback;
  const identityResolution = (typeof chatIdOrCallback === 'string'
    ? maybeIdentityResolution
    : callbackOrIdentityResolution) as TelegramClaimIdentityResolution;
  if (identityResolution.response) {
    return buildTelegramClaimContextFailureWithCallback(chatId, callback, identityResolution.response);
  }
  return buildTelegramClaimEmptyContextResult({
    chatId,
    callback,
    resolvedName: identityResolution.resolvedName,
    resolvedPhone: identityResolution.resolvedPhone,
  });
}

export async function resolveTelegramClaimContextIdentityContextOrFailureResult({
  request,
  chatId,
  callback,
  identityContext,
}: {
  request: Request;
  chatId: string;
  callback: TelegramClaimCallback;
  identityContext: TelegramClaimContextResult;
}): Promise<TelegramClaimContextResult> {
  if (identityContext.response) {
    return identityContext;
  }
  const progressContext = await buildTelegramClaimProgressContext({
    request,
    callback,
    resolvedName: identityContext.resolvedName,
    resolvedPhone: identityContext.resolvedPhone,
  });
  return resolveTelegramClaimContextProgressContextSuccessResult({
    chatId,
    callback,
    resolvedName: identityContext.resolvedName,
    resolvedPhone: identityContext.resolvedPhone,
    progressContext,
  });
}

export async function resolveTelegramClaimContextRequestBodyResolutionOrFailureResult({
  request,
  requestBodyResolution,
}: {
  request: Request;
  requestBodyResolution: TelegramClaimRequestBodyResolution;
}): Promise<TelegramClaimContextResult> {
  if (requestBodyResolution.response) {
    return buildTelegramClaimContextFailureWithEmptyChatId(requestBodyResolution.response);
  }
  const { callbackData, chatId } = requestBodyResolution;
  const callbackResolution = await resolveTelegramClaimCallbackOrFailureResponse({
    request,
    callbackData,
    chatId,
  });
  return resolveTelegramClaimContextCallbackResolutionOrFailureResult(chatId, callbackResolution);
}

export async function resolveTelegramClaimContextRequestBodyContextOrFailureResult({
  request,
  requestBodyResolution,
}: {
  request: Request;
  requestBodyResolution: TelegramClaimRequestBodyResolution;
}): Promise<TelegramClaimContextResult> {
  const callbackContext = await resolveTelegramClaimContextRequestBodyResolutionOrFailureResult({
    request,
    requestBodyResolution,
  });
  return resolveTelegramClaimContextCallbackContextOrFailureResult({
    chatId: callbackContext.chatId,
    callbackContext,
  });
}

export function resolveTelegramClaimContextCallbackToIdentityContextOrFailureResult({
  chatId,
  callbackNextContext,
}: {
  chatId: string;
  callbackNextContext: TelegramClaimContextResult;
}): TelegramClaimContextResult {
  if (callbackNextContext.response) {
    return callbackNextContext;
  }
  return resolveTelegramClaimContextIdentityResolutionOrFailureResult(
    chatId,
    callbackNextContext.callback,
    resolveTelegramClaimIdentityOrFailureResponse({
      callback: callbackNextContext.callback,
      chatId,
    }),
  );
}

export async function resolveTelegramClaimContextCallbackToFinalContextOrFailureResult({
  request,
  callbackNextContext,
}: {
  request: Request;
  callbackNextContext: TelegramClaimContextResult;
}): Promise<TelegramClaimContextResult> {
  const chatId = callbackNextContext.chatId;
  const identityContext = resolveTelegramClaimContextCallbackToIdentityContextOrFailureResult({
    chatId,
    callbackNextContext,
  });
  return resolveTelegramClaimContextIdentityContextOrFailureResult({
    request,
    chatId,
    callback: identityContext.callback as TelegramClaimCallback,
    identityContext,
  });
}

export async function resolveTelegramClaimContextOrFailureResponse(request: Request): Promise<TelegramClaimContextResult> {
  const requestBodyResolution = await resolveTelegramClaimRequestBodyOrFailureResponse(request);
  const callbackNextContext = await resolveTelegramClaimContextRequestBodyContextOrFailureResult({
    request,
    requestBodyResolution,
  });
  return resolveTelegramClaimContextCallbackToFinalContextOrFailureResult({
    request,
    callbackNextContext,
  });
}

export async function handleTelegramNonDeclineAction({
  request,
  callback,
  orderIdText,
  riderIdText,
  resolvedName,
  resolvedPhone,
  chatId,
  nowIso,
  orderDetailForProgress,
  actionDecision,
}: {
  request: Request;
  callback: { orderId?: unknown; riderId?: unknown; restaurantId?: unknown; action?: TelegramClaimAction };
  orderIdText: string;
  riderIdText: string;
  resolvedName: string;
  resolvedPhone: string;
  chatId: string;
  nowIso: string;
  orderDetailForProgress: Record<string, unknown> | null;
  actionDecision: Pick<TelegramClaimActionDecision, 'expectedCurrentStatus' | 'targetStatus' | 'feedbackWriteMode' | 'nextRemarksJson'>;
}): Promise<Response> {
  const {
    nextRemarksJson,
    upstream,
    text,
  } = await handleTelegramProgressSubmission({
    request,
    callback,
    orderIdText,
    resolvedName,
    resolvedPhone,
    chatId,
    nowIso,
    orderDetailForProgress,
    actionDecision,
  });

  return handleTelegramProgressActionTransition({
    request,
    callback,
    actionDecision,
    orderIdText,
    riderIdText,
    resolvedName,
    resolvedPhone,
    nextRemarksJson,
    orderDetailForProgress,
    upstream,
    text,
  });
}

export async function handleTelegramRiderClaim(request: Request): Promise<Response> {
  const contextResolution = await resolveTelegramClaimContextOrFailureResponse(request);
  if (contextResolution.response) return contextResolution.response;

  const {
    chatId,
    callback,
    resolvedName,
    resolvedPhone,
    orderIdText,
    riderIdText,
    nowIso,
    orderDetailForProgress,
    actionDecision,
    isDeclineAction,
  } = contextResolution;

  if (!callback) {
    return buildTelegramClaimInvalidCallbackFailureResponse();
  }

  if (!actionDecision.allowed) {
    return buildTelegramClaimActionDecisionFailureResponse(actionDecision);
  }

  if (isDeclineAction) {
    return handleTelegramDeclineAction({
      request,
      callback,
      actionDecision,
      orderIdText,
      riderIdText,
      resolvedName,
      resolvedPhone,
      chatId,
    });
  }

  return handleTelegramNonDeclineAction({
    request,
    callback,
    orderIdText,
    riderIdText,
    resolvedName,
    resolvedPhone,
    chatId,
    nowIso,
    orderDetailForProgress,
    actionDecision,
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedTelegramRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized_telegram_request' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return handleTelegramRiderClaim(request);
};
