import { type DispatchMeta } from './rider-dispatch.ts';

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
