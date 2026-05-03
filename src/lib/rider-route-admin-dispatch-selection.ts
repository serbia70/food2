import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../config.ts';
import { type AssignableRider } from './rider-assignment.ts';
import { type DispatchMeta } from './rider-dispatch.ts';
import { buildAdminSimpleErrorResponse } from './rider-route-admin-http.ts';
import {
  readAdminAssignableRidersOrResponse,
  resolveAdminRequestedRiderSelection,
  writeAdminDispatchMetaRemarks,
} from './rider-route-admin-state.ts';
import { type DispatchOrderSnapshot, normalizeRiderId } from './rider-route-admin-dispatch-snapshot.ts';

export type RouteCookies = Parameters<APIRoute['POST']>[0]['cookies'];

export function pickNextRiderOnTimeout({
  riders,
  currentRiderId,
  invalidatedRiderIds,
}: {
  riders: AssignableRider[];
  currentRiderId: string;
  invalidatedRiderIds: string[];
}): AssignableRider | null {
  const normalizedCurrent = normalizeRiderId(currentRiderId);
  if (!normalizedCurrent) return null;

  const excluded = new Set(invalidatedRiderIds.map(normalizeRiderId).filter(Boolean));
  const candidates = riders.filter((rider) => !excluded.has(normalizeRiderId(rider.id)));
  if (candidates.length === 0) return null;

  const currentIndex = candidates.findIndex((rider) => normalizeRiderId(rider.id) === normalizedCurrent);
  if (currentIndex < 0) return candidates[0] || null;
  if (candidates.length <= 1) return null;
  return candidates[(currentIndex + 1) % candidates.length] || null;
}

async function writeDispatchMetaRemarks({
  request,
  cookies,
  orderId,
  order,
  nextMeta,
}: {
  request: Request;
  cookies: RouteCookies;
  orderId: string;
  order: DispatchOrderSnapshot;
  nextMeta: DispatchMeta;
}) {
  return writeAdminDispatchMetaRemarks({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    orderId,
    remarksJson: String(order.remarksJson || '').trim(),
    nextMeta,
  });
}

export async function writeDispatchMetaRemarksAndMergeOrder({
  request,
  cookies,
  orderId,
  order,
  nextMeta,
}: {
  request: Request;
  cookies: RouteCookies;
  orderId: string;
  order: DispatchOrderSnapshot;
  nextMeta: DispatchMeta;
}): Promise<
  | { ok: true; mergedOrder: DispatchOrderSnapshot }
  | { ok: false; response: Response }
> {
  const remarksResult = await writeDispatchMetaRemarks({
    request,
    cookies,
    orderId,
    order,
    nextMeta,
  });
  if (!remarksResult.ok) {
    return {
      ok: false,
      response: buildAdminSimpleErrorResponse('dispatch_meta_write_failed', remarksResult.status),
    };
  }

  return {
    ok: true,
    mergedOrder: {
      ...order,
      remarksJson: remarksResult.remarksJson,
    } satisfies DispatchOrderSnapshot,
  };
}

export async function resolveRiderForPublish({
  request,
  cookies,
  forcedRiderId,
  existingMeta,
}: {
  request: Request;
  cookies: RouteCookies;
  forcedRiderId: string;
  existingMeta: DispatchMeta;
}): Promise<
  | { ok: true; selectedRiderId: string }
  | { ok: false; response: Response }
> {
  const ridersResult = await readAdminAssignableRidersOrResponse({
    request,
    cookies,
    apiBaseUrl: API_BASE_URL,
    coerce2xxTo502: true,
  });
  if (!ridersResult.ok) {
    return ridersResult;
  }

  const normalizedForcedRiderId = normalizeRiderId(forcedRiderId);
  const selected = resolveAdminRequestedRiderSelection({
    riderId: normalizedForcedRiderId,
    eligibleRiders: ridersResult.riders,
    allRiders: ridersResult.riders,
  });
  const selectedRiderId = normalizeRiderId((
    selected.kind === 'selected' ? selected.rider : ridersResult.riders[0]
  )?.id);

  if (selected.kind === 'missing') {
    return {
      ok: false,
      response: buildAdminSimpleErrorResponse('forced_rider_not_found', 400),
    };
  }

  return {
    ok: true,
    selectedRiderId: selectedRiderId || normalizeRiderId(existingMeta.currentRiderId),
  };
}
