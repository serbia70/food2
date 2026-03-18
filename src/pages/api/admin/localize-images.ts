import type { APIRoute } from 'astro';
import { readAdminAuth } from '../../../lib/admin-api-route';
import { handleLocalizeImagesBatchRequest } from './localize-images-batch.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const authHeader = readAdminAuth(request, cookies);

  return handleLocalizeImagesBatchRequest({
    request,
    authHeader,
    fetchImpl: fetch,
  });
};
