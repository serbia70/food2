import { API_BASE_URL } from '../config.ts';

type ShopSummary = {
  id?: number;
  name?: string;
};

type MasterDispatchOrderSummary = {
  id?: number;
  order_no?: string;
  shop_id?: number;
  shop_name?: string;
  status?: string;
  dispatch_status?: string;
  dispatch_round?: number;
  current_pool_index?: number;
  last_dispatched_rider_id?: number;
  next_escalate_at?: string;
};

type MasterDispatchPoolSummary = {
  shop_id?: number;
  shop_name?: string;
  pool_count?: number;
  available_count?: number;
  busy_count?: number;
  offline_count?: number;
};

type MasterDispatchPayload = {
  awaiting: MasterDispatchOrderSummary[];
  delivering: MasterDispatchOrderSummary[];
  pools: MasterDispatchPoolSummary[];
};

type RiderStatus = 'available' | 'busy' | 'offline';

type RiderSummary = {
  status?: RiderStatus | string;
};

export type LoadMasterDispatchDataInput = {
  requestUrl: URL;
  authHeader: string;
  cookieHeader: string;
  shopRows: ShopSummary[];
};

export type LoadMasterDispatchDataResult = {
  payload: MasterDispatchPayload;
  error: string;
};

const EMPTY_MASTER_DISPATCH_PAYLOAD: MasterDispatchPayload = {
  awaiting: [],
  delivering: [],
  pools: [],
};

async function loadDispatchPoolFallback(authHeader: string, shopRows: ShopSummary[]): Promise<MasterDispatchPoolSummary[]> {
  const pools: MasterDispatchPoolSummary[] = [];
  for (const shop of shopRows) {
    const shopId = Number(shop?.id || 0);
    if (!shopId) continue;

    try {
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
      const riders = ridersData && typeof ridersData === 'object' && (ridersData as { ok?: unknown }).ok === true
        && (ridersData as { data?: unknown }).data
        && typeof (ridersData as { data?: unknown }).data === 'object'
        && Array.isArray(((ridersData as { data?: { riders?: unknown } }).data?.riders))
        ? (((ridersData as { data?: { riders?: unknown } }).data?.riders) as RiderSummary[])
        : [];
      if (!ridersRes.ok || riders.length === 0) continue;

      pools.push({
        shop_id: shopId,
        shop_name: String(shop?.name || '').trim() || `店铺 #${shopId}`,
        pool_count: riders.length,
        available_count: riders.filter((rider) => String(rider?.status || '').trim() === 'available').length,
        busy_count: riders.filter((rider) => String(rider?.status || '').trim() === 'busy').length,
        offline_count: riders.filter((rider) => {
          const status = String(rider?.status || '').trim();
          return !status || status === 'offline';
        }).length,
      });
    } catch {
      continue;
    }
  }
  return pools;
}

export async function loadMasterDispatchData({
  requestUrl,
  authHeader,
  cookieHeader,
  shopRows,
}: LoadMasterDispatchDataInput): Promise<LoadMasterDispatchDataResult> {
  try {
    const dispatchUrl = new URL('/api/master/dispatch', requestUrl);
    const res = await fetch(dispatchUrl, {
      method: 'GET',
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });

    if (!res.ok) {
      return {
        payload: EMPTY_MASTER_DISPATCH_PAYLOAD,
        error: `调度数据加载失败 (${res.status})`,
      };
    }

    const data = await res.json().catch(() => ({}));
    const payload: MasterDispatchPayload = {
      awaiting: Array.isArray(data?.awaiting) ? data.awaiting : [],
      delivering: Array.isArray(data?.delivering) ? data.delivering : [],
      pools: Array.isArray(data?.pools) ? data.pools : [],
    };

    if (payload.pools.length === 0 && authHeader) {
      payload.pools = await loadDispatchPoolFallback(authHeader, shopRows);
    }

    return {
      payload,
      error: '',
    };
  } catch (error) {
    return {
      payload: EMPTY_MASTER_DISPATCH_PAYLOAD,
      error: error instanceof Error ? error.message : '调度数据加载失败',
    };
  }
}
