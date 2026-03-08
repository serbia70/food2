import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config';

export const prerender = false;

interface OrderProxyRequest {
  restaurantId?: string;
  items?: unknown[] | Record<string, unknown>;
  dineInAction?: string;
  dine_in_action?: string;
  type?: string;
  info?: string;
  total?: number;
  note?: string;
  user?: {
    phone?: string;
  };
}

interface CreateOrderBackendResponse {
  order_id?: number;
  order_no?: string;
  error?: string;
  [key: string]: unknown;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw = (await request.json()) as OrderProxyRequest;
    const slug = String(raw?.restaurantId || '').trim();
    if (!slug) {
      return new Response(JSON.stringify({ success: false, error: 'restaurantId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const itemsObj = raw?.items || {};
    const items = Array.isArray(itemsObj) ? itemsObj : Object.values(itemsObj);
    const dineInAction = String(raw?.dineInAction || raw?.dine_in_action || '').trim().toLowerCase();
    const isDineIn = raw?.type !== 'delivery';
    const payload = {
      table_info: String(raw?.info || ''),
      order_type: isDineIn ? 'dine_in' : 'delivery',
      total_amount: Number(raw?.total || 0),
      items,
      remarks: String(raw?.note || ''),
      user_phone: String(raw?.user?.phone || ''),
      dine_in_action: isDineIn ? dineInAction : '',
      merge: isDineIn && dineInAction === 'add',
      checkout_existing: isDineIn && dineInAction === 'new',
    };

    const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(slug)}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: CreateOrderBackendResponse = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (res.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          orderId: data.order_id,
          orderNo: data.order_no,
          ...data,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ success: false, error: data.error || 'create order failed' }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'proxy failed';
    return new Response(JSON.stringify({ success: false, error: `backend unavailable: ${msg}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
