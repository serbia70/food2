import {
  buildDispatchMetaRemarks,
  buildRiderOrderView,
  readDispatchMetaFromRemarks,
  resolveRiderUnifiedStatus,
  type ResolveRiderOrderActionResult,
} from './rider-dispatch.ts';
import {
  buildRiderSingleMessageTelegram,
  buildTelegramEditMessagePayload,
  buildTelegramShortClaimCallback,
} from './telegram-dispatch.ts';
import { readTelegramItemSummaryFromOrder } from './rider-route-shared.ts';

export type RiderProgressAction = 'accept' | 'decline' | 'picked_up' | 'complete';

export function readTelegramSendShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  if (!slug || slug === 'admin') return '';
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

export function readOrderTelegramShopSlug(order: Record<string, unknown>, fallback?: unknown): string {
  return readTelegramSendShopSlug(order.shopSlug)
    || readTelegramSendShopSlug(order.slug)
    || readTelegramSendShopSlug(order.restaurantSlug)
    || readTelegramSendShopSlug(order.shop_slug)
    || readTelegramSendShopSlug(order.restaurant_slug)
    || readTelegramSendShopSlug(order.restaurantId)
    || readTelegramSendShopSlug(order.shopId)
    || readTelegramSendShopSlug(fallback);
}

export function buildRiderTelegramProgressEditPayload({
  order,
  orderId,
  riderId,
  riderName,
  riderPhone,
  remarksJson,
  targetStatus,
  fallbackShopSlug = '',
}: {
  order: Record<string, unknown>;
  orderId: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  remarksJson: string;
  targetStatus: 'delivering' | 'picked_up' | 'completed';
  fallbackShopSlug?: string;
}): { shopSlug: string; payload: ReturnType<typeof buildTelegramEditMessagePayload> } | null {
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const messageRef = meta.telegramMessageRef;
  if (!messageRef) return null;

  const orderView = buildRiderOrderView({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: riderPhone,
  });
  const unifiedStatus = resolveRiderUnifiedStatus({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: riderPhone,
  }, {
    riderId,
    riderPhone,
  });
  const shopSlug = readOrderTelegramShopSlug(order, fallbackShopSlug);
  const primaryCallbackData = unifiedStatus.primaryAction && shopSlug
    ? buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId: Number(riderId),
        riderName,
        riderPhone,
        restaurantId: shopSlug,
        telegramChatId: messageRef.chatId,
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

  return {
    shopSlug,
    payload: buildTelegramEditMessagePayload({
      chatId: messageRef.chatId,
      messageId: messageRef.messageId,
      text: message.text,
      replyMarkup: message.replyMarkup,
    }),
  };
}

export function buildRiderTelegramProgressSyncPayload(args: {
  order: Record<string, unknown>;
  orderId: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  remarksJson: string;
  targetStatus: 'delivering' | 'picked_up' | 'completed';
  fallbackShopSlug?: string;
}): { shopSlug: string; payload: Record<string, unknown> } | null {
  const edit = buildRiderTelegramProgressEditPayload(args);
  if (!edit) return null;
  return {
    shopSlug: edit.shopSlug,
    payload: {
      ...(edit.shopSlug ? { shopSlug: edit.shopSlug } : {}),
      ...edit.payload,
    },
  };
}

export function buildRiderProgressUpdate({
  action,
  orderId,
  riderName,
  riderPhone,
  remarksJson,
  nowIso,
  actionDecision,
}: {
  action: RiderProgressAction;
  orderId: string;
  riderName: string;
  riderPhone: string;
  remarksJson: string;
  nowIso: string;
  actionDecision: Pick<ResolveRiderOrderActionResult, 'expectedCurrentStatus' | 'targetStatus' | 'feedbackWriteMode' | 'nextRemarksJson'>;
}): {
  nextRemarksJson: string;
  updateStatusPayload: Record<string, unknown>;
} {
  const currentMeta = readDispatchMetaFromRemarks(remarksJson);
  const nextRemarksJson = action === 'picked_up' || action === 'complete'
    ? JSON.stringify(buildDispatchMetaRemarks(remarksJson, {
        ...currentMeta,
        acceptedAt: currentMeta.acceptedAt,
        pickedUpAt: action === 'picked_up' ? nowIso : currentMeta.pickedUpAt,
        completedAt: action === 'complete' ? nowIso : currentMeta.completedAt,
      }))
    : actionDecision.nextRemarksJson;

  const numericOrderId = Number(orderId);
  const updateStatusPayload: Record<string, unknown> = {
    id: Number.isInteger(numericOrderId) && numericOrderId > 0 ? numericOrderId : orderId,
    expectedCurrentStatus: actionDecision.expectedCurrentStatus,
    status: actionDecision.targetStatus,
  };

  if (actionDecision.feedbackWriteMode === 'update_status_remarks' || action === 'picked_up' || action === 'complete') {
    updateStatusPayload.remarksJson = nextRemarksJson;
  }
  if (actionDecision.feedbackWriteMode !== 'update_status_remarks') {
    updateStatusPayload.courierName = riderName;
    updateStatusPayload.courierPhone = riderPhone;
  }

  return {
    nextRemarksJson,
    updateStatusPayload,
  };
}
