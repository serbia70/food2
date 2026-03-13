import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { proxyFetch } from '../../../lib/api-proxy';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const senderPhone =
    url.searchParams.get('sender_phone') || url.searchParams.get('user_phone') || '';
  if (!senderPhone) {
    return new Response(JSON.stringify({ success: false, error: 'sender_phone required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const upstream = `${API_BASE_URL}/api/user/chat?sender_phone=${encodeURIComponent(senderPhone)}`;
  
  try {
    const res = await fetch(upstream);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Backend unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  
  const upstream = `${API_BASE_URL}/api/user/chat`;
  
  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Backend unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
