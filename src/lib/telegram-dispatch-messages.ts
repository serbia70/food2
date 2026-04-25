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

export function buildTelegramDeepLink(input: TelegramDeepLinkInput): string {
  const baseUrl = String(input.baseUrl || '').trim().replace(/\/$/, '');
  const restaurantId = encodeURIComponent(String(input.restaurantId || ''));
  const orderId = encodeURIComponent(String(input.orderId || ''));
  return `${baseUrl}/rider/dashboard?orderId=${orderId}&restaurantId=${restaurantId}`;
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
