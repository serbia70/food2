import {
  buildDispatchMetaRemarks,
  readDispatchMetaFromRemarks,
  type ResolveRiderOrderActionResult,
  type RiderOrderAction,
} from './rider-dispatch.ts';
import { buildForwardHeaders } from './rider-route-admin-telegram.ts';
import {
  syncTelegramDeliveryProgressMessage,
  writeOrderDispatchRemarks,
} from './rider-route-progress-io.ts';

export function buildRiderActionUpdateStatusRemarks({
  action,
  remarksJson,
  actionDecisionNextRemarksJson,
  acceptedAt,
  pickedUpAt,
  completedAt,
}: {
  action: 'accept' | 'decline' | 'picked_up' | 'complete';
  remarksJson: string;
  actionDecisionNextRemarksJson: string;
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
}): string {
  if (action === 'accept' || action === 'decline') return actionDecisionNextRemarksJson;

  const currentMeta = readDispatchMetaFromRemarks(remarksJson);
  return JSON.stringify(buildDispatchMetaRemarks(remarksJson, {
    ...currentMeta,
    acceptedAt,
    pickedUpAt,
    completedAt,
  }));
}

export function buildRiderActionUpdateStatusPayload({
  orderId,
  action,
  expectedCurrentStatus,
  targetStatus,
  feedbackWriteMode,
  nextRemarksJson,
  riderName,
  riderPhone,
}: {
  orderId: string;
  action: 'accept' | 'decline' | 'picked_up' | 'complete';
  expectedCurrentStatus: string;
  targetStatus: string;
  feedbackWriteMode: 'none' | 'admin_remarks' | 'update_status_remarks';
  nextRemarksJson: string;
  riderName: string;
  riderPhone: string;
}): Record<string, unknown> {
  const numericOrderId = Number(orderId);
  const payload: Record<string, unknown> = {
    id: Number.isInteger(numericOrderId) && numericOrderId > 0 ? numericOrderId : orderId,
    expectedCurrentStatus,
    status: targetStatus,
  };

  if (feedbackWriteMode === 'update_status_remarks' || action === 'picked_up' || action === 'complete') {
    payload.remarksJson = nextRemarksJson;
  }
  if (feedbackWriteMode !== 'update_status_remarks') {
    payload.courierName = riderName;
    payload.courierPhone = riderPhone;
  }

  return payload;
}

export interface SharedRiderDeclineFeedbackActionInput {
  request: Request;
  apiBaseUrl: string;
  orderId: string;
  rider: {
    riderName: string;
    riderPhone: string;
  };
  actionDecision: ResolveRiderOrderActionResult;
}

export type SharedRiderDeclineFeedbackActionResult =
  | { ok: true; status: number }
  | { ok: false; response: Response };

export function buildUpstreamFailureResponse(
  upstream: Response,
  text: string,
  fallbackBody: Record<string, unknown>,
): Response {
  return new Response(text || JSON.stringify(fallbackBody), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

export async function runSharedRiderDeclineFeedbackAction({
  request,
  apiBaseUrl,
  orderId,
  rider,
  actionDecision,
}: SharedRiderDeclineFeedbackActionInput): Promise<SharedRiderDeclineFeedbackActionResult> {
  const payload = buildRiderActionUpdateStatusPayload({
    orderId,
    action: 'decline',
    expectedCurrentStatus: actionDecision.expectedCurrentStatus,
    targetStatus: actionDecision.targetStatus,
    feedbackWriteMode: actionDecision.feedbackWriteMode,
    nextRemarksJson: actionDecision.nextRemarksJson,
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
    return {
      ok: false,
      response: buildUpstreamFailureResponse(upstream, text, {
        success: false,
        error: 'decline_feedback_failed',
      }),
    };
  }

  return {
    ok: true,
    status: upstream.status,
  };
}

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
