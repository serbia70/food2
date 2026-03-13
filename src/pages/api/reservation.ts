import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw = await request.json();
    const slug = String(raw?.restaurantId || '').trim();
    if (!slug) {
      return new Response(JSON.stringify({ success: false, error: 'restaurantId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      guest_count: Number(raw?.guest_count || 0),
      reservation_time: String(raw?.reservation_time || ''),
      customer_phone: String(raw?.customer_phone || ''),
      dine_type: 'dine_in',
      delivery_address: null,
      customer_name: raw?.customer_name || null,
      items: raw?.items || null,
      remarks: raw?.remarks || null,
    };

    const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(slug)}/reservation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, error: data.error || 'create reservation failed' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, ...data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const msg = e?.message || 'proxy failed';
    return new Response(JSON.stringify({ success: false, error: `backend unavailable: ${msg}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
