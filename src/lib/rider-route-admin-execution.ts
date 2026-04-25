import type { AstroCookies } from 'astro';
import { type DispatchMeta } from './rider-dispatch.ts';
import {
  type AdminSingleRiderExecutionCompletion,
  type AdminSingleRiderExecutionTelegramStep,
  type AdminTelegramCompletionSuccessPayload,
  buildAdminTelegramCompletionResponse,
  updateAdminOrderStatusOrResponse,
} from './rider-route-admin-http.ts';
import { persistAdminTelegramMessageRef } from './rider-route-admin-state.ts';

export async function finalizeAdminTelegramCompletionResponse<TTelegramDispatch, TPublicTelegramDispatch = TTelegramDispatch>({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  messageRef,
  successPayload,
  transformTelegramDispatch,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  messageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
  successPayload: AdminTelegramCompletionSuccessPayload<TTelegramDispatch>;
  transformTelegramDispatch?: (summary: TTelegramDispatch) => TPublicTelegramDispatch;
}): Promise<Response> {
  if (messageRef) {
    await persistAdminTelegramMessageRef({
      request,
      cookies,
      apiBaseUrl,
      orderId,
      messageRef,
    });
  }

  return buildAdminTelegramCompletionResponse({
    successPayload: {
      ...successPayload,
    },
    transformTelegramDispatch,
  });
}

export async function runAdminSingleRiderExecution<TTelegramDispatch, TTelegramResult>({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  updatePayload,
  sendTelegram,
  finalize,
  transformTelegramDispatch,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  updatePayload: Record<string, unknown>;
  sendTelegram: () => Promise<AdminSingleRiderExecutionTelegramStep<TTelegramResult>>;
  finalize: (telegramStep: AdminSingleRiderExecutionTelegramStep<TTelegramResult>) => Promise<AdminSingleRiderExecutionCompletion<TTelegramDispatch>> | AdminSingleRiderExecutionCompletion<TTelegramDispatch>;
  transformTelegramDispatch?: (summary: TTelegramDispatch) => unknown;
}): Promise<Response> {
  const updateResult = await updateAdminOrderStatusOrResponse({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    payload: updatePayload,
  });

  if (!updateResult.ok) {
    return updateResult.response;
  }

  const telegramStep = await sendTelegram();
  if (!telegramStep.ok) {
    return telegramStep.response;
  }

  const completion = await finalize(telegramStep);

  return finalizeAdminTelegramCompletionResponse({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    ...(completion.messageRef ? { messageRef: completion.messageRef } : {}),
    successPayload: completion.successPayload,
    transformTelegramDispatch,
  });
}
