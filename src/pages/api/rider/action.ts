import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import {
  resolveRiderOrderAction,
} from '../../../lib/rider-dispatch.ts';
import {
  readOrderDispatchSnapshot,
  runSharedRiderProgressAction,
  buildUpstreamFailureResponse,
  buildForwardHeaders,
  buildRiderActionUpdateStatusPayload,
} from '../../../lib/rider-route-shared.ts';

export const prerender = false;

const apiBaseUrl = String(process.env.PUBLIC_API_URL || API_BASE_URL || '').trim().replace(/\/$/, '');
const riderActions = new Set(['accept', 'decline', 'picked_up', 'complete']);

function readTelegramSendShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  if (!slug || slug === 'admin') return '';
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

interface RiderActionBody {
  action?: unknown;
  orderId?: unknown;
  riderId?: unknown;
  riderName?: unknown;
  riderPhone?: unknown;
  shopSlug?: unknown;
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

  if (action === 'accept' || action === 'picked_up' || action === 'complete') {
    return runSharedRiderProgressAction({
      request,
      apiBaseUrl,
      telegramSendUrl: new URL('/api/telegram/send', request.url),
      orderId,
      action,
      rider: { riderId, riderName, riderPhone },
      order: {
        status: orderSnapshot.status || 'awaiting_courier',
        remarksJson: orderSnapshot.remarksJson,
        courierPhone: orderSnapshot.courierPhone || riderPhone,
      },
      actionDecision,
      nowIso,
      telegram: {
        fallbackShopSlug,
      },
    });
  }

  const payload = buildRiderActionUpdateStatusPayload({
    orderId,
    action: 'decline',
    expectedCurrentStatus: actionDecision.expectedCurrentStatus,
    targetStatus: actionDecision.targetStatus,
    feedbackWriteMode: actionDecision.feedbackWriteMode,
    nextRemarksJson: actionDecision.nextRemarksJson,
    riderName,
    riderPhone,
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
    return buildUpstreamFailureResponse(upstream, text, { success: false, error: 'order_status_updated' });
  }

  return new Response(JSON.stringify({ success: true, action }), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

