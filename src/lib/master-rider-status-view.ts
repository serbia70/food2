import {
  normalizeGroup,
  toSummaryNumber,
  type MasterRiderStatusCardView,
  type MasterRiderStatusOrderView,
} from './master-rider-status-view-helpers.ts';

type MasterRiderStatusCardInput = {
  rider_id?: unknown;
  name?: unknown;
  phone?: unknown;
  status?: unknown;
  active_order_count?: unknown;
  cod_order_count?: unknown;
  delivery_fee_total?: unknown;
  cod_amount_total?: unknown;
  orders?: unknown;
};

type MasterRiderStatusSummaryInput = {
  total_riders?: unknown;
  available_riders?: unknown;
  busy_riders?: unknown;
  offline_riders?: unknown;
  active_order_count?: unknown;
  cod_order_count?: unknown;
  delivery_fee_total?: unknown;
  cod_amount_total?: unknown;
};

export type MasterRiderStatusViewInput = {
  summary?: MasterRiderStatusSummaryInput;
  groups?: {
    available?: MasterRiderStatusCardInput[];
    busy?: MasterRiderStatusCardInput[];
    offline?: MasterRiderStatusCardInput[];
  };
};

export type { MasterRiderStatusOrderView, MasterRiderStatusCardView } from './master-rider-status-view-helpers.ts';

export type MasterRiderStatusView = {
  summary: {
    totalRiders: number;
    availableRiders: number;
    busyRiders: number;
    offlineRiders: number;
    activeOrderCount: number;
    codOrderCount: number;
    deliveryFeeTotal: number;
    codAmountTotal: number;
  };
  groups: {
    available: MasterRiderStatusCardView[];
    busy: MasterRiderStatusCardView[];
    offline: MasterRiderStatusCardView[];
  };
};

export function buildMasterRiderStatusView(input: MasterRiderStatusViewInput): MasterRiderStatusView {
  return {
    summary: {
      totalRiders: toSummaryNumber(input?.summary?.total_riders),
      availableRiders: toSummaryNumber(input?.summary?.available_riders),
      busyRiders: toSummaryNumber(input?.summary?.busy_riders),
      offlineRiders: toSummaryNumber(input?.summary?.offline_riders),
      activeOrderCount: toSummaryNumber(input?.summary?.active_order_count),
      codOrderCount: toSummaryNumber(input?.summary?.cod_order_count),
      deliveryFeeTotal: toSummaryNumber(input?.summary?.delivery_fee_total),
      codAmountTotal: toSummaryNumber(input?.summary?.cod_amount_total),
    },
    groups: {
      available: normalizeGroup('available', input?.groups?.available),
      busy: normalizeGroup('busy', input?.groups?.busy),
      offline: normalizeGroup('offline', input?.groups?.offline),
    },
  };
}
