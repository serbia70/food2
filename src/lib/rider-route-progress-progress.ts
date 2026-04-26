import {
  readDispatchMetaFromRemarks,
  type ResolveRiderOrderActionResult,
  type RiderOrderAction,
} from './rider-dispatch.ts';
import { buildForwardHeaders } from './rider-route-admin-telegram-core.ts';
import {
  syncTelegramDeliveryProgressMessage,
  writeOrderDispatchRemarks,
} from './rider-route-progress-io.ts';
import {
  buildRiderActionUpdateStatusPayload,
  buildRiderActionUpdateStatusRemarks,
  buildUpstreamFailureResponse,
} from './rider-route-progress-payloads.ts';

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
