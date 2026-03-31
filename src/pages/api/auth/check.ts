import type { APIContext } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { createApiError, createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { createGuestSessionPayload, createSessionPayload } from '../../../application/auth/load-session-query.ts';
import { parseJsonEnvelope } from '../../../infra/http/http-json-client.ts';

export const GET = async ({ cookies }: APIContext) => {
  const token = cookies.get('admin_token')?.value;

  if (!token) {
    return new Response(JSON.stringify(createApiSuccess(createGuestSessionPayload())), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(`${API_BASE_URL}/api/admin/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify(createApiSuccess(createGuestSessionPayload())), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await parseJsonEnvelope<Record<string, unknown>>(upstream);
    const shopIdRaw = data.shop_id;
    const userId = typeof shopIdRaw === 'number' ? shopIdRaw : Number.parseInt(String(shopIdRaw || ''), 10);

    return new Response(
      JSON.stringify(createApiSuccess(createSessionPayload({
        kind: 'admin',
        token,
        userId: Number.isFinite(userId) ? userId : undefined,
      }))),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch {
    return new Response(
      JSON.stringify(createApiError('backend_unavailable', 'Backend unavailable')),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
