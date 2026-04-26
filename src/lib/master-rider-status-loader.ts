import {
  buildRiderDedupKey,
  normalizeRiderRows,
  normalizeStatus,
  type RiderStatus,
  type RiderSummary,
} from './master-rider-status-filters.ts';
import { buildAdminCookieHeaderForShop, fetchJsonWithRetry } from './master-rider-status-session.ts';

type ShopSummary = {
  id?: unknown;
  name?: unknown;
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
