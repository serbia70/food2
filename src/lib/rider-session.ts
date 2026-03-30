import type { Rider } from '../types/index.ts';

export const RIDER_STATUSES = ['offline', 'available', 'busy'] as const;
export type RiderStatus = typeof RIDER_STATUSES[number];

export function isRiderStatus(value: unknown): value is RiderStatus {
  return typeof value === 'string' && (RIDER_STATUSES as readonly string[]).includes(value);
}

export type RiderSession = Pick<Rider, 'id' | 'name' | 'phone' | 'status' | 'telegram_chat_id'>;

export function normalizeRiderSession(input: Record<string, unknown>): RiderSession {
  const status = isRiderStatus(input.status) ? input.status : 'offline';
  const rawChatId = typeof input.telegram_chat_id === 'string' ? input.telegram_chat_id.trim() : '';

  return {
    id: typeof input.id === 'number' && Number.isFinite(input.id) && input.id > 0 ? input.id : 0,
    name: typeof input.name === 'string' ? input.name.trim() : '',
    phone: typeof input.phone === 'string' ? input.phone.trim() : '',
    status,
    telegram_chat_id: rawChatId.length > 0 ? rawChatId : undefined,
  };
}

export function isValidRiderSession(input: unknown): input is RiderSession {
  if (!input || typeof input !== 'object') return false;
  const i = input as Record<string, unknown>;
  return (
    typeof i.id === 'number' && Number.isFinite(i.id) && i.id > 0 &&
    typeof i.name === 'string' && i.name.trim().length > 0 &&
    typeof i.phone === 'string' && i.phone.trim().length > 0 &&
    isRiderStatus(i.status) &&
    (typeof i.telegram_chat_id === 'undefined' || (typeof i.telegram_chat_id === 'string' && i.telegram_chat_id.trim().length > 0))
  );
}

export function getRiderTelegramBindingCopy(rider: { telegram_chat_id?: string | null }): string {
  return rider.telegram_chat_id && rider.telegram_chat_id.trim().length > 0
    ? '已绑定 Telegram，可接收送餐通知'
    : '未绑定 Telegram，无法接收送餐通知';
}
