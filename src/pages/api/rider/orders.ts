import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const q = url.search || '';
  const res = await fetch(`${API_BASE_URL}/api/rider/orders${q}`, {
    method: 'GET',
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
};
