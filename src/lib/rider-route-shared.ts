import type { AstroCookies } from 'astro';
import { proxyAdminRequest } from './admin-api-route.ts';
import { type AssignableRider, readOnlineRiders } from './rider-assignment.ts';
import { buildDispatchMetaRemarks, readDispatchMetaFromRemarks, type DispatchMeta } from './rider-dispatch.ts';

export interface RiderRouteOrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone: string;
}

export type AdminRidersReadResult =
  | { success: true; riders: AssignableRider[] }
  | { success: false; status: number; error: string; upstreamBody?: string };

export type AdminRidersReadFailure = Extract<AdminRidersReadResult, { success: false }>;

export function buildAdminRidersReadFailureResponse(
  result: AdminRidersReadFailure,
  options: { coerce2xxTo502?: boolean } = {},
): Response {
  const status = options.coerce2xxTo502 && result.status >= 200 && result.status < 300
    ? 502
    : result.status;

  return new Response(JSON.stringify({
    success: false,
    error: result.error,
    upstream_status: result.status,
    ...(result.upstreamBody ? { upstream_body: result.upstreamBody } : {}),
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildAdminJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildAdminSimpleErrorResponse(error: string, status: number): Response {
  return buildAdminJsonResponse({ success: false, error }, status);
}

export type AdminOrderReadResult =
  | {
    ok: true;
    found: boolean;
    order: Record<string, unknown> | null;
    remarksJson: string;
    rawText: string;
  }
  | {
    ok: false;
    status: number;
    upstreamBody: string;
  };

export type AdminDispatchMetaWriteResult =
  | { ok: true; remarksJson: string }
  | { ok: false; status: number; upstreamBody: string };

export type AdminOrderStatusUpdateResult =
  | { ok: true; status: number; bodyText: string; bodyJson: Record<string, unknown> }
  | { ok: false; status: number; bodyText: string; bodyJson: Record<string, unknown> };

export type AdminTelegramMessageRefPersistResult =
  | {
    ok: true;
    order: Record<string, unknown>;
    remarksJson: string;
  }
  | {
    ok: false;
    code: 'order_read_failed' | 'order_not_found' | 'remarks_write_failed';
    status?: number;
    upstreamBody?: string;
  };

export type AdminWarningShape = {
  code: string;
  upstream_status?: number;
  upstream_body?: string;
};

export function buildTelegramMessageRefPersistWarning(
  result: Extract<AdminTelegramMessageRefPersistResult, { ok: false }>,
  options: { remarksWriteFailedOnly?: boolean } = {},
): AdminWarningShape {
  const includeUpstream = !options.remarksWriteFailedOnly || result.code === 'remarks_write_failed';
  return {
    code: 'telegram_message_ref_persist_failed',
    ...(includeUpstream && typeof result.status === 'number' ? { upstream_status: result.status } : {}),
    ...(includeUpstream && result.upstreamBody ? { upstream_body: result.upstreamBody } : {}),
  };
}

export type AdminTelegramMessageRefPersistHandledResult = {
  warning?: AdminWarningShape;
  persisted?: Extract<AdminTelegramMessageRefPersistResult, { ok: true }>;
};

export async function persistAdminTelegramMessageRefHandled({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  messageRef,
  warningOptions,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  messageRef: NonNullable<DispatchMeta['telegramMessageRef']>;
  warningOptions?: { remarksWriteFailedOnly?: boolean };
}): Promise<AdminTelegramMessageRefPersistHandledResult> {
  const result = await persistAdminTelegramMessageRef({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    messageRef,
  });

  if (!result.ok) {
    return { warning: buildTelegramMessageRefPersistWarning(result, warningOptions) };
  }

  return { persisted: result };
}

export function buildAdminOrderFetchFailedResponse(
  result: Extract<AdminOrderReadResult, { ok: false }>,
  statusOverride?: number,
): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'order_fetch_failed',
    upstream_status: result.status,
    upstream_body: result.upstreamBody,
  }), {
    status: statusOverride ?? result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function readTelegramItemSummaryFromOrder(order: Record<string, unknown> | null | undefined): string[] {
  const raw = order?.itemsJson ?? order?.items_json ?? order?.items;
  if (!raw) return [];

  let items: unknown = raw;
  if (typeof raw === 'string') {
    try {
      items = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }

  const list = Array.isArray(items)
    ? items
    : (items && typeof items === 'object' ? Object.values(items as Record<string, unknown>) : []);

  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const row = item as Record<string, unknown>;
      const name = String(row.name || row.productName || '').trim();
      const subName = String(row.subName || '').trim();
      const quantity = Number(row.quantity || row.qty || 0);
      const price = Number(row.price || 0);
      const title = name && subName ? `${name} / ${subName}` : (name || subName);
      if (!title || !Number.isFinite(quantity) || quantity <= 0) return '';
      const priceLabel = Number.isFinite(price) && price > 0 ? ` · ${price} RSD` : '';
      return `${title} x${quantity}${priceLabel}`;
    })
    .filter(Boolean);
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

function hasRecognizableRiderList(payload: Record<string, unknown>): boolean {
  if (Array.isArray(payload.riders) || Array.isArray(payload.rows) || Array.isArray(payload.items)) {
    return true;
  }

  const data = payload.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

  const nested = data as Record<string, unknown>;
  return Array.isArray(nested.riders) || Array.isArray(nested.rows) || Array.isArray(nested.items);
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

function readOrderRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as Record<string, unknown>;
  const direct = pickMatchingOrderRow(root, '');
  if (direct) return [direct];

  const directOrders = Array.isArray(root.orders) ? root.orders : [];
  if (directOrders.length > 0) {
    return directOrders.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  const data = root.data;
  if (Array.isArray(data)) {
    return data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    const nestedDirect = pickMatchingOrderRow(nested, '');
    if (nestedDirect) return [nestedDirect];

    const nestedOrders = Array.isArray(nested.orders)
      ? nested.orders as unknown[]
      : [];
    if (nestedOrders.length > 0) {
      return nestedOrders.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
    }
  }

  return [];
}

export function findAdminOrderRow(payload: unknown, orderId: string): Record<string, unknown> | null {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) return null;
  return readOrderRows(payload).find((row) => readOrderId(row) === normalizedOrderId) || null;
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

export async function readAdminAssignableRiders({
  request,
  cookies,
  apiBaseUrl,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
}): Promise<AdminRidersReadResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/riders`,
    method: 'GET',
  });
  const text = await upstream.text();
  const parsed = readJsonObject(text);
  const payloadInvalid = !parsed || !hasRecognizableRiderList(parsed);

  if (!upstream.ok || payloadInvalid || parsed.success === false) {
    const error = typeof parsed?.error === 'string' && parsed.error.trim() ? parsed.error.trim() : 'riders_upstream_failed';
    return {
      success: false,
      status: upstream.status || 502,
      error,
      upstreamBody: text || undefined,
    };
  }

  return {
    success: true,
    riders: readOnlineRiders(parsed),
  };
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

  if (!upstream.ok || parsed == null) {
    return {
      ok: false,
      status: upstream.status || 502,
      upstreamBody: rawText,
    };
  }

  const order = findAdminOrderRow(parsed, orderId);
  return {
    ok: true,
    found: Boolean(order),
    order,
    remarksJson: order ? String(order.remarksJson || order.remarks_json || '').trim() : '',
    rawText,
  };
}

export async function writeAdminDispatchMetaRemarks({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  remarksJson,
  nextMeta,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  remarksJson: string;
  nextMeta: DispatchMeta;
}): Promise<AdminDispatchMetaWriteResult> {
  const nextRemarks = buildDispatchMetaRemarks(remarksJson, nextMeta);
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders/remarks`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      remarks: nextRemarks,
    }),
  });
  const text = await upstream.text();

  const payload = readJsonObject(text) || {};
  if (!upstream.ok || payload.success === false) {
    return {
      ok: false,
      status: upstream.status,
      upstreamBody: text || JSON.stringify(payload),
    };
  }

  return {
    ok: true,
    remarksJson: JSON.stringify(nextRemarks),
  };
}

export async function updateAdminOrderStatus({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  payload,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  payload: Record<string, unknown>;
}): Promise<AdminOrderStatusUpdateResult> {
  const upstream = await proxyAdminRequest({
    request,
    cookies,
    url: `${apiBaseUrl}/api/admin/orders/${encodeURIComponent(orderId)}/status`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const bodyText = await upstream.text();
  const bodyJson = readJsonObject(bodyText) || {};

  if (!upstream.ok || bodyJson.success === false) {
    return {
      ok: false,
      status: upstream.status || 502,
      bodyText,
      bodyJson,
    };
  }

  return {
    ok: true,
    status: upstream.status || 200,
    bodyText,
    bodyJson,
  };
}

export async function persistAdminTelegramMessageRef({
  request,
  cookies,
  apiBaseUrl,
  orderId,
  messageRef,
}: {
  request: Request;
  cookies: AstroCookies;
  apiBaseUrl: string;
  orderId: string;
  messageRef: NonNullable<DispatchMeta['telegramMessageRef']>;
}): Promise<AdminTelegramMessageRefPersistResult> {
  const latestOrderResult = await readAdminOrderById({
    request,
    cookies,
    apiBaseUrl,
    orderId,
  });

  if (!latestOrderResult.ok) {
    return {
      ok: false,
      code: 'order_read_failed',
      status: latestOrderResult.status,
      upstreamBody: latestOrderResult.upstreamBody,
    };
  }

  if (!latestOrderResult.found || !latestOrderResult.order) {
    return {
      ok: false,
      code: 'order_not_found',
    };
  }

  const nextMeta: DispatchMeta = {
    ...readDispatchMetaFromRemarks(latestOrderResult.remarksJson),
    telegramMessageRef: messageRef,
  };
  const remarksResult = await writeAdminDispatchMetaRemarks({
    request,
    cookies,
    apiBaseUrl,
    orderId,
    remarksJson: latestOrderResult.remarksJson,
    nextMeta,
  });

  if (!remarksResult.ok) {
    return {
      ok: false,
      code: 'remarks_write_failed',
      status: remarksResult.status,
      upstreamBody: remarksResult.upstreamBody,
    };
  }

  return {
    ok: true,
    order: latestOrderResult.order,
    remarksJson: remarksResult.remarksJson,
  };
}

export function buildAdminDispatchMetaWriteFailedResponse(
  result: Extract<AdminDispatchMetaWriteResult, { ok: false }>,
): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'dispatch_meta_write_failed',
    upstream_status: result.status,
    upstream_body: result.upstreamBody,
  }), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function buildAdminOrderUpdateFailedResponse(result: {
  status: number;
  bodyText: string;
  bodyJson: Record<string, unknown>;
},
statusOverride?: number,
): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'order_update_failed',
    upstream_status: result.status,
    upstream_body: result.bodyText || JSON.stringify(result.bodyJson),
  }), {
    status: statusOverride ?? result.status,
    headers: { 'Content-Type': 'application/json' },
  });
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
