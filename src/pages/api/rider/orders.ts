import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { filterRiderDashboardOrders } from '../../../lib/rider-dispatch.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const q = url.search || '';
  const view = String(url.searchParams.get('view') || 'active').trim();
  const riderPhone = String(url.searchParams.get('phone') || '').trim();

  const res = await fetch(`${API_BASE_URL}/api/rider/orders${q}`, {
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
        data.orders,
        riderPhone,
        view === 'history' ? 'history' : 'active',
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
