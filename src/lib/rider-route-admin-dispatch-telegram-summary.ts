import { type DispatchMeta } from './rider-dispatch.ts';
import { buildAdminTelegramCompletionResponse } from './rider-route-admin-http.ts';

export interface TelegramDispatchAttempt {
  riderId: string;
  riderName: string;
  riderPhone: string;
  telegramChatIdBound: boolean;
  delivered: boolean;
  error?: string;
  messageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
}

export interface TelegramDispatchSummary {
  failedCount: number;
  skippedReason?: string;
  telegramMessageRef?: NonNullable<DispatchMeta['telegramMessageRef']>;
  attempts: TelegramDispatchAttempt[];
}

export type TelegramDispatchSkippedSummary = Pick<TelegramDispatchSummary, 'failedCount' | 'skippedReason' | 'attempts'>;

export type TelegramDispatchPublicSummary = Omit<
  TelegramDispatchSummary,
  'telegramMessageRef' | 'attempts'
> & {
  attempts: Array<Pick<TelegramDispatchAttempt, 'delivered' | 'error'>>;
};

export function toPublicTelegramDispatchSummary(
  summary: TelegramDispatchSummary | TelegramDispatchSkippedSummary,
): TelegramDispatchPublicSummary | TelegramDispatchSkippedSummary {
  const normalized: Record<string, unknown> = { ...summary };
  delete normalized.telegramMessageRef;
  if (Array.isArray(summary.attempts)) {
    normalized.attempts = summary.attempts.map(({ delivered, error }) => ({
      delivered,
      ...(error ? { error } : {}),
    }));
  }
  return normalized as TelegramDispatchPublicSummary | TelegramDispatchSkippedSummary;
}

export function buildSkippedTelegramDispatchResponse(
  skippedReason: NonNullable<TelegramDispatchSkippedSummary['skippedReason']>,
): Response {
  return buildAdminTelegramCompletionResponse({
    successPayload: {
      telegram_dispatch: {
        failedCount: 0,
        skippedReason,
        attempts: [],
      },
    },
    transformTelegramDispatch: toPublicTelegramDispatchSummary,
  });
}
