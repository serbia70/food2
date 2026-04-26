import {
  appendTelegramNavigationButtons,
  buildTelegramDeepLink,
  formatTelegramItemSummary,
  trimTelegramLinesToByteLimit,
  type TelegramDispatchMessage,
  type TelegramInlineKeyboardButton,
} from './telegram-dispatch-message-helpers.ts';

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
    text: trimTelegramLinesToByteLimit(lines),
    replyMarkup: {
      inline_keyboard: inlineKeyboard,
    },
  };
}

export { buildTelegramDeepLink };
