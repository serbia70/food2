import type { APIRoute } from 'astro';
import { createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { createGuestSessionPayload } from '../../../application/auth/load-session-query.ts';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete('admin_token', { path: '/' });

  return new Response(JSON.stringify(createApiSuccess(createGuestSessionPayload())), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
