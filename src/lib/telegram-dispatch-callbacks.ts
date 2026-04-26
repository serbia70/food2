import {
  parseSignedTelegramClaimCallback,
  signAndValidateTelegramClaim,
  type TelegramClaimCallback,
  type TelegramClaimCallbackInput,
} from './telegram-dispatch-callback-signing.ts';
import {
  buildShortTelegramClaimCallback,
  computeShortChatIdHash,
  parseShortTelegramClaimCallback,
  readShortCallbackToken,
} from './telegram-dispatch-short-callback.ts';

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
    if (riderPhoneInput && riderPhoneInput.replace(/\D+/g, '').slice(0, 16) !== shortParsed.riderPhone) {
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
