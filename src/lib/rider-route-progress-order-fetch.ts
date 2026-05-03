import { findAdminOrderRow, parseJsonValue } from './rider-route-admin-orders.ts';
import { buildForwardHeaders, readJsonObject } from './rider-route-admin-telegram-core.ts';

export interface RiderRouteOrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone: string;
}

function readOrderSnapshotRow(row: Record<string, unknown> | null | undefined): RiderRouteOrderSnapshot {
  if (!row || typeof row !== 'object') return { status: '', remarksJson: '', courierPhone: '' };
  return {
    status: String(row.status || '').trim(),
    remarksJson: String(row.remarksJson || row.remarks_json || '').trim(),
    courierPhone: String(row.courierPhone || row.courier_phone || '').trim(),
  };
}

async function readOrderDetailFromRiderOrders(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone: string,
): Promise<Record<string, unknown> | null> {
  const phone = String(riderPhone || '').trim();
  if (!phone) return null;

  const upstream = await fetch(`${apiBaseUrl}/api/rider/orders?phone=${encodeURIComponent(phone)}&view=active`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;

  const parsed = readJsonObject(text);
  const rows = Array.isArray(parsed?.orders) ? parsed.orders : [];
  const matched = rows.find((row) => String((row as Record<string, unknown>)?.id || '').trim() === orderId);
  return matched && typeof matched === 'object' ? matched as Record<string, unknown> : null;
}

export async function readOrderDetail(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone = '',
): Promise<Record<string, unknown> | null> {
  const upstream = await fetch(`${apiBaseUrl}/api/admin/orders`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (upstream.ok && text) {
    const matched = findAdminOrderRow(parseJsonValue(text), orderId);
    if (matched) return matched;
  }

  return readOrderDetailFromRiderOrders(request, apiBaseUrl, orderId, riderPhone);
}

export async function readOrderDispatchSnapshot(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone = '',
): Promise<RiderRouteOrderSnapshot> {
  return readOrderSnapshotRow(await readOrderDetail(request, apiBaseUrl, orderId, riderPhone));
}

export async function writeOrderDispatchRemarks(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  remarksJson: string,
): Promise<boolean> {
  const parsedRemarks = parseJsonValue(remarksJson);
  const remarks = Array.isArray(parsedRemarks) ? parsedRemarks : [];
  const upstream = await fetch(`${apiBaseUrl}/api/admin/orders/remarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      orderId,
      remarks,
    }),
  });
  const text = await upstream.text();
  const payload = readJsonObject(text) || {};
  return upstream.ok && payload.success !== false;
}
