export type MasterRiderStatusValue = 'available' | 'busy' | 'offline';
export type MasterRiderStatusLabel = '空闲' | '送餐中' | '下班';

type MasterRiderStatusOrderInput = {
  order_id?: unknown;
  order_no?: unknown;
  shop_id?: unknown;
  shop_name?: unknown;
  status?: unknown;
  accepted_at?: unknown;
  completed_at?: unknown;
  is_cash_on_delivery?: unknown;
  order_amount?: unknown;
  delivery_fee?: unknown;
  cash_to_collect?: unknown;
};

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

export type MasterRiderStatusOrderView = {
  id: string;
  orderNo: string;
  shopName: string;
  status: string;
  acceptedAt: string;
  completedAt: string;
  orderAmount: number;
  deliveryFee: number;
  cashToCollect: number;
  cashTagLabel: '代收' | '非代收';
};

export type MasterRiderStatusCardView = {
  id: string;
  name: string;
  phone: string;
  status: MasterRiderStatusValue;
  statusLabel: MasterRiderStatusLabel;
  activeOrderCount: number;
  codOrderCount: number;
  deliveryFeeTotal: number;
  codAmountTotal: number;
  orders: MasterRiderStatusOrderView[];
};

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function getStatusLabel(status: MasterRiderStatusValue): MasterRiderStatusLabel {
  if (status === 'busy') return '送餐中';
  if (status === 'offline') return '下班';
  return '空闲';
}

export function normalizeOrders(orders: MasterRiderStatusOrderInput[] = []): MasterRiderStatusOrderView[] {
  return orders.map((order) => ({
    id: String(order?.order_id ?? ''),
    orderNo: String(order?.order_no ?? '-'),
    shopName: String(order?.shop_name ?? `店铺 #${toNumber(order?.shop_id)}`),
    status: String(order?.status ?? '-'),
    acceptedAt: String(order?.accepted_at ?? ''),
    completedAt: String(order?.completed_at ?? ''),
    orderAmount: toNumber(order?.order_amount),
    deliveryFee: toNumber(order?.delivery_fee),
    cashToCollect: toNumber(order?.cash_to_collect),
    cashTagLabel: order?.is_cash_on_delivery ? '代收' : '非代收',
  }));
}

export function normalizeGroup(status: MasterRiderStatusValue, rows: MasterRiderStatusCardInput[] = []): MasterRiderStatusCardView[] {
  return rows.map((row) => ({
    id: String(row?.rider_id ?? ''),
    name: String(row?.name ?? '未命名骑手'),
    phone: String(row?.phone ?? '-'),
    status,
    statusLabel: getStatusLabel(status),
    activeOrderCount: toNumber(row?.active_order_count),
    codOrderCount: toNumber(row?.cod_order_count),
    deliveryFeeTotal: toNumber(row?.delivery_fee_total),
    codAmountTotal: toNumber(row?.cod_amount_total),
    orders: normalizeOrders(Array.isArray(row?.orders) ? row.orders as MasterRiderStatusOrderInput[] : []),
  }));
}

export function toSummaryNumber(value: unknown): number {
  return toNumber(value);
}
