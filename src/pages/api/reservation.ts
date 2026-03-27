import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config.ts';

export const prerender = false;

type ReservationSettings = {
  reservation_enabled?: number | string | boolean | null;
  subscription_enabled?: number | string | boolean | null;
};

type ShopInfo = {
  settings?: string | ReservationSettings | null;
  reservation_enabled?: number | string | boolean | null;
  enableReservation?: number | string | boolean | null;
  enable_reservation?: number | string | boolean | null;
};

function parseSettings(raw: ShopInfo['settings']): ReservationSettings {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as ReservationSettings : {};
  } catch {
    return {};
  }
}

function isReservationEnabled(shop: ShopInfo): boolean {
  const settings = parseSettings(shop.settings);
  const flag =
    shop.reservation_enabled ??
    settings.reservation_enabled ??
    shop.enableReservation ??
    shop.enable_reservation ??
    settings.subscription_enabled ??
    1;
  return !(flag === 0 || flag === '0' || flag === false || flag === 'false');
}

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

    let infoRes: Response;
    try {
      infoRes = await fetch(`${API_BASE_URL}/${encodeURIComponent(slug)}/info`);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'shop info unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!infoRes.ok) {
      return new Response(JSON.stringify({ success: false, error: 'shop info unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let shop: ShopInfo = {};
    try {
      shop = await infoRes.json();
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'shop info unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!isReservationEnabled(shop)) {
      return new Response(JSON.stringify({ success: false, error: 'reservation disabled' }), {
        status: 403,
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
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'proxy failed';
    return new Response(JSON.stringify({ success: false, error: `backend unavailable: ${msg}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
