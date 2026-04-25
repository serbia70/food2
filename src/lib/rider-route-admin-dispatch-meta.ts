import type { APIRoute } from 'astro';
import { API_BASE_URL, DISPATCH_AUTO_REASSIGN_MINUTES } from '../config.ts';
import { type AssignableRider } from './rider-assignment.ts';
import { type DispatchMeta } from './rider-dispatch.ts';
import { buildAdminSimpleErrorResponse } from './rider-route-admin-http.ts';
import {
  readAdminAssignableRidersOrResponse,
  resolveAdminRequestedRiderSelection,
  writeAdminDispatchMetaRemarks,
} from './rider-route-admin-state.ts';

export interface DispatchOrderSnapshot {
  id: number | string;
  shopSlug?: string | null;
  shopId?: number | string | null;
  shopName?: string | null;
  shopAddress?: string | null;
  shopMapUrl?: string | null;
  tableInfo?: string | null;
  deliveryAddress?: string | null;
  deliveryMapUrl?: string | null;
  totalAmount?: number | string | null;
  pickupEtaMinutes?: number | string | null;
  userPhone?: string | null;
  status?: string | null;
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  riderRemindCount?: number | string | null;
  riderLastRemindedAt?: string | null;
  remarksJson?: string | null;
}

export type RouteCookies = Parameters<APIRoute['POST']>[0]['cookies'];

export function normalizeOrderId(orderId: unknown): string {
  return String(orderId || '').trim();
}

export function normalizeRiderId(value: unknown): string {
  return String(value || '').trim();
}

export function readDispatchOrderFromBody(payload: Record<string, unknown>, orderId: string): DispatchOrderSnapshot | null {
  const directOrder = payload.order && typeof payload.order === 'object'
    ? payload.order as DispatchOrderSnapshot
    : null;
  if (directOrder && normalizeOrderId(directOrder.id) === orderId) return directOrder;

  const shopSlug = String(payload.shopSlug || '').trim();
  const shopId = String(payload.shopId || '').trim();
  const shopName = String(payload.shopName || '').trim();
  const shopAddress = String(payload.shopAddress || '').trim();
  const shopMapUrl = String(payload.shopMapUrl || '').trim();
  const tableInfo = String(payload.tableInfo || '').trim();
  const deliveryAddress = String(payload.deliveryAddress || '').trim();
  const deliveryMapUrl = String(payload.deliveryMapUrl || '').trim();
  const totalAmount = String(payload.totalAmount || '').trim();
  const userPhone = String(payload.userPhone || '').trim();
  const status = String(payload.status || '').trim();
  const hasSnapshotFields = !!(shopSlug || shopId || shopName || shopAddress || shopMapUrl || tableInfo || deliveryAddress || deliveryMapUrl || totalAmount || userPhone);
  if (!hasSnapshotFields) return null;

  return {
    id: orderId,
    shopSlug: shopSlug || undefined,
    shopId: shopId || undefined,
    shopName: shopName || undefined,
    shopAddress: shopAddress || undefined,
    shopMapUrl: shopMapUrl || undefined,
    tableInfo: tableInfo || undefined,
    deliveryAddress: deliveryAddress || undefined,
    deliveryMapUrl: deliveryMapUrl || undefined,
    totalAmount: totalAmount || undefined,
    userPhone: userPhone || undefined,
    status: status || undefined,
    pickupEtaMinutes: payload.pickupEtaMinutes != null ? String(payload.pickupEtaMinutes) : undefined,
    pickupReadyAt: String(payload.pickupReadyAt || '').trim() || undefined,
    riderBroadcastedAt: String(payload.riderBroadcastedAt || '').trim() || undefined,
    riderRemindCount: payload.riderRemindCount != null ? String(payload.riderRemindCount) : undefined,
    riderLastRemindedAt: String(payload.riderLastRemindedAt || '').trim() || undefined,
  };
}

export function appendInvalidatedRiderIds(existing: string[], riderId: string): string[] {
  const filtered = existing.filter(Boolean);
  const next = riderId ? [...filtered, riderId] : filtered;
  return Array.from(new Set(next));
}

export function buildNextDispatchMetaForPublish({
  existingMeta,
  forcedRiderId,
  selectedRiderId,
  nowIso,
}: {
  existingMeta: DispatchMeta;
  forcedRiderId: string;
  selectedRiderId: string;
  nowIso: string;
}): DispatchMeta {
  const prevCurrentRiderId = normalizeRiderId(existingMeta.currentRiderId);
  const isReassigned = !!forcedRiderId && !!prevCurrentRiderId && prevCurrentRiderId !== selectedRiderId;
  const baseTs = Date.parse(nowIso);
  const assignedAt = Number.isFinite(baseTs) ? new Date(baseTs).toISOString() : new Date().toISOString();
  const expiresAt = new Date(Date.parse(assignedAt) + DISPATCH_AUTO_REASSIGN_MINUTES * 60_000).toISOString();

  return {
    ...existingMeta,
    currentRiderId: selectedRiderId,
    currentAssignedAt: assignedAt,
    currentExpiresAt: expiresAt,
    invalidatedRiderIds: isReassigned
      ? appendInvalidatedRiderIds(existingMeta.invalidatedRiderIds, prevCurrentRiderId)
      : existingMeta.invalidatedRiderIds,
    lastInvalidationReason: isReassigned ? 'reassigned' : existingMeta.lastInvalidationReason,
  };
}

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
