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

type CanonicalImpersonateResponse = {
  ok?: unknown;
  data?: {
    slug?: unknown;
    impersonated?: unknown;
  };
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

function extractSetCookieValues(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    return getSetCookie.call(headers).filter((value) => value.trim());
  }

  const combined = headers.get('set-cookie') || '';
  return combined ? [combined] : [];
}

function mergeCookieHeaders(baseCookieHeader: string, responseHeaders: Headers): string {
  const merged = new Map<string, string>();

  for (const chunk of baseCookieHeader.split(';')) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;
    merged.set(key, value);
  }

  for (const setCookieValue of extractSetCookieValues(responseHeaders)) {
    const firstSegment = setCookieValue.split(';', 1)[0]?.trim() || '';
    const separatorIndex = firstSegment.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = firstSegment.slice(0, separatorIndex).trim();
    const value = firstSegment.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;
    merged.set(key, value);
  }

  return Array.from(merged.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
}

function isCanonicalImpersonateSuccess(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as CanonicalImpersonateResponse;
  const data = record.data && typeof record.data === 'object' ? record.data : null;
  return record.ok === true
    && data?.impersonated === true
    && String(data?.slug ?? '').trim().length > 0;
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

async function buildAdminCookieHeaderForShop(
  shopId: number,
  requestUrl: URL,
  authHeader: string,
  cookieHeader: string,
): Promise<string> {
  try {
    const impersonateUrl = new URL('/api/master/impersonate-shop', requestUrl);
    const { res: impersonateRes, data: impersonateData } = await fetchJsonWithRetry(impersonateUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({ id: shopId }),
    });
    if (!impersonateRes.ok || !isCanonicalImpersonateSuccess(impersonateData)) return '';
    const mergedCookieHeader = mergeCookieHeaders(cookieHeader, impersonateRes.headers);
    return mergedCookieHeader.includes('admin_token=') ? mergedCookieHeader : '';
  } catch {
    return '';
  }
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
    const seenRiders = new Set<string>();

    for (const shop of shopRows) {
      const shopId = Number(shop?.id || 0);
      if (!shopId) continue;

      const adminCookieHeader = await buildAdminCookieHeaderForShop(shopId, requestUrl, authHeader, cookieHeader || '');
      if (!adminCookieHeader) continue;

      const ridersProxyUrl = new URL('/api/admin/riders', requestUrl);
      const { res: ridersRes, data: ridersData } = await fetchJsonWithRetry(ridersProxyUrl, {
        method: 'GET',
        headers: {
          cookie: adminCookieHeader,
        },
      });
      if (!ridersRes.ok) continue;

      for (const rider of normalizeRiderRows(ridersData)) {
        const dedupKey = buildRiderDedupKey(rider);
        if (seenRiders.has(dedupKey)) continue;
        seenRiders.add(dedupKey);
        groups[normalizeStatus(rider?.status)].push(rider);
      }
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
