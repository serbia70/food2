import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response('Not Found', { status: 404 });
  }

  const safeSlug = encodeURIComponent(slug);
  const manifest = {
    id: `/${safeSlug}`,
    name: `MeituanGo - ${slug}`,
    short_name: `Shop ${slug}`,
    description: `MeituanGo 店铺 ${slug}`,
    start_url: `/${safeSlug}`,
    scope: `/${safeSlug}`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f5f5f5',
    theme_color: '#1e8f44',
    icons: [
      {
        src: '/icons/admin-icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/admin-icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
