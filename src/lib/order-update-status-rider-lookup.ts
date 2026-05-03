import { readOnlineRiders } from './rider-assignment.ts';
import { buildForwardHeaders, readJsonObject } from './rider-route-admin-telegram-core.ts';

export type RiderLookupRow = {
  id?: string | number;
  phone?: string;
  telegramChatId?: string;
  telegram_chat_id?: string;
};

export async function readMatchedAvailableRider(
  request: Request,
  apiBaseUrl: string,
  riderPhone: string,
  riderIdText: string,
): Promise<RiderLookupRow | null> {
  const upstream = await fetch(`${apiBaseUrl}/api/rider/status?action=list_available`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;

  const riders = readOnlineRiders(readJsonObject(text));
  return riders.find((row) => String(row.phone || '').trim() === riderPhone)
    || riders.find((row) => String(row.id || '').trim() === riderIdText)
    || null;
}

export async function readRiderByPhone(
  request: Request,
  apiBaseUrl: string,
  riderPhone: string,
): Promise<RiderLookupRow | null> {
  const phone = String(riderPhone || '').trim();
  if (!phone) return null;

  const upstream = await fetch(`${apiBaseUrl}/api/rider/status?phone=${encodeURIComponent(phone)}`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;

  const root = readJsonObject(text);
  const rider = root?.rider && typeof root.rider === 'object' ? root.rider as Record<string, unknown> : null;
  if (!rider) return null;

  return {
    id: typeof rider.id === 'string' || typeof rider.id === 'number' ? rider.id : undefined,
    phone: String(rider.phone || '').trim() || undefined,
    telegramChatId: String(rider.telegramChatId || '').trim() || undefined,
    telegram_chat_id: String(rider.telegram_chat_id || '').trim() || undefined,
  };
}
