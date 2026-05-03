import type { APIRoute } from 'astro';
import { forwardOrderUpdateStatus } from '../update_status.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  return forwardOrderUpdateStatus(request, String(params.id || '').trim());
};
