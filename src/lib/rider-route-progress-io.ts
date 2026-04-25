import { findAdminOrderRow, parseJsonValue } from './rider-route-admin-orders.ts';
import { buildForwardHeaders, readJsonObject } from './rider-route-admin-telegram.ts';
import {
  buildRiderOrderView,
  readDispatchMetaFromRemarks,
  resolveRiderUnifiedStatus,
} from './rider-dispatch.ts';
import {
  buildRiderSingleMessageTelegram,
  buildTelegramEditMessagePayload,
  buildTelegramShortClaimCallback,
} from './telegram-dispatch.ts';

export interface RiderRouteOrderSnapshot {
  status: string;
  remarksJson: string;
  courierPhone: string;
}

function readOrderSnapshotRow(row: Record<string, unknown> | null | undefined): RiderRouteOrderSnapshot {
  if (!row || typeof row !== 'object') return { status: '', remarksJson: '', courierPhone: '' };
  return {
    status: String(row.status || '').trim(),
    remarksJson: String(row.remarksJson || row.remarks_json || '').trim(),
    courierPhone: String(row.courierPhone || row.courier_phone || '').trim(),
  };
}

async function readOrderDetailFromRiderOrders(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone: string,
): Promise<Record<string, unknown> | null> {
  const phone = String(riderPhone || '').trim();
  if (!phone) return null;

  const upstream = await fetch(`${apiBaseUrl}/api/rider/orders?phone=${encodeURIComponent(phone)}&view=active`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;

  const parsed = readJsonObject(text);
  const rows = Array.isArray(parsed?.orders) ? parsed.orders : [];
  const matched = rows.find((row) => String((row as Record<string, unknown>)?.id || '').trim() === orderId);
  return matched && typeof matched === 'object' ? matched as Record<string, unknown> : null;
}

export async function readOrderDetail(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone = '',
): Promise<Record<string, unknown> | null> {
  const upstream = await fetch(`${apiBaseUrl}/api/admin/orders`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (upstream.ok && text) {
    const matched = findAdminOrderRow(parseJsonValue(text), orderId);
    if (matched) return matched;
  }

  return readOrderDetailFromRiderOrders(request, apiBaseUrl, orderId, riderPhone);
}

export async function readOrderDispatchSnapshot(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  riderPhone = '',
): Promise<RiderRouteOrderSnapshot> {
  return readOrderSnapshotRow(await readOrderDetail(request, apiBaseUrl, orderId, riderPhone));
}

function readTelegramSendShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  if (!slug || slug === 'admin') return '';
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

export function readOrderTelegramShopSlug(order: Record<string, unknown>, fallback?: unknown): string {
  return readTelegramSendShopSlug(order.shopSlug)
    || readTelegramSendShopSlug(order.slug)
    || readTelegramSendShopSlug(order.restaurantSlug)
    || readTelegramSendShopSlug(order.shop_slug)
    || readTelegramSendShopSlug(order.restaurant_slug)
    || readTelegramSendShopSlug(order.restaurantId)
    || readTelegramSendShopSlug(order.shopId)
    || readTelegramSendShopSlug(fallback);
}

export async function syncTelegramDeliveryProgressMessage({
  request,
  apiBaseUrl,
  telegramSendUrl,
  orderId,
  rider,
  remarksJson,
  targetStatus,
  fallbackShopSlug,
  fallbackChatId,
  fallbackOrder,
}: {
  request: Request;
  apiBaseUrl: string;
  telegramSendUrl: string | URL;
  orderId: string;
  rider: {
    riderId: string;
    riderName: string;
    riderPhone: string;
  };
  remarksJson: string;
  targetStatus: 'delivering' | 'picked_up' | 'completed';
  fallbackShopSlug?: string;
  fallbackChatId?: string;
  fallbackOrder?: Record<string, unknown> | null;
}): Promise<void> {
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const messageRef = meta.telegramMessageRef;
  if (!messageRef) return;

  const order = fallbackOrder || await readOrderDetail(request, apiBaseUrl, orderId, rider.riderPhone);
  if (!order) return;

  const orderView = buildRiderOrderView({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: rider.riderPhone,
  });
  const unifiedStatus = resolveRiderUnifiedStatus({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: rider.riderPhone,
  }, {
    riderId: rider.riderId,
    riderName: rider.riderName,
    riderPhone: rider.riderPhone,
  });
  const shopSlug = readOrderTelegramShopSlug(order, fallbackShopSlug);
  const chatId = String(messageRef.chatId || fallbackChatId || '').trim();
  const primaryCallbackData = unifiedStatus.primaryAction && shopSlug
    ? buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId: Number(rider.riderId),
        riderName: rider.riderName,
        riderPhone: rider.riderPhone,
        restaurantId: shopSlug,
        telegramChatId: chatId,
        action: unifiedStatus.primaryAction === '送达' ? 'complete' : 'picked_up',
      })
    : '';

  const message = buildRiderSingleMessageTelegram({
    orderNo: String(order.orderNo || orderId || '').trim(),
    shopName: orderView.shopName,
    address: orderView.deliveryAddress || '未提供地址',
    phone: String(order.userPhone || '').trim() || '-',
    statusLabel: unifiedStatus.statusLabel,
    acceptedAtLabel: unifiedStatus.acceptedAt,
    pickedUpAtLabel: unifiedStatus.pickedUpAt,
    completedAtLabel: unifiedStatus.completedAt,
    itemSummary: readTelegramItemSummaryFromOrder(order),
    shopMapUrl: orderView.shopMapUrl,
    deliveryMapUrl: orderView.deliveryMapUrl,
    primaryAction: unifiedStatus.primaryAction && primaryCallbackData
      ? { text: unifiedStatus.primaryAction, callbackData: primaryCallbackData }
      : null,
    secondaryAction: null,
  });

  await fetch(telegramSendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      ...(shopSlug ? { shopSlug } : {}),
      ...buildTelegramEditMessagePayload({
        chatId,
        messageId: messageRef.messageId,
        text: message.text,
        replyMarkup: message.replyMarkup,
      }),
    }),
  });
}

export function readTelegramItemSummaryFromOrder(order: Record<string, unknown> | null | undefined): string[] {
  const raw = order?.itemsJson ?? order?.items_json ?? order?.items;
  if (!raw) return [];

  let items: unknown = raw;
  if (typeof raw === 'string') {
    try {
      items = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }

  const list = Array.isArray(items)
    ? items
    : (items && typeof items === 'object' ? Object.values(items as Record<string, unknown>) : []);

  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const row = item as Record<string, unknown>;
      const name = String(row.name || row.productName || '').trim();
      const subName = String(row.subName || '').trim();
      const quantity = Number(row.quantity || row.qty || 0);
      const price = Number(row.price || 0);
      const title = name && subName ? `${name} / ${subName}` : (name || subName);
      if (!title || !Number.isFinite(quantity) || quantity <= 0) return '';
      const priceLabel = Number.isFinite(price) && price > 0 ? ` · ${price} RSD` : '';
      return `${title} x${quantity}${priceLabel}`;
    })
    .filter(Boolean);
}

export async function writeOrderDispatchRemarks(
  request: Request,
  apiBaseUrl: string,
  orderId: string,
  remarksJson: string,
): Promise<boolean> {
  const parsedRemarks = parseJsonValue(remarksJson);
  const remarks = Array.isArray(parsedRemarks) ? parsedRemarks : [];
  const upstream = await fetch(`${apiBaseUrl}/api/admin/orders/remarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      orderId,
      remarks,
    }),
  });
  const text = await upstream.text();
  const payload = readJsonObject(text) || {};
  return upstream.ok && payload.success !== false;
}
