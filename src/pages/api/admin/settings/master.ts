import type { APIRoute } from 'astro';

export const prerender = false;

function notFound() {
  return new Response('Not Found', { status: 404 });
}

export const GET: APIRoute = async () => {
  return notFound();
};

export const POST: APIRoute = async () => {
  return notFound();
};
