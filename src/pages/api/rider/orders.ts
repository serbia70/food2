import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { filterRiderDashboardOrders } from '../../../lib/rider-dispatch.ts';

const apiBaseUrl = process.env.PUBLIC_API_URL || API_BASE_URL;

export const prerender = false;

function normalizeRiderOrder(order: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...order };
  if (order.orderNo === undefined && order.order_no !== undefined) normalized.orderNo = order.order_no;
  if (order.shopName === undefined && order.shop_name !== undefined) normalized.shopName = order.shop_name;
  if (order.tableInfo === undefined && order.table_info !== undefined) normalized.tableInfo = order.table_info;
  if (order.userPhone === undefined && order.user_phone !== undefined) normalized.userPhone = order.user_phone;
  if (order.createdAt === undefined && order.created_at !== undefined) normalized.createdAt = order.created_at;
  if (order.totalAmount === undefined && order.total_amount !== undefined) normalized.totalAmount = order.total_amount;
  if (order.itemsJson === undefined && order.items_json !== undefined) normalized.itemsJson = order.items_json;
  if (order.courierPhone === undefined && order.courier_phone !== undefined) normalized.courierPhone = order.courier_phone;
  if (order.pickupEtaMinutes === undefined && order.pickup_eta_minutes !== undefined) normalized.pickupEtaMinutes = order.pickup_eta_minutes;
  delete normalized.order_no;
  delete normalized.shop_name;
  delete normalized.table_info;
  delete normalized.user_phone;
  delete normalized.created_at;
  delete normalized.total_amount;
  delete normalized.items_json;
  delete normalized.courier_phone;
  delete normalized.pickup_eta_minutes;
  return normalized;
}

export const GET: APIRoute = async ({ url }) => {
  const q = url.search || '';
  const view = String(url.searchParams.get('view') || 'active').trim();
  const riderPhone = String(url.searchParams.get('phone') || '').trim();

  const res = await fetch(`${apiBaseUrl}/api/rider/orders${q}`, {
    method: 'GET',
  });

  const text = await res.text();
  const contentType = res.headers.get('content-type') || 'application/json';

  if (!contentType.includes('application/json')) {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  }

  try {
    const data = JSON.parse(text) as { success?: boolean; orders?: Array<Record<string, unknown>> };
    if (data.success && Array.isArray(data.orders)) {
      data.orders = filterRiderDashboardOrders(
        data.orders.map((order) => normalizeRiderOrder(order)),
        riderPhone,
        view === 'history' ? 'history' : 'active',
        new Date().toISOString(),
      );
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  }
};
