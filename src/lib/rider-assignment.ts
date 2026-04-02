import type { Rider } from '../types/index.ts';

export type AssignableRider = Pick<Rider, 'id' | 'name' | 'phone' | 'status' | 'telegramChatId'> & {
  telegram_chat_id?: string;
};

export function readOnlineRiders(input: unknown): AssignableRider[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
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
}: {
  riders: AssignableRider[];
  lastAssignedRiderId: string;
}): AssignableRider | null {
  if (!Array.isArray(riders) || riders.length === 0) return null;

  const currentIndex = riders.findIndex((row) => String(row.id || '').trim() === String(lastAssignedRiderId || '').trim());
  if (currentIndex === -1) return riders[0] || null;
  return riders[(currentIndex + 1) % riders.length] || null;
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

  return {
    status: 'delivering',
    courierName: riderName,
    courierPhone: riderPhone,
    courier_name: riderName,
    courier_phone: riderPhone,
    pickupEtaMinutes: Number.isFinite(Number(pickupEtaMinutes)) ? Number(pickupEtaMinutes) : 0,
  };
}
