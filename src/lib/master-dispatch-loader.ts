type ShopSummary = {
  id?: number;
  name?: string;
};
import {
  buildMasterDispatchPageView,
  sanitizeDispatchOrder,
  sanitizeDispatchPool,
  type MasterDispatchPageView,
  type MasterDispatchPayload,
} from './master-dispatch-view.ts';
export { buildMasterDispatchPageView } from './master-dispatch-view.ts';
export type { MasterDispatchPageView, MasterDispatchPayload } from './master-dispatch-view.ts';

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
