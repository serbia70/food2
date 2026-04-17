import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import {
  resolveRiderOrderAction,
} from '../../../lib/rider-dispatch.ts';
import {
  buildForwardHeaders,
  buildUpstreamFailureResponse,
  readOrderDetail,
  readOrderDispatchSnapshot,
  sendTelegramMessage,
  writeOrderDispatchRemarks,
} from '../../../lib/rider-route-shared.ts';
import {
  buildRiderProgressUpdate,
  buildRiderTelegramProgressSyncPayload,
  readTelegramSendShopSlug,
} from '../../../lib/rider-progress-shared.ts';

export const prerender = false;

const apiBaseUrl = String(process.env.PUBLIC_API_URL || API_BASE_URL || '').trim().replace(/\/$/, '');
const riderActions = new Set(['accept', 'decline', 'picked_up', 'complete']);

interface RiderActionBody {
  action?: unknown;
  orderId?: unknown;
  riderId?: unknown;
  riderName?: unknown;
  riderPhone?: unknown;
  shopSlug?: unknown;
}

export async function handleRiderProgressActionTransition({
  request,
  action,
  upstream,
  text,
  orderId,
  riderId,
  riderName,
  riderPhone,
  nextRemarksJson,
  fallbackShopSlug,
}: {
  request: Request;
  action: 'accept' | 'picked_up' | 'complete';
  upstream: Response;
  text: string;
  orderId: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  nextRemarksJson: string;
  fallbackShopSlug: string;
}): Promise<Response> {
  if (!upstream.ok) {
    return buildUpstreamFailureResponse(upstream, text, {
      success: false,
      error: action === 'complete' ? 'order_completed' : 'order_status_updated',
    });
  }

  try {
    const order = await readOrderDetail(request, apiBaseUrl, orderId, riderPhone);
    const syncPayload = order
      ? buildRiderTelegramProgressSyncPayload({
          order,
          orderId,
          riderId,
          riderName,
          riderPhone,
          remarksJson: nextRemarksJson,
          targetStatus: action === 'accept' ? 'delivering' : (action === 'picked_up' ? 'picked_up' : 'completed'),
          fallbackShopSlug,
        })
      : null;
    if (syncPayload) {
      await sendTelegramMessage({
        request,
        payload: syncPayload.payload,
      });
    }
  } catch {
    // 不阻断主流程成功回包
  }

  return new Response(JSON.stringify({ success: true, action }), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let parsedBody: RiderActionBody;

  try {
    parsedBody = await request.json() as RiderActionBody;
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const action = String(parsedBody.action || '').trim();
  const orderId = String(parsedBody.orderId || '').trim();
  const riderId = String(parsedBody.riderId || '').trim();
  const riderName = String(parsedBody.riderName || '').trim();
  const riderPhone = String(parsedBody.riderPhone || '').trim();
  const fallbackShopSlug = readTelegramSendShopSlug(parsedBody.shopSlug);

  if (!riderActions.has(action) || !orderId || !riderId || !riderName || !riderPhone) {
    return new Response(JSON.stringify({ success: false, error: 'invalid_rider_action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nowIso = new Date().toISOString();
  const orderSnapshot = await readOrderDispatchSnapshot(request, apiBaseUrl, orderId, riderPhone);
  const actionDecision = resolveRiderOrderAction({
    action: action as 'accept' | 'decline' | 'picked_up' | 'complete',
    order: {
      status: orderSnapshot.status || 'awaiting_courier',
      remarksJson: orderSnapshot.remarksJson,
      courierPhone: orderSnapshot.courierPhone || riderPhone,
    },
    riderId,
    riderName,
    riderPhone,
    nowIso,
  });

  if (!actionDecision.allowed) {
    const body: Record<string, unknown> = { success: false, error: actionDecision.error };
    if (actionDecision.reason) body.reason = actionDecision.reason;
    return new Response(JSON.stringify(body), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (actionDecision.feedbackWriteMode === 'admin_remarks') {
    await writeOrderDispatchRemarks(request, apiBaseUrl, orderId, actionDecision.nextRemarksJson);
  }

  const {
    nextRemarksJson,
    updateStatusPayload: payload,
  } = buildRiderProgressUpdate({
    action: action as 'accept' | 'decline' | 'picked_up' | 'complete',
    orderId,
    riderName,
    riderPhone,
    remarksJson: orderSnapshot.remarksJson,
    nowIso,
    actionDecision,
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

  if (action === 'accept' || action === 'picked_up' || action === 'complete') {
    return handleRiderProgressActionTransition({
      request,
      action,
      upstream,
      text,
      orderId,
      riderId,
      riderName,
      riderPhone,
      nextRemarksJson,
      fallbackShopSlug,
    });
  }

  if (!upstream.ok) {
    return buildUpstreamFailureResponse(upstream, text, { success: false, error: 'order_status_updated' });
  }

  return new Response(JSON.stringify({ success: true, action }), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
