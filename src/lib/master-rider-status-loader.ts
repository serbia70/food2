import { API_BASE_URL } from '../config.ts';

type ShopSummary = {
  id?: unknown;
  name?: unknown;
};

type RiderStatus = 'available' | 'busy' | 'offline';

type RiderSummary = {
  id?: unknown;
  name?: unknown;
  phone?: unknown;
  status?: RiderStatus | string;
};


type MasterRiderStatusPayload = {
  summary: {
    total_riders: number;
    available_riders: number;
    busy_riders: number;
    offline_riders: number;
    active_order_count: number;
    cod_order_count: number;
    delivery_fee_total: number;
    cod_amount_total: number;
  };
  groups: {
    available: RiderSummary[];
    busy: RiderSummary[];
    offline: RiderSummary[];
  };
};

export type LoadMasterRiderStatusDataInput = {
  requestUrl: URL;
  authHeader: string;
  cookieHeader?: string;
  shopRows: ShopSummary[];
};

export type LoadMasterRiderStatusDataResult = {
  payload: MasterRiderStatusPayload;
  error: string;
};

const EMPTY_MASTER_RIDER_STATUS_PAYLOAD: MasterRiderStatusPayload = {
  summary: {
    total_riders: 0,
    available_riders: 0,
    busy_riders: 0,
    offline_riders: 0,
    active_order_count: 0,
    cod_order_count: 0,
    delivery_fee_total: 0,
    cod_amount_total: 0,
  },
  groups: {
    available: [],
    busy: [],
    offline: [],
  },
};

function normalizeRiderRows(payload: unknown): RiderSummary[] {
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

function normalizeStatus(status: unknown): RiderStatus {
  const value = String(status || '').trim();
  if (value === 'available' || value === 'busy') return value;
  return 'offline';
}

function buildRiderDedupKey(rider: RiderSummary): string {
  const riderId = String(rider?.id ?? '').trim();
  if (riderId) return `id:${riderId}`;
  const riderName = String(rider?.name ?? '').trim();
  const riderPhone = String(rider?.phone ?? '').trim();
  if (riderName || riderPhone) return `fallback:${riderName}::${riderPhone}`;
  return `ephemeral:${crypto.randomUUID()}`;
}

async function fetchJsonWithRetry(url: string | URL, init: RequestInit, attempts = 2): Promise<{ res: Response; data: unknown }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (res.ok || attempt === attempts - 1) {
        return { res, data };
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('fetch_failed');
}

async function findFirstAdminAuthHeader(
  shopRows: ShopSummary[],
  requestUrl: URL,
  authHeader: string,
): Promise<string> {
  for (const shop of shopRows) {
    const shopId = Number(shop?.id || 0);
    if (!shopId) continue;

    try {
      const impersonateUrl = new URL(`/api/master/impersonate-shop?id=${encodeURIComponent(String(shopId))}`, requestUrl);
      const { res: impersonateRes, data: impersonateData } = await fetchJsonWithRetry(impersonateUrl, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
        },
      });
      const impersonateRecord = impersonateData as {
        ok?: unknown;
        data?: unknown;
      };
      const nestedImpersonate = impersonateRecord.data && typeof impersonateRecord.data === 'object'
        ? (impersonateRecord.data as { token?: unknown; slug?: unknown; impersonated?: unknown })
        : null;
      const adminToken = String(nestedImpersonate?.token ?? '').trim();
      const isCanonicalImpersonate = impersonateRecord.ok === true
        && nestedImpersonate?.impersonated === true
        && String(nestedImpersonate?.slug ?? '').trim().length > 0
        && adminToken.length > 0;
      if (!impersonateRes.ok || !isCanonicalImpersonate) continue;
      return adminToken.startsWith('Bearer ') ? adminToken : `Bearer ${adminToken}`;
    } catch {
      continue;
    }
  }

  return '';
}

export async function loadMasterRiderStatusData({
  requestUrl,
  authHeader,
  cookieHeader,
  shopRows,
}: LoadMasterRiderStatusDataInput): Promise<LoadMasterRiderStatusDataResult> {
  if (!authHeader) {
    return {
      payload: EMPTY_MASTER_RIDER_STATUS_PAYLOAD,
      error: '',
    };
  }

  const groups: MasterRiderStatusPayload['groups'] = {
    available: [],
    busy: [],
    offline: [],
  };

  try {
    const adminAuthHeader = await findFirstAdminAuthHeader(shopRows, requestUrl, authHeader);
    if (!adminAuthHeader) {
      return {
        payload: EMPTY_MASTER_RIDER_STATUS_PAYLOAD,
        error: '',
      };
    }

    const ridersProxyUrl = new URL('/api/admin/riders', requestUrl);
    const { res: ridersRes, data: ridersData } = await fetchJsonWithRetry(ridersProxyUrl, {
      method: 'GET',
      headers: {
        Authorization: adminAuthHeader,
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });
    if (!ridersRes.ok) {
      return {
        payload: EMPTY_MASTER_RIDER_STATUS_PAYLOAD,
        error: '',
      };
    }

    const seenRiders = new Set<string>();
    for (const rider of normalizeRiderRows(ridersData)) {
      const dedupKey = buildRiderDedupKey(rider);
      if (seenRiders.has(dedupKey)) continue;
      seenRiders.add(dedupKey);
      groups[normalizeStatus(rider?.status)].push(rider);
    }

    return {
      payload: {
        summary: {
          total_riders: groups.available.length + groups.busy.length + groups.offline.length,
          available_riders: groups.available.length,
          busy_riders: groups.busy.length,
          offline_riders: groups.offline.length,
          active_order_count: 0,
          cod_order_count: 0,
          delivery_fee_total: 0,
          cod_amount_total: 0,
        },
        groups,
      },
      error: '',
    };
  } catch (error) {
    return {
      payload: EMPTY_MASTER_RIDER_STATUS_PAYLOAD,
      error: error instanceof Error ? error.message : '骑手状态加载失败',
    };
  }
}
