import type { AstroCookies } from 'astro';
import {
  type AdminSingleRiderExecutionCompletion,
  type AdminSingleRiderExecutionTelegramStep,
  updateAdminOrderStatusOrResponse,
} from './rider-route-admin-http.ts';
import { finalizeAdminTelegramCompletionResponse } from './rider-route-admin-execution-completion.ts';

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
