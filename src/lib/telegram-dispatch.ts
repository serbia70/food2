interface TelegramDispatchInput {
  shopName: string;
  address: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  phone: string;
  dashboardLink: string;
  claimCallbackData?: string;
}

interface AdminAssignedOrderTelegramInput {
  orderNo: string;
  address: string;
  totalAmount: number;
  phone: string;
  pickupEtaMinutes: number;
  scheduledFor?: string;
  itemSummary: string[];
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

const TELEGRAM_SHORT_CALLBACK_PREFIX = 'rc2.';
const TELEGRAM_SHORT_CALLBACK_TTL_MS = 10 * 60 * 1000;
const SHORT_CALLBACK_CHAT_ID_HASH_LEN = 6;
const SHORT_CALLBACK_SIG_LEN = 8;

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
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
  const secret = String(
    env.TELEGRAM_CALLBACK_SECRET
      || env.TELEGRAM_WEBHOOK_SECRET
      || env.JWT_SECRET
      || process.env.TELEGRAM_CALLBACK_SECRET
      || process.env.TELEGRAM_WEBHOOK_SECRET
      || process.env.JWT_SECRET
      || '',
  ).trim();
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

function signAndValidateTelegramClaim(input: TelegramClaimCallbackInput): TelegramClaimCallback {
  const normalized = normalizeTelegramClaimPayload(input);
  validateTelegramClaimPayload(normalized);
  return {
    ...normalized,
    sig: signTelegramClaimPayload(normalized),
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

function signShortCallbackParts(parts: string[]): string {
  const secret = requireTelegramCallbackSecret();
  return createHmac('sha256', secret)
    .update(['rc2', ...parts].join('.'))
    .digest('base64url')
    .slice(0, SHORT_CALLBACK_SIG_LEN);
}

function computeShortChatIdHash(chatId: string): string {
  const secret = requireTelegramCallbackSecret();
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
  const orderPart = callback.orderId.toString(36);
  const riderPart = callback.riderId.toString(36);
  const expiresPart = Math.floor(expiresAt / 1000).toString(36);
  const chatPart = computeShortChatIdHash(callback.telegramChatId);
  const phonePart = sanitizeCompactPhone(callback.riderPhone);
  const namePart = sanitizeCompactText(callback.riderName);
  if (!namePart) throw new Error('invalid_rider_name');
  const shortParts = [orderPart, riderPart, expiresPart, chatPart, phonePart, namePart];
  const sigPart = signShortCallbackParts(shortParts);
  return `${TELEGRAM_SHORT_CALLBACK_PREFIX}${shortParts.join('.')}.${sigPart}`;
}

function parseShortTelegramClaimCallback(payload: string): TelegramClaimCallback {
  const token = readShortCallbackToken(payload);
  if (!token) throw new Error('invalid_callback_data');

  const parts = token.split('.');
  if (parts.length !== 7) throw new Error('invalid_callback_data');

  const [orderPart, riderPart, expiresPart, chatPart, phonePart, namePart, sigPart] = parts;
  if (!orderPart || !riderPart || !expiresPart || !chatPart || !phonePart || !namePart || !sigPart) throw new Error('invalid_callback_data');
  if (!/^[A-Za-z0-9_-]+$/.test(chatPart) || !/^[A-Za-z0-9_-]+$/.test(phonePart) || !/^[\p{L}\p{N}_-]+$/u.test(namePart) || !/^[A-Za-z0-9_-]+$/.test(sigPart)) {
    throw new Error('invalid_callback_data');
  }

  const expectedSig = signShortCallbackParts([orderPart, riderPart, expiresPart, chatPart, phonePart, namePart]);
  if (!safeEqualSignature(sigPart, expectedSig)) throw new Error('invalid_signature');

  const expiresAt = readBase36PositiveInt(expiresPart) * 1000;
  if (expiresAt <= Date.now()) throw new Error('expired_callback');

  return {
    orderId: readBase36PositiveInt(orderPart),
    riderId: readBase36PositiveInt(riderPart),
    riderName: namePart,
    restaurantId: '',
    riderPhone: sanitizeCompactPhone(phonePart),
    telegramChatId: chatPart,
    expiresAt,
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
    riderName?: string;
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
      riderName: shortParsed.riderName,
      riderPhone: shortParsed.riderPhone,
      restaurantId: String(options?.restaurantId || '').trim(),
      telegramChatId: chatId,
    };
  }
  return parseSignedTelegramClaimCallback(payload);
}

export function buildTelegramDispatchMessage(input: TelegramDispatchInput): TelegramDispatchMessage {
  const primaryButtons: TelegramInlineKeyboardButton[] = [
    { text: '查看并接单', url: input.dashboardLink },
  ];

  if (input.claimCallbackData) {
    primaryButtons.unshift({ text: '立即接单', callback_data: input.claimCallbackData });
  }

  const phone = String(input.phone || '').trim();
  if (phone && phone !== '-') {
    primaryButtons.push({ text: '联系门店', url: `tel:${phone}` });
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

const TELEGRAM_ADMIN_ASSIGNED_TEXT_MAX_BYTES = 3500;

function trimTelegramLinesToByteLimit(lines: string[], maxBytes: number): string {
  const kept: string[] = [];
  let truncated = false;

  for (const line of lines) {
    const next = [...kept, line].join('\n');
    if (Buffer.byteLength(next, 'utf8') <= maxBytes) {
      kept.push(line);
      continue;
    }
    truncated = true;
    break;
  }

  if (!truncated) return kept.join('\n');

  const suffix = '菜品过多，已截断';
  while (kept.length > 0 && Buffer.byteLength([...kept, suffix].join('\n'), 'utf8') > maxBytes) {
    kept.pop();
  }
  return [...kept, suffix].join('\n');
}

export function buildAdminAssignedOrderTelegramMessage(input: AdminAssignedOrderTelegramInput): TelegramDispatchMessage {
  const lines = [
    '你有新的指派订单',
    `订单号：${input.orderNo}`,
    `地址：${input.address}`,
    `电话：${input.phone}`,
    `金额：${input.totalAmount} RSD`,
    `预计 ${input.pickupEtaMinutes} 分钟后可取`,
    ...input.itemSummary,
  ];

  if (String(input.scheduledFor || '').trim()) {
    lines.splice(5, 0, `预约送达：${String(input.scheduledFor).trim()}`);
  }

  const primaryButtons: TelegramInlineKeyboardButton[] = [];
  if (String(input.claimCallbackData || '').trim()) {
    primaryButtons.push({ text: '立即接单', callback_data: String(input.claimCallbackData).trim() });
  }
  const phone = String(input.phone || '').trim();
  if (phone && phone !== '-') {
    primaryButtons.push({ text: '联系门店', url: `tel:${phone}` });
  }

  return {
    text: trimTelegramLinesToByteLimit(lines, TELEGRAM_ADMIN_ASSIGNED_TEXT_MAX_BYTES),
    replyMarkup: {
      inline_keyboard: primaryButtons.length > 0 ? [primaryButtons] : [],
    },
  };
}
