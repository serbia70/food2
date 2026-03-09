import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
// TODO: 移除代理层业务修补，待后端稳定输出订单 items_json 后删除。

export const prerender = false;

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
  const q = url.search || '';

  const res = await fetch(`${API_BASE_URL}/api/admin/orders${q}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  const ct = res.headers.get('content-type') || 'application/json';
  const raw = await res.text();

  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return new Response(raw, {
      status: res.status,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  }

  if (Array.isArray(data)) {
    data = data.map((order: any) => {
      if (!order || typeof order.items_json !== 'string') return order;
      try {
        const parsed = JSON.parse(order.items_json);
        if (Array.isArray(parsed)) return order;
        if (parsed && typeof parsed === 'object') {
          const arr = Object.entries(parsed as Record<string, any>).map(([key, value]) => {
            const item = value && typeof value === 'object' ? { ...value } : {};
            const pid = Number(key);
            if (item.product_id == null) item.product_id = Number.isNaN(pid) ? item.id || 0 : pid;
            if (item.quantity == null) item.quantity = item.qty || 1;
            return item;
          });
          return { ...order, items_json: JSON.stringify(arr) };
        }
      } catch {
        return order;
      }
      return order;
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
};
