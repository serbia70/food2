import {
  appendLegacyRiderSummary,
  appendTelegramNavigationButtons,
  formatTelegramBelgradeTime,
  formatTelegramItemSummary,
  type RiderSingleMessageActionInput,
  type RiderSingleMessageTelegramInput,
  type TelegramDispatchMessage,
  type TelegramInlineKeyboardButton,
} from './telegram-dispatch-message-helpers.ts';

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
