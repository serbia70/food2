import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import {
  buildAssignedOrderStatusPayload,
  pickNextAvailableRider,
  readOnlineRiders,
  type AssignableRider,
} from '../../../lib/rider-assignment.ts';

export const prerender = false;

async function fetchAvailableRiders(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies']) {
  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/riders`,
    method: 'GET',
  });
  const text = await res.text();
  if (!res.ok) return [] as AssignableRider[];

  try {
    const parsed = JSON.parse(text) as { riders?: unknown };
    return readOnlineRiders(parsed.riders);
  } catch {
    return [] as AssignableRider[];
  }
}

async function notifyAssignedRider({ rider, shopSlug }: { rider: AssignableRider; shopSlug: string }) {
  const chatId = String((rider as { telegramChatId?: unknown; telegram_chat_id?: unknown }).telegramChatId || (rider as { telegram_chat_id?: unknown }).telegram_chat_id || '').trim();
  if (!chatId) return;

  await fetch(`${API_BASE_URL}/api/telegram/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shopSlug,
      chat_id: chatId,
      text: `订单已指派给你：${String(rider.name || '').trim()}`,
    }),
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || '').trim();
  const orderId = String(body.orderId || '').trim();
  const shopSlug = String(body.shopSlug || '').trim();
  const lastAssignedRiderId = String(body.lastAssignedRiderId || '').trim();
  const manualRiderId = String(body.riderId || '').trim();

  if (!orderId) {
    return new Response(JSON.stringify({ success: false, error: 'order_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const riders = await fetchAvailableRiders(request, cookies);
  let target: AssignableRider | null = null;

  if (action === 'manual_assign') {
    target = riders.find((row) => String(row.id || '').trim() === manualRiderId) || null;
  }

  if (action === 'auto_assign') {
    target = pickNextAvailableRider({ riders, lastAssignedRiderId });
  }

  if (!target) {
    return new Response(JSON.stringify({ success: false, error: 'no_available_riders' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updateRes = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders/${encodeURIComponent(orderId)}/status`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAssignedOrderStatusPayload({ rider: target })),
  });

  const updateText = await updateRes.text();
  let updateJson: Record<string, unknown> = {};
  try {
    updateJson = JSON.parse(updateText) as Record<string, unknown>;
  } catch {
    updateJson = {};
  }

  if (!updateRes.ok || updateJson.success === false) {
    return new Response(JSON.stringify({
      success: false,
      error: 'order_update_failed',
      upstream_status: updateRes.status,
      upstream_body: updateText || JSON.stringify(updateJson),
    }), {
      status: updateRes.status || 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await notifyAssignedRider({ rider: target, shopSlug });

  return new Response(JSON.stringify({
    success: true,
    rider: {
      id: target.id,
      name: target.name,
      phone: target.phone,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
