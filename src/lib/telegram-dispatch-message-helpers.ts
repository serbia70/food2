export interface TelegramDispatchMessage {
  text: string;
  replyMarkup: TelegramReplyMarkup;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface RiderSingleMessageActionInput {
  text: string;
  callbackData: string;
}

export interface RiderSingleMessageTelegramInput {
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

export interface TelegramEditMessagePayloadInput {
  chatId: string;
  messageId: number;
  text: string;
  replyMarkup: TelegramReplyMarkup;
}

export interface TelegramDeepLinkInput {
  baseUrl: string;
  restaurantId: string;
  orderId: number | string;
}

export function formatTelegramItemSummary(items: string[]): string[] {
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => `• ${item}`);
}

export function formatTelegramBelgradeTime(value: string): string {
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

export function appendTelegramNavigationButtons(rows: TelegramInlineKeyboardButton[][], input: {
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

export function buildTelegramDeepLink(input: TelegramDeepLinkInput): string {
  const baseUrl = String(input.baseUrl || '').trim().replace(/\/$/, '');
  const restaurantId = encodeURIComponent(String(input.restaurantId || ''));
  const orderId = encodeURIComponent(String(input.orderId || ''));
  return `${baseUrl}/rider/dashboard?orderId=${orderId}&restaurantId=${restaurantId}`;
}

const TELEGRAM_ADMIN_ASSIGNED_TEXT_MAX_BYTES = 3500;

export function trimTelegramLinesToByteLimit(lines: string[], maxBytes = TELEGRAM_ADMIN_ASSIGNED_TEXT_MAX_BYTES): string {
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

export function appendLegacyRiderSummary(message: TelegramDispatchMessage, input: {
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
