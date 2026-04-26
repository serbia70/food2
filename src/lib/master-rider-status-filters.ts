export type RiderStatus = 'available' | 'busy' | 'offline';

export type RiderSummary = {
  id?: unknown;
  name?: unknown;
  phone?: unknown;
  status?: RiderStatus | string;
};

type CanonicalImpersonateResponse = {
  ok?: unknown;
  data?: {
    slug?: unknown;
    impersonated?: unknown;
  };
};

export function normalizeRiderRows(payload: unknown): RiderSummary[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is RiderSummary => !!row && typeof row === 'object' && !Array.isArray(row));
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as {
    success?: unknown;
    riders?: unknown;
    rows?: unknown;
    items?: unknown;
    ok?: unknown;
    data?: unknown;
  };
  const canonicalData = record.data && typeof record.data === 'object'
    ? record.data as { riders?: unknown; rows?: unknown; items?: unknown }
    : null;
  const riders = record.success === true
    ? (record.riders ?? record.rows ?? record.items)
    : record.ok === true
      ? (canonicalData?.riders ?? canonicalData?.rows ?? canonicalData?.items)
      : (record.riders ?? record.rows ?? record.items ?? canonicalData?.riders ?? canonicalData?.rows ?? canonicalData?.items);
  if (!Array.isArray(riders)) return [];
  return riders.filter((row): row is RiderSummary => !!row && typeof row === 'object' && !Array.isArray(row));
}

export function normalizeStatus(status: unknown): RiderStatus {
  const value = String(status || '').trim();
  if (value === 'available' || value === 'busy') return value;
  return 'offline';
}

export function buildRiderDedupKey(rider: RiderSummary): string {
  const riderId = String(rider?.id ?? '').trim();
  if (riderId) return `id:${riderId}`;
  const riderName = String(rider?.name ?? '').trim();
  const riderPhone = String(rider?.phone ?? '').trim();
  if (riderName || riderPhone) return `fallback:${riderName}::${riderPhone}`;
  return `ephemeral:${crypto.randomUUID()}`;
}

export function isCanonicalImpersonateSuccess(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as CanonicalImpersonateResponse;
  const data = record.data && typeof record.data === 'object' ? record.data : null;
  return record.ok === true
    && data?.impersonated === true
    && String(data?.slug ?? '').trim().length > 0;
}
