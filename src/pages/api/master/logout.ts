import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  const secure = import.meta.env.PROD || new URL(request.url).protocol === 'https:';

  // Explicitly expire cookie with the same attributes as login.
  cookies.set('master_token', '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 0,
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
