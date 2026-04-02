type ShopSummary = {
  id?: number;
  name?: string;
};

type MasterDispatchOrderSummary = {
  id?: number;
  orderNo?: string;
  shopId?: number;
  shopName?: string;
  status?: string;
  dispatch?: {
    status?: string;
    dispatchRound?: number;
    currentPoolIndex?: number;
    lastDispatchedRiderID?: number;
    nextEscalateAt?: string;
  };
};

type MasterDispatchPoolSummary = {
  shopId?: number;
  shopName?: string;
  poolCount?: number;
  availableCount?: number;
  busyCount?: number;
  offlineCount?: number;
};

export type MasterDispatchPayload = {
  awaiting: MasterDispatchOrderSummary[];
  delivering: MasterDispatchOrderSummary[];
  pools: MasterDispatchPoolSummary[];
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

export type MasterDispatchPageView = {
  awaiting: Array<{
    id?: number;
    orderNo: string;
    shopId: number;
    shopName: string;
    status: string;
    dispatchStatus: string;
    dispatchRound: number;
    lastDispatchedRiderId: string;
  }>;
  delivering: Array<{
    id?: number;
    orderNo: string;
    shopId: number;
    shopName: string;
    status: string;
    lastDispatchedRiderId: string;
  }>;
  pools: Array<{
    shopId: number;
    shopName: string;
    poolCount: number;
    availableCount: number;
    busyCount: number;
    offlineCount: number;
  }>;
};

const EMPTY_MASTER_DISPATCH_PAYLOAD: MasterDispatchPayload = {
  awaiting: [],
  delivering: [],
  pools: [],
};

function normalizeDispatchOrder(order: MasterDispatchOrderSummary): Record<string, unknown> {
  const dispatch = order?.dispatch && typeof order.dispatch === 'object' ? order.dispatch : undefined;
  const orderNo = String(order?.orderNo || '').trim();
  const shopId = Number(order?.shopId || 0) || 0;
  const shopName = String(order?.shopName || '').trim();
  const dispatchStatus = String(dispatch?.status || '').trim();
  const hasDispatchRound = dispatch?.dispatchRound !== undefined;
  const dispatchRound = Number(dispatch?.dispatchRound ?? 0) || 0;
  const hasCurrentPoolIndex = dispatch?.currentPoolIndex !== undefined;
  const currentPoolIndex = Number(dispatch?.currentPoolIndex ?? 0) || 0;
  const hasLastDispatchedRiderId = dispatch?.lastDispatchedRiderID !== undefined;
  const lastDispatchedRiderId = Number(dispatch?.lastDispatchedRiderID ?? 0) || 0;
  const nextEscalateAt = String(dispatch?.nextEscalateAt || '').trim();

  return {
    ...(typeof order?.id === 'number' ? { id: order.id } : {}),
    ...(orderNo ? { order_no: orderNo } : {}),
    ...(shopId ? { shop_id: shopId } : {}),
    ...(shopName ? { shop_name: shopName } : {}),
    ...(typeof order?.status === 'string' && order.status ? { status: order.status } : {}),
    ...(dispatchStatus ? { dispatch_status: dispatchStatus } : {}),
    ...(hasDispatchRound ? { dispatch_round: dispatchRound } : {}),
    ...(hasCurrentPoolIndex ? { current_pool_index: currentPoolIndex } : {}),
    ...(hasLastDispatchedRiderId ? { last_dispatched_rider_id: lastDispatchedRiderId } : {}),
    ...(nextEscalateAt ? { next_escalate_at: nextEscalateAt } : {}),
  };
}

function normalizeDispatchPool(pool: MasterDispatchPoolSummary): Record<string, unknown> {
  const shopId = Number(pool?.shopId || 0) || 0;
  const shopName = String(pool?.shopName || '').trim();
  const hasPoolCount = pool?.poolCount !== undefined;
  const poolCount = Number(pool?.poolCount ?? 0) || 0;
  const hasAvailableCount = pool?.availableCount !== undefined;
  const availableCount = Number(pool?.availableCount ?? 0) || 0;
  const hasBusyCount = pool?.busyCount !== undefined;
  const busyCount = Number(pool?.busyCount ?? 0) || 0;
  const hasOfflineCount = pool?.offlineCount !== undefined;
  const offlineCount = Number(pool?.offlineCount ?? 0) || 0;

  return {
    ...(shopId ? { shop_id: shopId } : {}),
    ...(shopName ? { shop_name: shopName } : {}),
    ...(hasPoolCount ? { pool_count: poolCount } : {}),
    ...(hasAvailableCount ? { available_count: availableCount } : {}),
    ...(hasBusyCount ? { busy_count: busyCount } : {}),
    ...(hasOfflineCount ? { offline_count: offlineCount } : {}),
  };
}

async function fetchDispatchProxyWithRetry(url: URL, init: RequestInit, attempts = 2): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const contentType = String(response.headers.get('content-type') || '');
      const shouldRetry = attempt < attempts - 1
        && response.status >= 500
        && !contentType.includes('application/json');
      if (!shouldRetry) return response;
      lastResponse = response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('dispatch_fetch_failed');
}

export function buildMasterDispatchPageView(payload: MasterDispatchPayload): MasterDispatchPageView {
  return {
    awaiting: payload.awaiting.map((order) => ({
      id: order.id,
      orderNo: String(order.order_no || order.id || '-'),
      shopId: Number(order.shop_id || 0) || 0,
      shopName: String(order.shop_name || '').trim(),
      status: String(order.status || '').trim(),
      dispatchStatus: String(order.dispatch_status || 'idle').trim() || 'idle',
      dispatchRound: Number(order.dispatch_round || 0) || 0,
      lastDispatchedRiderId: String(order.last_dispatched_rider_id || ''),
    })),
    delivering: payload.delivering.map((order) => ({
      id: order.id,
      orderNo: String(order.order_no || order.id || '-'),
      shopId: Number(order.shop_id || 0) || 0,
      shopName: String(order.shop_name || '').trim(),
      status: String(order.status || 'delivering').trim() || 'delivering',
      lastDispatchedRiderId: String(order.last_dispatched_rider_id || '-'),
    })),
    pools: payload.pools.map((pool) => ({
      shopId: Number(pool.shop_id || 0) || 0,
      shopName: String(pool.shop_name || '').trim(),
      poolCount: Number(pool.pool_count || 0) || 0,
      availableCount: Number(pool.available_count || 0) || 0,
      busyCount: Number(pool.busy_count || 0) || 0,
      offlineCount: Number(pool.offline_count || 0) || 0,
    })),
  };
}

export async function loadMasterDispatchData({
  requestUrl,
  authHeader,
  cookieHeader,
  shopRows: _shopRows,
}: LoadMasterDispatchDataInput): Promise<LoadMasterDispatchDataResult> {
  try {
    const dispatchUrl = new URL('/api/master/dispatch', requestUrl);
    const res = await fetchDispatchProxyWithRetry(dispatchUrl, {
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

    const data = await res.json().catch(() => null);
    const isCanonicalEnvelope = !!data && typeof data === 'object' && 'ok' in data && data.ok === true;
    const dispatchData = isCanonicalEnvelope && 'data' in data && data.data && typeof data.data === 'object'
      ? data.data
      : null;
    const payload: MasterDispatchPayload = {
      awaiting: Array.isArray(dispatchData?.awaiting) ? dispatchData.awaiting.map((order) => normalizeDispatchOrder(order)) : [],
      delivering: Array.isArray(dispatchData?.delivering) ? dispatchData.delivering.map((order) => normalizeDispatchOrder(order)) : [],
      pools: Array.isArray(dispatchData?.pools) ? dispatchData.pools.map((pool) => normalizeDispatchPool(pool)) : [],
    };

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
