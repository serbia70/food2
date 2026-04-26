import type { AstroCookies } from 'astro';
import { proxyAdminRequest } from './admin-api-route.ts';

export type AdminOrderReadResult =
  | {
    ok: true;
    order: Record<string, unknown> | null;
    remarksJson: string;
  }
  | {
    ok: false;
    status: number;
    upstreamBody: string;
  };

export function parseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function hasRecognizableOrderReadFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  if (record.success === false || record.ok === false) return true;

  const data = record.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

  const nested = data as Record<string, unknown>;
  return nested.success === false || nested.ok === false;
}

function readOrderId(row: Record<string, unknown>): string {
  return String(row.id || row.orderId || row.order_id || '').trim();
}

function pickMatchingOrderRow(row: unknown, orderId: string): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const normalizedOrderId = String(orderId || '').trim();
  const rowId = readOrderId(record);
  if (normalizedOrderId) return rowId === normalizedOrderId ? record : null;
  return rowId ? record : null;
}

function readOrderRowsFromRecord(record: Record<string, unknown>): Record<string, unknown>[] {
  const direct = pickMatchingOrderRow(record, '');
  if (direct) return [direct];

  const directOrder = pickMatchingOrderRow(record.order, '');
  if (directOrder) return [directOrder];

  const directOrders = Array.isArray(record.orders) ? record.orders : [];
  if (directOrders.length > 0) {
    return directOrders.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  return [];
}

function readOrderRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as Record<string, unknown>;
  const rootRows = readOrderRowsFromRecord(root);
  if (rootRows.length > 0) return rootRows;

  const data = root.data;
  if (Array.isArray(data)) {
    return data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    return readOrderRowsFromRecord(nested);
  }

  return [];
}

export function findAdminOrderRow(payload: unknown, orderId: string): Record<string, unknown> | null {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) return null;
  return readOrderRows(payload).find((row) => readOrderId(row) === normalizedOrderId) || null;
}

export async function readAdminOrderById({
  request,
  cookies,
  apiBaseUrl,
  orderId,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
}): Promise<AdminOrderReadResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders`,
    method: 'GET',
  });
  const rawText = await upstream.text();
  const parsed = parseJsonValue(rawText);

  if (!upstream.ok || parsed == null || hasRecognizableOrderReadFailure(parsed)) {
    const status = upstream.ok ? 502 : (upstream.status || 502);
    return {
      ok: false,
      status,
      upstreamBody: rawText,
    };
  }

  const order = findAdminOrderRow(parsed, orderId);
  return {
    ok: true,
    order,
    remarksJson: order ? String(order.remarksJson || order.remarks_json || '').trim() : '',
  };
}
