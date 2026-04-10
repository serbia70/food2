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
    lastDispatchedRiderId?: number;
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

function sanitizeDispatchOrder(order: MasterDispatchOrderSummary): MasterDispatchOrderSummary {
  const dispatch = order?.dispatch && typeof order.dispatch === 'object' ? order.dispatch : undefined;

  return {
    ...(typeof order?.id === 'number' ? { id: order.id } : {}),
    ...(String(order?.orderNo || '').trim() ? { orderNo: String(order.orderNo).trim() } : {}),
    ...(Number(order?.shopId || 0) ? { shopId: Number(order.shopId) } : {}),
    ...(String(order?.shopName || '').trim() ? { shopName: String(order.shopName).trim() } : {}),
    ...(String(order?.status || '').trim() ? { status: String(order.status).trim() } : {}),
    ...(dispatch
      ? {
          dispatch: {
            ...(String(dispatch.status || '').trim() ? { status: String(dispatch.status).trim() } : {}),
            ...(dispatch.dispatchRound !== undefined ? { dispatchRound: Number(dispatch.dispatchRound ?? 0) || 0 } : {}),
            ...(dispatch.currentPoolIndex !== undefined ? { currentPoolIndex: Number(dispatch.currentPoolIndex ?? 0) || 0 } : {}),
            ...(dispatch.lastDispatchedRiderId !== undefined ? { lastDispatchedRiderId: Number(dispatch.lastDispatchedRiderId ?? 0) || 0 } : {}),
            ...(String(dispatch.nextEscalateAt || '').trim() ? { nextEscalateAt: String(dispatch.nextEscalateAt).trim() } : {}),
          },
        }
      : {}),
  };
}

function sanitizeDispatchPool(pool: MasterDispatchPoolSummary): MasterDispatchPoolSummary {
  return {
    ...(Number(pool?.shopId || 0) ? { shopId: Number(pool.shopId) } : {}),
    ...(String(pool?.shopName || '').trim() ? { shopName: String(pool.shopName).trim() } : {}),
    ...(pool?.poolCount !== undefined ? { poolCount: Number(pool.poolCount ?? 0) || 0 } : {}),
    ...(pool?.availableCount !== undefined ? { availableCount: Number(pool.availableCount ?? 0) || 0 } : {}),
    ...(pool?.busyCount !== undefined ? { busyCount: Number(pool.busyCount ?? 0) || 0 } : {}),
    ...(pool?.offlineCount !== undefined ? { offlineCount: Number(pool.offlineCount ?? 0) || 0 } : {}),
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
      orderNo: String(order.orderNo || order.id || '-'),
      shopId: Number(order.shopId || 0) || 0,
      shopName: String(order.shopName || '').trim(),
      status: String(order.status || '').trim(),
      dispatchStatus: String(order.dispatch?.status || 'idle').trim() || 'idle',
      dispatchRound: Number(order.dispatch?.dispatchRound || 0) || 0,
      lastDispatchedRiderId: String(order.dispatch?.lastDispatchedRiderId || ''),
    })),
    delivering: payload.delivering.map((order) => ({
      id: order.id,
      orderNo: String(order.orderNo || order.id || '-'),
      shopId: Number(order.shopId || 0) || 0,
      shopName: String(order.shopName || '').trim(),
      status: String(order.status || 'delivering').trim() || 'delivering',
      lastDispatchedRiderId: String(order.dispatch?.lastDispatchedRiderId || '-'),
    })),
    pools: payload.pools.map((pool) => ({
      shopId: Number(pool.shopId || 0) || 0,
      shopName: String(pool.shopName || '').trim(),
      poolCount: Number(pool.poolCount || 0) || 0,
      availableCount: Number(pool.availableCount || 0) || 0,
      busyCount: Number(pool.busyCount || 0) || 0,
      offlineCount: Number(pool.offlineCount || 0) || 0,
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
      awaiting: Array.isArray(dispatchData?.awaiting) ? dispatchData.awaiting.map((order) => sanitizeDispatchOrder(order)) : [],
      delivering: Array.isArray(dispatchData?.delivering) ? dispatchData.delivering.map((order) => sanitizeDispatchOrder(order)) : [],
      pools: Array.isArray(dispatchData?.pools) ? dispatchData.pools.map((pool) => sanitizeDispatchPool(pool)) : [],
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
