import type { AstroCookies } from 'astro';
import { proxyAdminRequest } from './admin-api-route.ts';
import { type DispatchMeta } from './rider-dispatch.ts';
import { readJsonObject } from './rider-route-admin-telegram-core.ts';

export type AdminRidersReadResult =
  | { success: true; riders: Array<Record<string, unknown>> }
  | { success: false; status: number; error: string };

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

export type AdminOrderStatusUpdateResult =
  | { ok: true; status: number }
  | { ok: false; status: number };

export type AdminTelegramNotificationFailure = {
  success: false;
  error: string;
};

export type AdminSingleRiderExecutionTelegramStep<TTelegramResult> =
  | { ok: true; result: TTelegramResult }
  | { ok: false; response: Response };

export type AdminSingleRiderExecutionCompletion<TTelegramDispatch> = {
  messageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
  successPayload: AdminTelegramCompletionSuccessPayload<TTelegramDispatch>;
};

export type AdminTelegramCompletionSuccessPayload<TTelegramDispatch> = {
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

export function buildAdminOrderIdRequiredResponse(): Response {
  return buildAdminSimpleErrorResponse('order_id_required', 400);
}

export function buildAdminInvalidActionResponse(error: 'invalid_action' | 'unsupported_action'): Response {
  return buildAdminSimpleErrorResponse(error, 400);
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
    };
  }

  return {
    ok: true,
    status: upstream.status || 200,
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
      response: buildAdminSimpleErrorResponse('order_update_failed', result.status),
    };
  }

  return {
    ok: true,
    result,
  };
}
