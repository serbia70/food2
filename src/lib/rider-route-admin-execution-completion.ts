import type { AstroCookies } from 'astro';
import { type DispatchMeta } from './rider-dispatch.ts';
import {
  type AdminTelegramCompletionSuccessPayload,
  buildAdminTelegramCompletionResponse,
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
