import type { APIRoute } from 'astro';
import { buildRiderTelegramBindToken } from '../../../../lib/telegram-rider-bind.ts';

export const prerender = false;

function readTelegramBindSecret(): string {
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
  return String(env.TELEGRAM_BIND_SECRET || process.env.TELEGRAM_BIND_SECRET || '').trim();
}

function readTelegramBotName(): string {
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
  return String(env.TELEGRAM_BOT_NAME || process.env.TELEGRAM_BOT_NAME || '').trim();
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const riderId = Number(body.riderId || 0);
  const riderPhone = String(body.riderPhone || '').trim();
  if (riderId <= 0 || !riderPhone) {
    return new Response(JSON.stringify({ success: false, error: 'rider_session_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const secret = readTelegramBindSecret();
  const botName = readTelegramBotName();
  if (!secret || !botName) {
    return new Response(JSON.stringify({ success: false, error: 'telegram_bind_not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const token = buildRiderTelegramBindToken({ riderId, riderPhone, expiresAt }, secret);
  const startParam = encodeURIComponent(`bind_${token}`);
  const bindUrl = `https://t.me/${botName}?start=${startParam}`;
  const tgBindUrl = `tg://resolve?domain=${encodeURIComponent(botName)}&start=${startParam}`;

  return new Response(JSON.stringify({ success: true, bind_url: bindUrl, tg_bind_url: tgBindUrl, expires_at: expiresAt }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
