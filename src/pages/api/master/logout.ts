import type { APIRoute } from 'astro';
import { createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { createGuestSessionPayload } from '../../../application/auth/load-session-query.ts';

export const prerender = false;

const isProd = Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);

export const POST: APIRoute = async ({ cookies, request }) => {
  const secure = isProd || new URL(request.url).protocol === 'https:';

  cookies.set('master_token', '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 0,
  });

  return new Response(JSON.stringify(createApiSuccess(createGuestSessionPayload())), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
