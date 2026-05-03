import {
  buildDispatchMetaRemarks,
  readDispatchMetaFromRemarks,
} from './rider-dispatch.ts';

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
