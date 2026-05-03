import { createHmac, timingSafeEqual } from 'node:crypto';
import { readTelegramCallbackSecret } from './telegram-secrets.ts';

export type TelegramClaimAction = 'accept' | 'decline' | 'picked_up' | 'complete';

export interface TelegramClaimCallbackInput {
  orderId: number;
  riderId: number;
  riderName: string;
  restaurantId: string;
  riderPhone: string;
  telegramChatId: string;
  expiresAt?: number;
  action?: TelegramClaimAction;
  secretOverride?: string;
}

export interface TelegramClaimPayload {
  orderId: number;
  riderId: number;
  riderName: string;
  restaurantId: string;
  riderPhone: string;
  telegramChatId: string;
  expiresAt: number;
  action: TelegramClaimAction;
}

export interface TelegramClaimCallback extends TelegramClaimPayload {
  sig: string;
}

export const TELEGRAM_CALLBACK_TTL_MS = 10 * 60 * 1000;

export function normalizeTelegramClaimPayload(input: TelegramClaimCallbackInput): TelegramClaimPayload {
  const action = input.action === 'decline'
    || input.action === 'picked_up'
    || input.action === 'complete'
    ? input.action
    : 'accept';
  return {
    orderId: Number(input.orderId),
    riderId: Number(input.riderId),
    riderName: String(input.riderName || '').trim(),
    restaurantId: String(input.restaurantId || '').trim(),
    riderPhone: String(input.riderPhone || '').trim(),
    telegramChatId: String(input.telegramChatId || '').trim(),
    expiresAt: Number(input.expiresAt || Date.now() + TELEGRAM_CALLBACK_TTL_MS),
    action,
  };
}

export function shouldValidateTelegramCallbackExpiry(action: TelegramClaimAction): boolean {
  return action === 'accept' || action === 'decline';
}

export function validateTelegramClaimPayload(payload: TelegramClaimPayload): void {
  if (!Number.isFinite(payload.orderId) || payload.orderId <= 0) throw new Error('invalid_order_id');
  if (!Number.isFinite(payload.riderId) || payload.riderId <= 0) throw new Error('invalid_rider_id');
  if (!payload.riderName) throw new Error('invalid_rider_name');
  if (!payload.restaurantId) throw new Error('invalid_restaurant_id');
  if (!payload.riderPhone) throw new Error('invalid_rider_phone');
  if (!payload.telegramChatId) throw new Error('invalid_telegram_chat_id');
  if (payload.action !== 'accept' && payload.action !== 'decline' && payload.action !== 'picked_up' && payload.action !== 'complete') throw new Error('invalid_callback_action');
  if (!Number.isFinite(payload.expiresAt)) throw new Error('expired_callback');
  if (shouldValidateTelegramCallbackExpiry(payload.action) && payload.expiresAt <= Date.now()) throw new Error('expired_callback');
}

export function requireTelegramCallbackSecret(secretOverride?: string): string {
  const secret = String(secretOverride || '').trim() || readTelegramCallbackSecret();
  if (!secret) throw new Error('missing_telegram_callback_secret');
  return secret;
}

export function signTelegramClaimPayload(payload: TelegramClaimPayload, secretOverride?: string): string {
  const secret = requireTelegramCallbackSecret(secretOverride);
  return createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('base64url');
}

export function safeEqualSignature(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function signAndValidateTelegramClaim(input: TelegramClaimCallbackInput): TelegramClaimCallback {
  const normalized = normalizeTelegramClaimPayload(input);
  validateTelegramClaimPayload(normalized);
  return {
    ...normalized,
    sig: signTelegramClaimPayload(normalized, input.secretOverride),
  };
}

export function parseSignedTelegramClaimCallback(payload: string): TelegramClaimCallback {
  const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<TelegramClaimCallback>;
  const parsed = normalizeTelegramClaimPayload({
    orderId: Number(raw.orderId),
    riderId: Number(raw.riderId),
    riderName: String(raw.riderName || ''),
    restaurantId: String(raw.restaurantId || ''),
    riderPhone: String(raw.riderPhone || ''),
    telegramChatId: String(raw.telegramChatId || ''),
    expiresAt: Number(raw.expiresAt),
    action: raw.action,
  });
  validateTelegramClaimPayload(parsed);

  const sig = String(raw.sig || '').trim();
  if (!sig) throw new Error('invalid_signature');
  const expectedSig = signTelegramClaimPayload(parsed);
  if (!safeEqualSignature(sig, expectedSig)) throw new Error('invalid_signature');

  return {
    ...parsed,
    sig,
  };
}
