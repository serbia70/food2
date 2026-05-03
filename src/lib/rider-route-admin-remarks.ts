import type { AstroCookies } from 'astro';
import {
  buildDispatchMetaRemarks,
  readDispatchMetaFromRemarks,
  type DispatchMeta,
} from './rider-dispatch.ts';
import { type AdminOrderReadResult, readAdminOrderById } from './rider-route-admin-orders.ts';
import { proxyAdminRequest } from './admin-api-route.ts';
import { readJsonObject } from './rider-route-admin-telegram-core.ts';

export type AdminDispatchMetaWriteResult =
  | { ok: true; remarksJson: string }
  | { ok: false; status: number; upstreamBody: string };

export type AdminTelegramMessageRefPersistResult =
  | {
    ok: true;
    order: Record<string, unknown>;
    remarksJson: string;
  }
  | {
    ok: false;
    code: 'order_read_failed' | 'order_not_found' | 'remarks_write_failed';
  };

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
  const latestOrderResult: AdminOrderReadResult = await readAdminOrderById({
    request,
    cookies,
    apiBaseUrl,
    orderId,
  });

  if (!latestOrderResult.ok) {
    return {
      ok: false,
      code: 'order_read_failed',
    };
  }

  if (!latestOrderResult.order) {
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
    };
  }

  return {
    ok: true,
    order: latestOrderResult.order,
    remarksJson: remarksResult.remarksJson,
  };
}
