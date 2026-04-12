export interface RiderRouteOrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone: string;
}

export function readJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function parseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function readOrderRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as Record<string, unknown>;
  const directOrders = Array.isArray(root.orders) ? root.orders : [];
  if (directOrders.length > 0) {
    return directOrders.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  const data = root.data;
  if (data && typeof data === 'object') {
    const nestedOrders = Array.isArray((data as Record<string, unknown>).orders)
      ? (data as Record<string, unknown>).orders as unknown[]
      : [];
    return nestedOrders.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  return [];
}

function readOrderSnapshotRow(row: Record<string, unknown> | null | undefined): RiderRouteOrderSnapshot {
  if (!row || typeof row !== 'object') return { status: '', remarksJson: '', courierPhone: '' };
  return {
    status: String(row.status || '').trim(),
    remarksJson: String(row.remarksJson || row.remarks_json || '').trim(),
    courierPhone: String(row.courierPhone || row.courier_phone || '').trim(),
  };
}

export function buildForwardHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie') || '';
  const authorization = request.headers.get('authorization') || '';
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  return headers;
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
    const matched = readOrderRows(parseJsonValue(text)).find((row) => String(row.id || '').trim() === orderId);
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
  nextRemarksJson: string,
): Promise<boolean> {
  const parsedRemarks = parseJsonValue(nextRemarksJson);
  if (!Array.isArray(parsedRemarks)) return false;

  const remarks = parsedRemarks.map((item) => String(item || '')).filter(Boolean);
  const upstream = await fetch(`${apiBaseUrl}/api/admin/orders/remarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({ orderId, remarks }),
  });
  return upstream.ok;
}

export function buildUpstreamFailureResponse(
  upstream: Response,
  text: string,
  fallbackBody: Record<string, unknown>,
): Response {
  return new Response(text || JSON.stringify(fallbackBody), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}
