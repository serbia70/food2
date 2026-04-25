import type { AstroCookies } from 'astro';
import { proxyAdminRequest } from './admin-api-route.ts';
import {
  fetchProtectedAdminMasterSettings,
  readTelegramCallbackSecretFromMasterSettings,
} from './admin-master-settings.ts';
import { type AssignableRider, readOnlineRiders } from './rider-assignment.ts';
import {
  buildDispatchMetaRemarks,
  readDispatchMetaFromRemarks,
  type DispatchMeta,
} from './rider-dispatch.ts';
import { type AdminOrderReadResult, readAdminOrderById } from './rider-route-admin-orders.ts';
import { buildAdminRidersReadFailureResponse } from './rider-route-admin-http.ts';
import { readJsonObject } from './rider-route-admin-telegram.ts';

export type AdminDispatchMetaWriteResult =
  | { ok: true; remarksJson: string }
  | { ok: false; status: number; upstreamBody: string };

export type AdminTelegramMessageRefPersistResult =
  | {
    ok: true;
    order: Record<string, unknown>;
    remarksJson: string;
  }
  | {
    ok: false;
    code: 'order_read_failed' | 'order_not_found' | 'remarks_write_failed';
  };

export async function readProtectedTelegramCallbackSecret(request: Request): Promise<string> {
  const cookie = request.headers.get('cookie') || '';
  const authorization = String(request.headers.get('authorization') || '').trim();
  if (!authorization && !cookie) return '';
  const masterSettings = await fetchProtectedAdminMasterSettings({ authorization, cookie });
  return readTelegramCallbackSecretFromMasterSettings(masterSettings);
}

export function pickAdminSingleRiderById<TRider extends { id?: unknown }>({
  riders,
  riderId,
}: {
  riders: TRider[];
  riderId: string;
}): TRider | null {
  const normalizedRiderId = String(riderId || '').trim();
  if (!normalizedRiderId) return null;
  return riders.find((rider) => String(rider?.id || '').trim() === normalizedRiderId) || null;
}

export function resolveAdminRequestedRiderSelection<TRider extends { id?: unknown }>({
  riderId,
  eligibleRiders,
  allRiders,
}: {
  riderId: string;
  eligibleRiders: TRider[];
  allRiders: TRider[];
}):
  | { kind: 'selected'; rider: TRider }
  | { kind: 'declined' }
  | { kind: 'missing' }
  | { kind: 'empty' } {
  const normalizedRiderId = String(riderId || '').trim();
  if (!normalizedRiderId) return { kind: 'empty' };

  const eligibleRider = pickAdminSingleRiderById({
    riders: eligibleRiders,
    riderId: normalizedRiderId,
  });
  if (eligibleRider) {
    return { kind: 'selected', rider: eligibleRider };
  }

  const allRider = pickAdminSingleRiderById({
    riders: allRiders,
    riderId: normalizedRiderId,
  });
  if (allRider) {
    return { kind: 'declined' };
  }

  return { kind: 'missing' };
}

function hasRecognizableRiderList(payload: Record<string, unknown>): boolean {
  if (Array.isArray(payload.riders) || Array.isArray(payload.rows) || Array.isArray(payload.items)) {
    return true;
  }

  const data = payload.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

  const nested = data as Record<string, unknown>;
  return Array.isArray(nested.riders) || Array.isArray(nested.rows) || Array.isArray(nested.items);
}

export type AdminRidersReadResult =
  | { success: true; riders: AssignableRider[] }
  | { success: false; status: number; error: string };

export type AdminRidersReadFailure = Extract<AdminRidersReadResult, { success: false }>;

export async function readAdminAssignableRiders({
  request,
  cookies,
  apiBaseUrl,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
}): Promise<AdminRidersReadResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/riders`,
    method: 'GET',
  });
  const text = await upstream.text();
  const parsed = readJsonObject(text);
  const payloadInvalid = !parsed || !hasRecognizableRiderList(parsed);

  if (!upstream.ok || payloadInvalid || parsed.success === false) {
    const error = typeof parsed?.error === 'string' && parsed.error.trim() ? parsed.error.trim() : 'riders_upstream_failed';
    return {
      success: false,
      status: upstream.status || 502,
      error,
    };
  }

  return {
    success: true,
    riders: readOnlineRiders(parsed),
  };
}

export async function readAdminAssignableRidersOrResponse({
  request,
  cookies,
  apiBaseUrl,
  coerce2xxTo502 = false,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  coerce2xxTo502?: boolean;
}): Promise<
  | { ok: true; riders: AssignableRider[] }
  | { ok: false; response: Response }
> {
  const ridersResult = await readAdminAssignableRiders({
    request,
    cookies,
    apiBaseUrl,
  });
  if (!ridersResult.success) {
    return {
      ok: false,
      response: buildAdminRidersReadFailureResponse(ridersResult, { coerce2xxTo502 }),
    };
  }
  return {
    ok: true,
    riders: ridersResult.riders,
  };
}

export async function writeAdminDispatchMetaRemarks({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  remarksJson,
  nextMeta,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  remarksJson: string;
  nextMeta: DispatchMeta;
}): Promise<AdminDispatchMetaWriteResult> {
  const nextRemarks = buildDispatchMetaRemarks(remarksJson, nextMeta);
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders/remarks`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      remarks: nextRemarks,
    }),
  });
  const text = await upstream.text();

  const payload = readJsonObject(text) || {};
  if (!upstream.ok || payload.success === false) {
    return {
      ok: false,
      status: upstream.status,
      upstreamBody: text || JSON.stringify(payload),
    };
  }

  return {
    ok: true,
    remarksJson: JSON.stringify(nextRemarks),
  };
}

export async function persistAdminTelegramMessageRef({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  messageRef,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  messageRef: NonNullable<DispatchMeta['telegramMessageRef']>;
}): Promise<AdminTelegramMessageRefPersistResult> {
  const latestOrderResult: AdminOrderReadResult = await readAdminOrderById({
    request,
    cookies,
    apiBaseUrl,
    orderId,
  });

  if (!latestOrderResult.ok) {
    return {
      ok: false,
      code: 'order_read_failed',
    };
  }

  if (!latestOrderResult.order) {
    return {
      ok: false,
      code: 'order_not_found',
    };
  }

  const nextMeta: DispatchMeta = {
    ...readDispatchMetaFromRemarks(latestOrderResult.remarksJson),
    telegramMessageRef: messageRef,
  };
  const remarksResult = await writeAdminDispatchMetaRemarks({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    remarksJson: latestOrderResult.remarksJson,
    nextMeta,
  });

  if (!remarksResult.ok) {
    return {
      ok: false,
      code: 'remarks_write_failed',
    };
  }

  return {
    ok: true,
    order: latestOrderResult.order,
    remarksJson: remarksResult.remarksJson,
  };
}
