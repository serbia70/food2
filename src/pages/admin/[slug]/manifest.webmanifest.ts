import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response('Not Found', { status: 404 });
  }

  const safeSlug = encodeURIComponent(slug);
  const manifest = {
    id: `/admin/${safeSlug}`,
    name: `MeituanGo Admin - ${slug}`,
    short_name: `Admin ${slug}`,
    description: `MeituanGo 商家后台 ${slug}`,
    start_url: `/admin/${safeSlug}`,
    scope: `/admin/${safeSlug}`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f5f7fb',
    theme_color: '#0b3b60',
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
