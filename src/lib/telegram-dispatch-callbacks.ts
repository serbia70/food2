import { createHmac, timingSafeEqual } from 'node:crypto';
import { readTelegramCallbackSecret } from './telegram-secrets.ts';

type TelegramClaimAction = 'accept' | 'decline' | 'picked_up' | 'complete';

interface TelegramClaimCallbackInput {
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

interface TelegramClaimPayload {
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

const TELEGRAM_CALLBACK_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_SHORT_CALLBACK_PREFIX = 'rc2.';
const TELEGRAM_SHORT_CALLBACK_TTL_MS = 10 * 60 * 1000;
const SHORT_CALLBACK_CHAT_ID_HASH_LEN = 6;
const SHORT_CALLBACK_SIG_LEN = 8;

function normalizeTelegramClaimPayload(input: TelegramClaimCallbackInput): TelegramClaimPayload {
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

function shouldValidateTelegramCallbackExpiry(action: TelegramClaimAction): boolean {
  return action === 'accept' || action === 'decline';
}

function validateTelegramClaimPayload(payload: TelegramClaimPayload): void {
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

function requireTelegramCallbackSecret(secretOverride?: string): string {
  const secret = String(secretOverride || '').trim() || readTelegramCallbackSecret();
  if (!secret) throw new Error('missing_telegram_callback_secret');
  return secret;
}

function signTelegramClaimPayload(payload: TelegramClaimPayload, secretOverride?: string): string {
  const secret = requireTelegramCallbackSecret(secretOverride);
  return createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('base64url');
}

function safeEqualSignature(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function signAndValidateTelegramClaim(input: TelegramClaimCallbackInput): TelegramClaimCallback {
  const normalized = normalizeTelegramClaimPayload(input);
  validateTelegramClaimPayload(normalized);
  return {
    ...normalized,
    sig: signTelegramClaimPayload(normalized, input.secretOverride),
  };
}

function parseSignedTelegramClaimCallback(payload: string): TelegramClaimCallback {
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

function readShortCallbackToken(payload: string): string {
  const value = String(payload || '').trim();
  if (!value.startsWith(TELEGRAM_SHORT_CALLBACK_PREFIX)) return '';
  return value.slice(TELEGRAM_SHORT_CALLBACK_PREFIX.length);
}

function signShortCallbackParts(parts: string[], secretOverride?: string): string {
  const secret = requireTelegramCallbackSecret(secretOverride);
  return createHmac('sha256', secret)
    .update(['rc2', ...parts].join('.'))
    .digest('base64url')
    .slice(0, SHORT_CALLBACK_SIG_LEN);
}

function computeShortChatIdHash(chatId: string, secretOverride?: string): string {
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

function buildShortTelegramClaimCallback(input: TelegramClaimCallbackInput): string {
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

function parseShortTelegramClaimCallback(payload: string): TelegramClaimCallback {
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
  const action = actionPart === 'd'
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

export function buildTelegramClaimCallback(input: TelegramClaimCallbackInput): string {
  return Buffer.from(JSON.stringify(signAndValidateTelegramClaim(input)), 'utf8').toString('base64url');
}

export function buildTelegramShortClaimCallback(input: TelegramClaimCallbackInput): string {
  return buildShortTelegramClaimCallback(input);
}

export function parseTelegramClaimCallback(
  payload: string,
  options?: {
    chatId?: string;
    riderPhone?: string;
    restaurantId?: string;
  },
): TelegramClaimCallback {
  if (readShortCallbackToken(payload)) {
    const shortParsed = parseShortTelegramClaimCallback(payload);
    const chatId = String(options?.chatId || '').trim();
    if (!chatId) throw new Error('invalid_callback_data');
    if (computeShortChatIdHash(chatId) !== shortParsed.telegramChatId) {
      throw new Error('rider_identity_mismatch');
    }

    const riderPhoneInput = String(options?.riderPhone || '').trim();
    if (riderPhoneInput && sanitizeCompactPhone(riderPhoneInput) !== shortParsed.riderPhone) {
      throw new Error('rider_identity_mismatch');
    }

    return {
      ...shortParsed,
      riderName: String(shortParsed.riderName || '').trim(),
      riderPhone: shortParsed.riderPhone,
      restaurantId: String(options?.restaurantId || '').trim(),
      telegramChatId: chatId,
      action: shortParsed.action,
    };
  }
  return parseSignedTelegramClaimCallback(payload);
}
