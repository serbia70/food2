import { buildForwardHeaders } from './rider-route-admin-telegram-core.ts';
import type { ResolveRiderOrderActionResult } from './rider-dispatch.ts';
import {
  buildRiderActionUpdateStatusPayload,
  buildUpstreamFailureResponse,
} from './rider-route-progress-payloads.ts';

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
