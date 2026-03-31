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
  authHeader: string;
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
  if (!payload || typeof payload !== 'object') return [];
  const envelope = payload as { ok?: unknown; data?: unknown };
  if (envelope.ok !== true || !envelope.data || typeof envelope.data !== 'object') return [];
  const data = envelope.data as { riders?: unknown };
  return Array.isArray(data.riders) ? (data.riders as RiderSummary[]) : [];
}

function normalizeStatus(status: unknown): RiderStatus {
  const value = String(status || '').trim();
  if (value === 'available' || value === 'busy') return value;
  return 'offline';
}

function buildRiderDedupKey(rider: RiderSummary): string {
  const riderId = String(rider?.id ?? '').trim();
  if (riderId) return `id:${riderId}`;
  return `fallback:${String(rider?.name ?? '').trim()}::${String(rider?.phone ?? '').trim()}`;
}

export async function loadMasterRiderStatusData({
  authHeader,
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
  const seenRiders = new Set<string>();

  try {
    for (const shop of shopRows) {
      const shopId = Number(shop?.id || 0);
      if (!shopId) continue;

      const impersonateRes = await fetch(`${API_BASE_URL}/api/master/impersonate-shop`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: shopId }),
      });
      const impersonateData = await impersonateRes.json().catch(() => ({}));
      const isCanonicalImpersonate = impersonateData && typeof impersonateData === 'object' && (impersonateData as { ok?: unknown }).ok === true;
      const impersonatePayload = isCanonicalImpersonate && 'data' in (impersonateData as Record<string, unknown>)
        ? (impersonateData as { data?: unknown }).data
        : null;
      const hasImpersonated = impersonatePayload && typeof impersonatePayload === 'object'
        && typeof (impersonatePayload as { slug?: unknown }).slug === 'string'
        && String((impersonatePayload as { slug?: unknown }).slug || '').trim()
        && (impersonatePayload as { impersonated?: unknown }).impersonated === true;
      if (!impersonateRes.ok || !hasImpersonated) continue;

      const ridersRes = await fetch(`${API_BASE_URL}/api/admin/riders`, {
        method: 'GET',
        headers: { Authorization: authHeader },
      });
      const ridersData = await ridersRes.json().catch(() => ({}));
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
