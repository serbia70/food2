import type { AstroCookies } from 'astro';
import { proxyAdminRequest } from './admin-api-route.ts';
import {
  fetchProtectedAdminMasterSettings,
  readTelegramCallbackSecretFromMasterSettings,
} from './admin-master-settings.ts';
import { type AssignableRider, readOnlineRiders } from './rider-assignment.ts';
import { buildAdminRidersReadFailureResponse } from './rider-route-admin-http.ts';
import { readJsonObject } from './rider-route-admin-telegram-core.ts';

export async function readProtectedTelegramCallbackSecret(request: Request): Promise<string> {
  const cookie = request.headers.get('cookie') || '';
  const authorization = String(request.headers.get('authorization') || '').trim();
  if (!authorization && !cookie) return '';
  const masterSettings = await fetchProtectedAdminMasterSettings({ authorization, cookie });
  return readTelegramCallbackSecretFromMasterSettings(masterSettings);
}

function pickAdminSingleRiderById<TRider extends { id?: unknown }>({
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

async function readAdminAssignableRiders({
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
