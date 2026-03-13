import type { APIRoute } from 'astro';
import { handleLocalizeImagesBatchRequest } from './localize-images-batch.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const authHeader = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');

  return handleLocalizeImagesBatchRequest({
    request,
    authHeader,
    fetchImpl: fetch,
  });
};
