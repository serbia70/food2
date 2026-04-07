import type { Rider } from '../types/index.ts';

export type AssignableRider = Pick<Rider, 'id' | 'name' | 'phone' | 'status' | 'telegramChatId'> & {
  telegram_chat_id?: string;
};

function readRiderRows(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) return input.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  if (!input || typeof input !== 'object') return [];

  const data = input as {
    riders?: unknown;
    data?: unknown;
    rows?: unknown;
    items?: unknown;
  };

  if (Array.isArray(data.riders)) return readRiderRows(data.riders);
  if (Array.isArray(data.rows)) return readRiderRows(data.rows);
  if (Array.isArray(data.items)) return readRiderRows(data.items);

  if (data.data && typeof data.data === 'object') {
    const nested = data.data as { riders?: unknown; rows?: unknown; items?: unknown };
    if (Array.isArray(nested.riders)) return readRiderRows(nested.riders);
    if (Array.isArray(nested.rows)) return readRiderRows(nested.rows);
    if (Array.isArray(nested.items)) return readRiderRows(nested.items);
  }

  return [];
}

export function readOnlineRiders(input: unknown): AssignableRider[] {
  return readRiderRows(input)
    .map((row) => ({
      id: row.id as AssignableRider['id'],
      name: String(row.name || '').trim(),
      phone: String(row.phone || '').trim(),
      status: String(row.status || '').trim() as AssignableRider['status'],
      ...(typeof row.telegramChatId === 'string' ? { telegramChatId: row.telegramChatId } : {}),
      ...(typeof row.telegram_chat_id === 'string' ? { telegram_chat_id: row.telegram_chat_id } : {}),
    }))
    .filter((row) => row.status === 'available' && row.phone)
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
}

export function pickNextAvailableRider({
  riders,
  lastAssignedRiderId,
  excludedRiderIds = [],
}: {
  riders: AssignableRider[];
  lastAssignedRiderId: string;
  excludedRiderIds?: Array<string | number>;
}): AssignableRider | null {
  if (!Array.isArray(riders) || riders.length === 0) return null;

  const excluded = new Set(excludedRiderIds.map((id) => String(id ?? '').trim()).filter(Boolean));
  const availableRiders = riders.filter((rider) => !excluded.has(String(rider.id || '').trim()));
  if (availableRiders.length === 0) return null;

  const currentRiderId = String(lastAssignedRiderId || '').trim();
  const currentIndex = availableRiders.findIndex((row) => String(row.id || '').trim() === currentRiderId);
  if (currentIndex === -1) return availableRiders[0] || null;
  if (availableRiders.length === 1) return null;
  return availableRiders[(currentIndex + 1) % availableRiders.length] || null;
}

export function buildAssignedOrderStatusPayload({
  rider,
  pickupEtaMinutes,
}: {
  rider: AssignableRider;
  pickupEtaMinutes?: number;
}) {
  const riderName = String(rider?.name || '').trim();
  const riderPhone = String(rider?.phone || '').trim();

  const etaMinutes = Number.isFinite(Number(pickupEtaMinutes)) ? Number(pickupEtaMinutes) : 0;

  return {
    status: 'awaiting_courier',
    courierName: riderName,
    courierPhone: riderPhone,
    courier_name: riderName,
    courier_phone: riderPhone,
    pickupEtaMinutes: etaMinutes,
    pickup_eta_minutes: etaMinutes,
  };
}
