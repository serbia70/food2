import {
  type TelegramClaimAction,
  type TelegramClaimCallback,
  type TelegramClaimCallbackInput,
  requireTelegramCallbackSecret,
  safeEqualSignature,
  signAndValidateTelegramClaim,
  shouldValidateTelegramCallbackExpiry,
} from './telegram-dispatch-callback-signing.ts';
import { createHmac } from 'node:crypto';

export const TELEGRAM_SHORT_CALLBACK_PREFIX = 'rc2.';
const TELEGRAM_SHORT_CALLBACK_TTL_MS = 10 * 60 * 1000;
const SHORT_CALLBACK_CHAT_ID_HASH_LEN = 6;
const SHORT_CALLBACK_SIG_LEN = 8;

export function readShortCallbackToken(payload: string): string {
  const value = String(payload || '').trim();
  if (!value.startsWith(TELEGRAM_SHORT_CALLBACK_PREFIX)) return '';
  return value.slice(TELEGRAM_SHORT_CALLBACK_PREFIX.length);
}

export function signShortCallbackParts(parts: string[], secretOverride?: string): string {
  const secret = requireTelegramCallbackSecret(secretOverride);
  return createHmac('sha256', secret)
    .update(['rc2', ...parts].join('.'))
    .digest('base64url')
    .slice(0, SHORT_CALLBACK_SIG_LEN);
}

export function computeShortChatIdHash(chatId: string, secretOverride?: string): string {
  const secret = requireTelegramCallbackSecret(secretOverride);
  return createHmac('sha256', secret)
    .update(`chat:${chatId}`)
    .digest('base64url')
    .slice(0, SHORT_CALLBACK_CHAT_ID_HASH_LEN);
}

function sanitizeCompactText(value: string): string {
  return String(value || '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 10);
}

function sanitizeCompactPhone(value: string): string {
  const digits = String(value || '').replace(/\D+/g, '').slice(0, 16);
  if (!digits) throw new Error('invalid_rider_phone');
  return digits;
}

function readBase36PositiveInt(value: string): number {
  if (!/^[0-9a-z]+$/.test(value)) throw new Error('invalid_callback_data');
  const parsed = Number.parseInt(value, 36);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('invalid_callback_data');
  return parsed;
}

export function buildShortTelegramClaimCallback(input: TelegramClaimCallbackInput): string {
  const callback = signAndValidateTelegramClaim(input);
  const now = Date.now();
  const expiresAt = Math.min(Number(callback.expiresAt), now + TELEGRAM_SHORT_CALLBACK_TTL_MS);
  const actionPart = callback.action === 'decline'
    ? 'd'
    : callback.action === 'picked_up'
      ? 'p'
      : callback.action === 'complete'
        ? 'c'
        : 'a';
  const orderPart = callback.orderId.toString(36);
  const riderPart = callback.riderId.toString(36);
  const expiresPart = Math.floor(expiresAt / 1000).toString(36);
  const chatPart = computeShortChatIdHash(callback.telegramChatId, input.secretOverride);
  const phonePart = sanitizeCompactPhone(callback.riderPhone);
  const namePart = sanitizeCompactText(callback.riderName);
  if (!namePart) throw new Error('invalid_rider_name');
  const shortParts = [actionPart, orderPart, riderPart, expiresPart, chatPart, phonePart, namePart];
  const sigPart = signShortCallbackParts(shortParts, input.secretOverride);
  return `${TELEGRAM_SHORT_CALLBACK_PREFIX}${shortParts.join('.')}.${sigPart}`;
}

export function parseShortTelegramClaimCallback(payload: string): TelegramClaimCallback {
  const token = readShortCallbackToken(payload);
  if (!token) throw new Error('invalid_callback_data');

  const parts = token.split('.');
  if (parts.length !== 8) throw new Error('invalid_callback_data');

  const [actionPart, orderPart, riderPart, expiresPart, chatPart, phonePart, namePart, sigPart] = parts;
  if (!actionPart || !orderPart || !riderPart || !expiresPart || !chatPart || !phonePart || !namePart || !sigPart) throw new Error('invalid_callback_data');
  if (!/^[adpc]$/.test(actionPart) || !/^[A-Za-z0-9_-]+$/.test(chatPart) || !/^[A-Za-z0-9_-]+$/.test(phonePart) || !/^[\p{L}\p{N}_-]+$/u.test(namePart) || !/^[A-Za-z0-9_-]+$/.test(sigPart)) {
    throw new Error('invalid_callback_data');
  }

  const expectedSig = signShortCallbackParts([actionPart, orderPart, riderPart, expiresPart, chatPart, phonePart, namePart]);
  if (!safeEqualSignature(sigPart, expectedSig)) throw new Error('invalid_signature');

  const expiresAt = readBase36PositiveInt(expiresPart) * 1000;
  const action: TelegramClaimAction = actionPart === 'd'
    ? 'decline'
    : actionPart === 'p'
      ? 'picked_up'
      : actionPart === 'c'
        ? 'complete'
        : 'accept';
  if (shouldValidateTelegramCallbackExpiry(action) && expiresAt <= Date.now()) throw new Error('expired_callback');

  return {
    orderId: readBase36PositiveInt(orderPart),
    riderId: readBase36PositiveInt(riderPart),
    riderName: namePart,
    restaurantId: '',
    riderPhone: sanitizeCompactPhone(phonePart),
    telegramChatId: chatPart,
    expiresAt,
    action,
    sig: sigPart,
  };
}
