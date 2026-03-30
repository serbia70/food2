interface TelegramDispatchInput {
  shopName: string;
  address: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  phone: string;
  dashboardLink: string;
  claimCallbackData?: string;
}

interface TelegramDeepLinkInput {
  baseUrl: string;
  restaurantId: string;
  orderId: number | string;
}

import { createHmac, timingSafeEqual } from 'node:crypto';

interface TelegramClaimCallbackInput {
  orderId: number;
  riderId: number;
  riderName: string;
  restaurantId: string;
  riderPhone: string;
  telegramChatId: string;
  expiresAt?: number;
}

interface TelegramClaimPayload {
  orderId: number;
  riderId: number;
  riderName: string;
  restaurantId: string;
  riderPhone: string;
  telegramChatId: string;
  expiresAt: number;
}

export interface TelegramClaimCallback extends TelegramClaimPayload {
  sig: string;
}

interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

interface TelegramReplyMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramDispatchMessage {
  text: string;
  replyMarkup: TelegramReplyMarkup;
}

export function buildTelegramDeepLink(input: TelegramDeepLinkInput): string {
  const baseUrl = String(input.baseUrl || '').trim().replace(/\/$/, '');
  const restaurantId = encodeURIComponent(String(input.restaurantId || ''));
  const orderId = encodeURIComponent(String(input.orderId || ''));
  return `${baseUrl}/rider/dashboard?orderId=${orderId}&restaurantId=${restaurantId}`;
}

const TELEGRAM_CALLBACK_TTL_MS = 10 * 60 * 1000;

function normalizeTelegramClaimPayload(input: TelegramClaimCallbackInput): TelegramClaimPayload {
  return {
    orderId: Number(input.orderId),
    riderId: Number(input.riderId),
    riderName: String(input.riderName || '').trim(),
    restaurantId: String(input.restaurantId || '').trim(),
    riderPhone: String(input.riderPhone || '').trim(),
    telegramChatId: String(input.telegramChatId || '').trim(),
    expiresAt: Number(input.expiresAt || Date.now() + TELEGRAM_CALLBACK_TTL_MS),
  };
}

function validateTelegramClaimPayload(payload: TelegramClaimPayload): void {
  if (!Number.isFinite(payload.orderId) || payload.orderId <= 0) throw new Error('invalid_order_id');
  if (!Number.isFinite(payload.riderId) || payload.riderId <= 0) throw new Error('invalid_rider_id');
  if (!payload.riderName) throw new Error('invalid_rider_name');
  if (!payload.restaurantId) throw new Error('invalid_restaurant_id');
  if (!payload.riderPhone) throw new Error('invalid_rider_phone');
  if (!payload.telegramChatId) throw new Error('invalid_telegram_chat_id');
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) throw new Error('expired_callback');
}

function requireTelegramCallbackSecret(): string {
  const secret = String(process.env.TELEGRAM_CALLBACK_SECRET || process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('missing_telegram_callback_secret');
  return secret;
}

function signTelegramClaimPayload(payload: TelegramClaimPayload): string {
  const secret = requireTelegramCallbackSecret();
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

export function buildTelegramClaimCallback(input: TelegramClaimCallbackInput): string {
  const normalized = normalizeTelegramClaimPayload(input);
  validateTelegramClaimPayload(normalized);
  const signedPayload: TelegramClaimCallback = {
    ...normalized,
    sig: signTelegramClaimPayload(normalized),
  };
  return Buffer.from(JSON.stringify(signedPayload), 'utf8').toString('base64url');
}

export function parseTelegramClaimCallback(payload: string): TelegramClaimCallback {
  const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<TelegramClaimCallback>;
  const parsed = normalizeTelegramClaimPayload({
    orderId: Number(raw.orderId),
    riderId: Number(raw.riderId),
    riderName: String(raw.riderName || ''),
    restaurantId: String(raw.restaurantId || ''),
    riderPhone: String(raw.riderPhone || ''),
    telegramChatId: String(raw.telegramChatId || ''),
    expiresAt: Number(raw.expiresAt),
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

export function buildTelegramDispatchMessage(input: TelegramDispatchInput): TelegramDispatchMessage {
  const primaryButtons: TelegramInlineKeyboardButton[] = [
    { text: '查看并接单', url: input.dashboardLink },
  ];

  if (input.claimCallbackData) {
    primaryButtons.unshift({ text: '立即接单', callback_data: input.claimCallbackData });
  }

  if (String(input.phone || '').trim()) {
    primaryButtons.push({ text: '联系门店', url: `tel:${input.phone}` });
  }

  return {
    text: [
      `${input.shopName}有新单`,
      `约 ${input.pickupEtaMinutes} 分钟后可取`,
      `地址：${input.address}`,
      `金额：${input.totalAmount} RSD`,
      `联系电话：${input.phone}`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [primaryButtons],
    },
  };
}
