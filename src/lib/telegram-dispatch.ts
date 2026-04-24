interface TelegramDispatchInput {
  shopName: string;
  address: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  phone: string;
  dashboardLink: string;
  shopMapUrl?: string;
  deliveryMapUrl?: string;
  claimCallbackData?: string;
}

interface AdminAssignedOrderTelegramInput {
  orderNo: string;
  shopName?: string;
  address: string;
  totalAmount: number;
  phone: string;
  pickupEtaMinutes: number;
  scheduledFor?: string;
  itemSummary: string[];
  shopMapUrl?: string;
  deliveryMapUrl?: string;
  claimCallbackData?: string;
  declineCallbackData?: string;
}

type TelegramClaimAction = 'accept' | 'decline' | 'picked_up' | 'complete';

interface RiderDeliveryCompleteTelegramInput {
  orderNo: string;
  shopName: string;
  address: string;
  phone: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  shopMapUrl?: string;
  deliveryMapUrl?: string;
  completeCallbackData?: string;
}

interface RiderPickedUpTelegramInput {
  orderNo: string;
  shopName: string;
  address: string;
  phone: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  shopMapUrl?: string;
  deliveryMapUrl?: string;
  completeCallbackData?: string;
}

interface RiderSingleMessageActionInput {
  text: string;
  callbackData: string;
}

interface RiderSingleMessageTelegramInput {
  orderNo: string;
  shopName: string;
  address: string;
  phone: string;
  statusLabel: string;
  acceptedAtLabel: string;
  pickedUpAtLabel: string;
  completedAtLabel: string;
  itemSummary?: string[];
  shopMapUrl?: string;
  deliveryMapUrl?: string;
  primaryAction: RiderSingleMessageActionInput | null;
  secondaryAction: RiderSingleMessageActionInput | null;
}

interface TelegramEditMessagePayloadInput {
  chatId: string;
  messageId: number;
  text: string;
  replyMarkup: TelegramReplyMarkup;
}

interface TelegramDeepLinkInput {
  baseUrl: string;
  restaurantId: string;
  orderId: number | string;
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readTelegramCallbackSecret } from './telegram-secrets.ts';

function formatTelegramItemSummary(items: string[]): string[] {
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => `• ${item}`);
}

function formatTelegramBelgradeTime(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Intl.DateTimeFormat('sr-RS', {
    timeZone: 'Europe/Belgrade',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

function appendTelegramNavigationButtons(rows: TelegramInlineKeyboardButton[][], input: {
  shopMapUrl?: string;
  deliveryMapUrl?: string;
}): TelegramInlineKeyboardButton[][] {
  const navigationRow: TelegramInlineKeyboardButton[] = [];
  const shopMapUrl = String(input.shopMapUrl || '').trim();
  const deliveryMapUrl = String(input.deliveryMapUrl || '').trim();

  if (shopMapUrl) {
    navigationRow.push({ text: '取餐导航', url: shopMapUrl });
  }
  if (deliveryMapUrl) {
    navigationRow.push({ text: '送餐导航', url: deliveryMapUrl });
  }
  if (navigationRow.length > 0) {
    rows.push(navigationRow);
  }
  return rows;
}

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

export function buildTelegramDispatchMessage(input: TelegramDispatchInput): TelegramDispatchMessage {
  const primaryButtons: TelegramInlineKeyboardButton[] = [
    { text: '查看订单', url: input.dashboardLink },
  ];

  if (input.claimCallbackData) {
    primaryButtons.unshift({ text: '接单', callback_data: input.claimCallbackData });
  }

  const phone = String(input.phone || '').trim();
  if (phone && phone !== '-') {
    primaryButtons.push({ text: `联系门店：${phone}`, url: `tel:${phone}` });
  }

  const lines = [
    `${input.shopName}有新单`,
    `约 ${input.pickupEtaMinutes} 分钟后送达`,
    `地址：${input.address}`,
    `金额：${input.totalAmount} RSD`,
    `联系电话：${input.phone}`,
  ];

  const shopMapUrl = String(input.shopMapUrl || '').trim();
  if (shopMapUrl) {
    lines.push(`店铺地图：${shopMapUrl}`);
  }

  const deliveryMapUrl = String(input.deliveryMapUrl || '').trim();
  if (deliveryMapUrl) {
    lines.push(`客户导航：${deliveryMapUrl}`);
  }

  return {
    text: lines.join('\n'),
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

export function buildRiderSingleMessageTelegram(input: RiderSingleMessageTelegramInput): TelegramDispatchMessage {
  const lines = [
    `#${input.orderNo} · ${input.shopName}`,
    `状态：${input.statusLabel}`,
  ];

  if (String(input.acceptedAtLabel || '').trim()) {
    lines.push(`接单时间：${formatTelegramBelgradeTime(String(input.acceptedAtLabel).trim())}`);
  }
  if (String(input.pickedUpAtLabel || '').trim()) {
    lines.push(`取餐时间：${formatTelegramBelgradeTime(String(input.pickedUpAtLabel).trim())}`);
  }
  if (String(input.completedAtLabel || '').trim()) {
    lines.push(`送达时间：${formatTelegramBelgradeTime(String(input.completedAtLabel).trim())}`);
  }

  const itemLines = formatTelegramItemSummary(input.itemSummary || []);
  if (itemLines.length > 0) {
    lines.push('菜品：', ...itemLines);
  }

  lines.push('', `地址：${input.address}`, `电话：${input.phone}`);

  const actionRow = [input.primaryAction, input.secondaryAction]
    .filter((item): item is RiderSingleMessageActionInput => !!item && !!String(item.callbackData || '').trim())
    .map((item) => ({
      text: String(item.text || '').trim(),
      callback_data: String(item.callbackData).trim(),
    }));
  const inlineKeyboard = appendTelegramNavigationButtons(
    actionRow.length > 0 ? [actionRow] : [],
    {
      shopMapUrl: input.shopMapUrl,
      deliveryMapUrl: input.deliveryMapUrl,
    },
  );

  return {
    text: lines.join('\n'),
    replyMarkup: {
      inline_keyboard: inlineKeyboard,
    },
  };
}

export function buildTelegramEditMessagePayload(input: TelegramEditMessagePayloadInput): {
  chat_id: string;
  message_id: number;
  text: string;
  reply_markup: TelegramReplyMarkup;
} {
  return {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    reply_markup: input.replyMarkup,
  };
}

export function buildAdminAssignedOrderTelegramMessage(input: AdminAssignedOrderTelegramInput): TelegramDispatchMessage {
  const itemLines = formatTelegramItemSummary(input.itemSummary);

  const lines = [
    '你有新的指派订单',
    `订单号：${input.orderNo}`,
    `店铺：${String(input.shopName || '').trim() || '店铺'}`,
    `地址：${input.address}`,
    `电话：${input.phone}`,
    `金额：${input.totalAmount} RSD`,
    `预计 ${input.pickupEtaMinutes} 分钟后可取`,
  ];

  if (String(input.scheduledFor || '').trim()) {
    lines.push(`预约送达：${String(input.scheduledFor).trim()}`);
  }

  if (itemLines.length > 0) {
    lines.push('菜品：', ...itemLines);
  }

  const primaryButtons: TelegramInlineKeyboardButton[] = [];
  if (String(input.claimCallbackData || '').trim()) {
    primaryButtons.push({ text: '接单', callback_data: String(input.claimCallbackData).trim() });
  }
  if (String(input.declineCallbackData || '').trim()) {
    primaryButtons.push({ text: '暂不接单', callback_data: String(input.declineCallbackData).trim() });
  }

  const inlineKeyboard = appendTelegramNavigationButtons(
    primaryButtons.length > 0 ? [primaryButtons] : [],
    {
      shopMapUrl: input.shopMapUrl,
      deliveryMapUrl: input.deliveryMapUrl,
    },
  );

  return {
    text: trimTelegramLinesToByteLimit(lines, TELEGRAM_ADMIN_ASSIGNED_TEXT_MAX_BYTES),
    replyMarkup: {
      inline_keyboard: inlineKeyboard,
    },
  };
}

function appendLegacyRiderSummary(message: TelegramDispatchMessage, input: {
  totalAmount: number;
  pickupEtaMinutes: number;
}): TelegramDispatchMessage {
  const extraLines: string[] = [];
  if (Number(input.totalAmount || 0) > 0) {
    extraLines.push(`金额：${Number(input.totalAmount || 0)} RSD`);
  }
  if (Number(input.pickupEtaMinutes || 0) > 0) {
    extraLines.push(`预计：${Number(input.pickupEtaMinutes || 0)} 分钟`);
  }
  if (extraLines.length === 0) return message;

  const lines = String(message.text || '').split('\n');
  const phoneIndex = lines.findIndex((line) => line.startsWith('电话：'));
  const insertAt = phoneIndex >= 0 ? phoneIndex + 1 : lines.length;
  lines.splice(insertAt, 0, ...extraLines);
  return {
    ...message,
    text: lines.join('\n'),
  };
}

export function buildRiderAwaitingPickupTelegramMessage(input: RiderPickedUpTelegramInput): TelegramDispatchMessage {
  return appendLegacyRiderSummary(buildRiderSingleMessageTelegram({
    orderNo: input.orderNo,
    shopName: input.shopName,
    address: input.address,
    phone: input.phone,
    statusLabel: '待取餐',
    acceptedAtLabel: '',
    pickedUpAtLabel: '',
    completedAtLabel: '',
    shopMapUrl: input.shopMapUrl,
    deliveryMapUrl: input.deliveryMapUrl,
    primaryAction: String(input.completeCallbackData || '').trim()
      ? { text: '取餐', callbackData: String(input.completeCallbackData).trim() }
      : null,
    secondaryAction: null,
  }), {
    totalAmount: input.totalAmount,
    pickupEtaMinutes: input.pickupEtaMinutes,
  });
}

export function buildRiderDeliveringTelegramMessage(input: RiderDeliveryCompleteTelegramInput): TelegramDispatchMessage {
  return appendLegacyRiderSummary(buildRiderSingleMessageTelegram({
    orderNo: input.orderNo,
    shopName: input.shopName,
    address: input.address,
    phone: input.phone,
    statusLabel: '配送中',
    acceptedAtLabel: '',
    pickedUpAtLabel: '',
    completedAtLabel: '',
    shopMapUrl: input.shopMapUrl,
    deliveryMapUrl: input.deliveryMapUrl,
    primaryAction: String(input.completeCallbackData || '').trim()
      ? { text: '送达', callbackData: String(input.completeCallbackData).trim() }
      : null,
    secondaryAction: null,
  }), {
    totalAmount: input.totalAmount,
    pickupEtaMinutes: input.pickupEtaMinutes,
  });
}

export function buildRiderPickedUpTelegramMessage(input: RiderPickedUpTelegramInput): TelegramDispatchMessage {
  return buildRiderAwaitingPickupTelegramMessage(input);
}

export function buildRiderDeliveryCompleteTelegramMessage(input: RiderDeliveryCompleteTelegramInput): TelegramDispatchMessage {
  return buildRiderDeliveringTelegramMessage(input);
}
