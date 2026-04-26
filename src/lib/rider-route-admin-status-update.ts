import type { AstroCookies } from 'astro';
import { proxyAdminRequest } from './admin-api-route.ts';
import { readJsonObject } from './rider-route-admin-telegram-core.ts';
import { buildAdminSimpleErrorResponse } from './rider-route-admin-responses.ts';

export type AdminOrderStatusUpdateResult =
  | { ok: true; status: number }
  | { ok: false; status: number };

export async function updateAdminOrderStatus({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  payload,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  payload: Record<string, unknown>;
}): Promise<AdminOrderStatusUpdateResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders/${encodeURIComponent(orderId)}/status`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const bodyText = await upstream.text();
  const bodyJson = readJsonObject(bodyText) || {};

  if (!upstream.ok || bodyJson.success === false) {
    return {
      ok: false,
      status: upstream.status || 502,
    };
  }

  return {
    ok: true,
    status: upstream.status || 200,
  };
}

export async function updateAdminOrderStatusOrResponse({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  payload,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  payload: Record<string, unknown>;
}): Promise<
  | { ok: true; result: Extract<AdminOrderStatusUpdateResult, { ok: true }> }
  | { ok: false; response: Response }
> {
  const result = await updateAdminOrderStatus({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    payload,
  });

  if (!result.ok) {
    return {
      ok: false,
      response: buildAdminSimpleErrorResponse('order_update_failed', result.status),
    };
  }

  return {
    ok: true,
    result,
  };
}
