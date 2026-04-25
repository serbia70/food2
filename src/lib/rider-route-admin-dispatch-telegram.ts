import { API_BASE_URL, SITE_BASE_URL } from '../config.ts';
import { type AssignableRider } from './rider-assignment.ts';
import { type DispatchMeta } from './rider-dispatch.ts';
import { buildAdminTelegramCompletionResponse } from './rider-route-admin-http.ts';
import { readAdminPublishOrderMessageInput } from './rider-route-admin-orders.ts';
import { readTelegramRiderChatId, sendAdminPublishedOrderTelegramToRider } from './rider-route-admin-telegram.ts';
import { readAdminAssignableRidersOrResponse, readProtectedTelegramCallbackSecret } from './rider-route-admin-state.ts';
import { normalizeRiderId, type DispatchOrderSnapshot, type RouteCookies } from './rider-route-admin-dispatch-meta.ts';

export type TelegramRiderRow = AssignableRider;

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
export type TelegramDispatchResult =
  | { ok: true; summary: TelegramDispatchSummary }
  | { ok: false; response: Response };

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

export async function notifyTelegramRecipients(
  request: Request,
  cookies: RouteCookies,
  order: DispatchOrderSnapshot,
  riderFilter?: (rider: TelegramRiderRow) => boolean,
): Promise<TelegramDispatchResult> {
  const ridersResult = await readAdminAssignableRidersOrResponse({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
  });
  if (!ridersResult.ok) {
    return {
      ok: false,
      response: ridersResult.response,
    };
  }

  const scopedRiders = riderFilter ? ridersResult.riders.filter(riderFilter) : ridersResult.riders;
  const availableRiderCount = scopedRiders.length;
  const telegramRiders = scopedRiders.filter((rider) => readTelegramRiderChatId(rider) !== '');
  const telegramBoundCount = telegramRiders.length;

  const baseSummary: TelegramDispatchSummary = {
    failedCount: 0,
    attempts: scopedRiders.map((rider) => {
      const riderChatId = readTelegramRiderChatId(rider);
      const riderName = String(rider.name || '未命名骑手').trim();
      const riderPhone = String(rider.phone || '').trim();
      const telegramChatIdBound = riderChatId !== '';
      return {
        riderId: normalizeRiderId(rider.id),
        riderName,
        riderPhone,
        telegramChatIdBound,
        delivered: false,
        error: telegramChatIdBound ? undefined : 'telegram_not_bound',
      };
    }),
  };

  if (availableRiderCount === 0) {
    return {
      ok: true,
      summary: {
        ...baseSummary,
        skippedReason: 'no_available_riders',
      },
    };
  }

  if (telegramBoundCount === 0) {
    return {
      ok: true,
      summary: {
        ...baseSummary,
        failedCount: availableRiderCount,
        skippedReason: 'no_telegram_bound_riders',
      },
    };
  }

  const restaurantId = String(order.shopSlug || order.shopId || '').trim();
  if (!restaurantId) {
    return {
      ok: true,
      summary: {
        ...baseSummary,
        failedCount: telegramBoundCount,
        skippedReason: 'missing_restaurant_id',
        attempts: baseSummary.attempts.map((attempt) => (
          attempt.telegramChatIdBound
            ? { ...attempt, error: 'missing_restaurant_id' }
            : attempt
        )),
      },
    };
  }

  const callbackSecretOverride = await readProtectedTelegramCallbackSecret(request);
  const messageInput = readAdminPublishOrderMessageInput(order, SITE_BASE_URL);

  const attempts = await Promise.all(telegramRiders.map(async (rider): Promise<TelegramDispatchAttempt> => {
    const riderName = String(rider.name || '').trim();
    const riderPhone = String(rider.phone || '').trim();
    const riderChatId = readTelegramRiderChatId(rider);
    const attemptBase = {
      riderId: normalizeRiderId(rider.id),
      riderName: riderName || '未命名骑手',
      riderPhone,
      telegramChatIdBound: true,
    };
    const sendOutcome = await sendAdminPublishedOrderTelegramToRider({
      request,
      rider,
      fallbackChatId: riderChatId,
      orderId: order.id,
      shopSlug: order.shopSlug,
      restaurantId,
      callbackSecretOverride,
      messageInput,
    });

    if (!sendOutcome.success) {
      return {
        ...attemptBase,
        delivered: false,
        error: sendOutcome.error,
      };
    }

    return {
      ...attemptBase,
      delivered: true,
      ...(sendOutcome.messageRef ? { messageRef: sendOutcome.messageRef } : {}),
    };
  }));

  const mergedAttempts = baseSummary.attempts.map((attempt) => {
    if (!attempt.telegramChatIdBound) return attempt;
    return attempts.find((item) => item.riderId === attempt.riderId) || attempt;
  });
  const deliveredCount = mergedAttempts.filter((a) => a.delivered).length;
  const failedCount = mergedAttempts.length - deliveredCount;
  const firstDeliveredMessageRef = mergedAttempts.find((a) => a.delivered && a.messageRef)?.messageRef;

  return {
    ok: true,
    summary: {
      failedCount,
      ...(firstDeliveredMessageRef ? { telegramMessageRef: firstDeliveredMessageRef } : {}),
      attempts: mergedAttempts,
    },
  };
}
