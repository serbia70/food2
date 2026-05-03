import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyFetch } from '../../../lib/api-proxy.ts';

export const prerender = false;

export const GET: APIRoute = async () => {
  return proxyFetch(`${API_BASE_URL}/api/home`, { method: 'GET' });
};
