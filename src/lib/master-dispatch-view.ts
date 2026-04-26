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

export function sanitizeDispatchOrder(order: MasterDispatchOrderSummary): MasterDispatchOrderSummary {
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

export function sanitizeDispatchPool(pool: MasterDispatchPoolSummary): MasterDispatchPoolSummary {
  return {
    ...(Number(pool?.shopId || 0) ? { shopId: Number(pool.shopId) } : {}),
    ...(String(pool?.shopName || '').trim() ? { shopName: String(pool.shopName).trim() } : {}),
    ...(pool?.poolCount !== undefined ? { poolCount: Number(pool.poolCount ?? 0) || 0 } : {}),
    ...(pool?.availableCount !== undefined ? { availableCount: Number(pool.availableCount ?? 0) || 0 } : {}),
    ...(pool?.busyCount !== undefined ? { busyCount: Number(pool.busyCount ?? 0) || 0 } : {}),
    ...(pool?.offlineCount !== undefined ? { offlineCount: Number(pool.offlineCount ?? 0) || 0 } : {}),
  };
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
