import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { buildRiderOrderView, filterRiderDashboardOrders } from '../../../lib/rider-dispatch.ts';

const apiBaseUrl = process.env.PUBLIC_API_URL || API_BASE_URL;

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const upstreamParams = new URLSearchParams(url.searchParams);
  upstreamParams.delete('view');
  const upstreamQuery = upstreamParams.toString();
  const view = String(url.searchParams.get('view') || 'active').trim();
  const riderPhone = String(url.searchParams.get('phone') || '').trim();

  const res = await fetch(`${apiBaseUrl}/api/rider/orders${upstreamQuery ? `?${upstreamQuery}` : ''}`, {
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
    const data = JSON.parse(text) as { success?: boolean; rider?: Record<string, unknown>; orders?: Array<Record<string, unknown>> };
    if (data.success && Array.isArray(data.orders)) {
      const normalizedView = view === 'pool' || view === 'active' || view === 'history' ? view : 'dashboard';
      data.orders = filterRiderDashboardOrders(
        data.orders,
        riderPhone,
        normalizedView,
        new Date().toISOString(),
      ).map((order) => ({
        ...order,
        riderView: buildRiderOrderView(order),
      }));
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
