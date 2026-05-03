import {
  readResolvedTelegramChatId,
} from './rider-route-admin-telegram-transport.ts';

export type AdminTelegramPayloadBaseExtras = {
  shop_slug?: string;
  telegramBotToken?: string;
};

export function buildAdminTelegramPayloadBaseExtras({
  shopSlug,
  shop_slug,
  telegramBotToken,
}: {
  shopSlug?: unknown;
  shop_slug?: unknown;
  telegramBotToken?: unknown;
}): AdminTelegramPayloadBaseExtras {
  const normalizedShopSlug = String(shop_slug ?? shopSlug ?? '').trim();
  const normalizedTelegramBotToken = String(telegramBotToken || '').trim();

  return {
    ...(normalizedShopSlug ? { shop_slug: normalizedShopSlug } : {}),
    ...(normalizedTelegramBotToken ? { telegramBotToken: normalizedTelegramBotToken } : {}),
  };
}

export type AdminTelegramSendCallbackBase = {
  orderId: number;
  riderId: number;
  riderName: string;
  riderPhone: string;
  restaurantId: string;
  telegramChatId: string;
  secretOverride?: string;
};

export function buildAdminTelegramCallbackBase({
  orderId,
  rider,
  restaurantId,
  telegramChatId,
  secretOverride,
}: {
  orderId: string | number;
  rider: { id?: unknown; name?: unknown; phone?: unknown };
  restaurantId?: string;
  telegramChatId?: string;
  secretOverride?: string;
}): AdminTelegramSendCallbackBase {
  const normalizedSecretOverride = String(secretOverride || '').trim();

  return {
    orderId: Number(orderId || 0),
    riderId: Number(rider.id || 0),
    riderName: String(rider.name || '').trim(),
    riderPhone: String(rider.phone || '').trim(),
    restaurantId: String(restaurantId || '').trim() || 'admin',
    telegramChatId: String(telegramChatId || '').trim(),
    ...(normalizedSecretOverride ? { secretOverride: normalizedSecretOverride } : {}),
  };
}

export function buildAdminTelegramSendPreparation({
  orderId,
  rider,
  fallbackChatId,
  shopSlug,
  shop_slug,
  telegramBotToken,
  restaurantId,
  secretOverride,
}: {
  orderId: string | number;
  rider: { id?: unknown; name?: unknown; phone?: unknown; telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: unknown;
  shopSlug?: unknown;
  shop_slug?: unknown;
  telegramBotToken?: unknown;
  restaurantId?: unknown;
  secretOverride?: unknown;
}): {
  chatId: string;
  payloadBaseExtras: AdminTelegramPayloadBaseExtras;
  callbackBase: AdminTelegramSendCallbackBase;
} {
  const chatId = readResolvedTelegramChatId(rider, String(fallbackChatId || ''));
  return {
    chatId,
    payloadBaseExtras: buildAdminTelegramPayloadBaseExtras({
      shopSlug,
      shop_slug,
      telegramBotToken,
    }),
    callbackBase: buildAdminTelegramCallbackBase({
      orderId,
      rider,
      restaurantId: String(restaurantId ?? ''),
      telegramChatId: chatId,
      secretOverride: String(secretOverride || ''),
    }),
  };
}
