import { buildContactableRiderRows } from '../../lib/rider-dispatch.ts';
import {
  formatPickupEtaLabel,
  getAdminDeliveryActionFlags,
  getAdminDispatchStatusCopy,
  isAdminActiveDeliveryStatus,
  isAwaitingCourierOrder,
  readDispatchMetaFromRemarks,
} from '../../lib/rider-dispatch.ts';
import {
  formatHHmm,
  normalizeJSONString,
  normalizeRemarkJSONString,
  parseDBDateMs,
} from '../../lib/admin-dashboard-utils.ts';
import { getAdminHandler } from './globals.ts';

type TelegramNotificationDiagnostics = {
  success?: boolean;
  error?: unknown;
  chatId?: unknown;
  chatIdSource?: unknown;
  shopSlug?: unknown;
};

type AdminOrderRow = {
  id?: string | number;
  orderNo?: string | number;
  orderType?: string;
  itemsJson?: string;
  remarksJson?: string;
  totalAmount?: string | number;
  tableInfo?: string;
  status?: string;
  userPhone?: string;
  scheduledFor?: string;
  pickupEtaMinutes?: string | number;
  pickupReadyAt?: string;
  riderBroadcastedAt?: string;
  riderRemindCount?: string | number;
  riderLastRemindedAt?: string;
  riderContactAttemptedAt?: string;
  courierName?: string;
  courierPhone?: string;
  createdAt?: string;
  isDeleted?: string | number;
};

const ASSIGN_RIDER_REQUEST_TIMEOUT_MS = 15000;
let latestLoadOrdersRequestId = 0;

export async function fetchAvailableRiders() {
  const res = await fetch('/api/rider/status?action=list_available');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'load riders failed');
  }

  const rows = Array.isArray(data?.riders) ? data.riders : [];
  return buildContactableRiderRows(rows);
}

function toDatasetValue(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

function normalizeOrderTypeToken(value: unknown): 'delivery' | 'dine_in' | '' {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'delivery') return 'delivery';
  if (token === 'dine_in') return 'dine_in';
  return '';
}

function normalizeStatusToken(value: unknown): 'pending' | 'confirmed' | 'awaiting_courier' | 'delivering' | 'picked_up' | 'completed' | 'cancelled' {
  const token = String(value || '').trim().toLowerCase();
  switch (token) {
    case 'pending':
    case 'confirmed':
    case 'awaiting_courier':
    case 'delivering':
    case 'picked_up':
    case 'completed':
    case 'cancelled':
      return token;
    default:
      return 'pending';
  }
}

function hasDeliverySignals(row: AdminOrderRow): boolean {
  if (String(row.courierName || '').trim()) return true;
  if (String(row.courierPhone || '').trim()) return true;
  if (String(row.riderBroadcastedAt || '').trim()) return true;
  if (String(row.pickupReadyAt || '').trim()) return true;
  if (Number(row.pickupEtaMinutes || 0) > 0) return true;
  const status = normalizeStatusToken(row.status);
  return status === 'awaiting_courier' || status === 'delivering' || status === 'picked_up';
}

function isDeliveryOrder(row: AdminOrderRow): boolean {
  const orderType = normalizeOrderTypeToken(row.orderType);
  if (orderType === 'delivery') return true;
  if (orderType === 'dine_in') return false;
  return hasDeliverySignals(row);
}

function normalizeAdminOrdersPayload(data: unknown): AdminOrderRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row: unknown) => {
    const source = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const tableInfo = String(source.tableInfo || '').trim();
    return {
      ...source,
      id: source.id,
      orderNo: source.orderNo ?? source.id,
      orderType: source.orderType ?? (tableInfo ? 'dine_in' : ''),
      status: source.status ?? (tableInfo ? 'pending' : ''),
      totalAmount: source.totalAmount ?? 0,
      itemsJson: normalizeJSONString(source.itemsJson, '[]'),
      remarksJson: normalizeRemarkJSONString(source.remarksJson),
      tableInfo,
      userPhone: source.userPhone ?? '',
      scheduledFor: source.scheduledFor ?? '',
      pickupEtaMinutes: source.pickupEtaMinutes ?? 0,
      pickupReadyAt: source.pickupReadyAt ?? '',
      riderBroadcastedAt: source.riderBroadcastedAt ?? '',
      riderRemindCount: source.riderRemindCount ?? 0,
      riderLastRemindedAt: source.riderLastRemindedAt ?? '',
      riderContactAttemptedAt: source.riderContactAttemptedAt ?? '',
      courierName: source.courierName ?? '',
      courierPhone: source.courierPhone ?? '',
      createdAt: source.createdAt ?? '',
      isDeleted: source.isDeleted ?? 0,
    } satisfies AdminOrderRow;
  });
}

function replaceHiddenOrderData(rows: AdminOrderRow[]) {
  if (typeof document === 'undefined') return;

  const next = rows.map((row) => ({
    orderId: toDatasetValue(row.id),
    oid: toDatasetValue(row.id),
    orderNo: toDatasetValue(row.orderNo),
    items: toDatasetValue(row.itemsJson),
    remarks: toDatasetValue(row.remarksJson),
    total: toDatasetValue(row.totalAmount),
    table: toDatasetValue(row.tableInfo),
    status: toDatasetValue(row.status),
    userPhone: toDatasetValue(row.userPhone),
    scheduledFor: toDatasetValue(row.scheduledFor),
    riderBroadcastedAt: toDatasetValue(row.riderBroadcastedAt),
    riderRemindCount: toDatasetValue(row.riderRemindCount),
    courierName: toDatasetValue(row.courierName),
    courierPhone: toDatasetValue(row.courierPhone),
  }));

  const existing = document.querySelectorAll('.hidden-data') as ArrayLike<{ dataset?: Record<string, string> }>;
  if (existing.length > 0) {
    next.forEach((dataset, index) => {
      const target = existing[index];
      if (target?.dataset) {
        Object.keys(target.dataset).forEach((key) => delete target.dataset?.[key]);
        Object.assign(target.dataset, dataset);
      }
    });
    return;
  }

  const hiddenHost = document.querySelector?.('div[aria-hidden="true"]') as { innerHTML?: string } | null;
  if (!hiddenHost) return;
  hiddenHost.innerHTML = next.map((dataset) => {
    const attrs = Object.entries(dataset)
      .map(([key, value]) => ` data-${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}="${String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
      .join('');
    return `<span class="hidden-data"${attrs}></span>`;
  }).join('');
}

function parseOrderItems(itemsJson: string | undefined): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(String(itemsJson || '[]'));
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
    return [];
  } catch {
    return [];
  }
}

function formatScheduledLabel(value: string | undefined): string {
  const ms = parseDBDateMs(value);
  if (!ms) return '';
  return new Date(ms).toLocaleString('sr-RS', {
    timeZone: 'Europe/Belgrade',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDecisionTime(value: string | undefined): string {
  return parseDBDateMs(value) > 0 ? formatHHmm(value) : String(value || '').trim();
}

function renderDeliveryOrderList(rows: AdminOrderRow[]) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('delivery-list-container');
  if (!container) return;

  const activeRows = rows
    .filter((row) => isDeliveryOrder(row) && Number(row.isDeleted || 0) !== 1 && isAdminActiveDeliveryStatus(normalizeStatusToken(row.status)))
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

  if (activeRows.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:#999; background:#fff; border-radius:8px; border:1px dashed #ddd;">暂无进行中的外卖订单</div>';
    return;
  }

  container.innerHTML = activeRows.map((row) => {
    const orderId = toDatasetValue(row.id);
    const orderNo = toDatasetValue(row.orderNo || row.id);
    const pickupNo = orderNo.slice(-3);
    const displayPrefix = orderNo.slice(0, Math.max(0, orderNo.length - pickupNo.length));
    const items = parseOrderItems(row.itemsJson);
    const dispatchMeta = readDispatchMetaFromRemarks(String(row.remarksJson || ''));
    const lastRiderDecision = dispatchMeta.lastRiderDecision;
    const riderDeclinedAwaitingCourier = isAwaitingCourierOrder({ status: row.status }) && lastRiderDecision?.action === 'declined';
    const statusToken = normalizeStatusToken(row.status);
    const statusCopy = riderDeclinedAwaitingCourier ? '骑手已拒单' : getAdminDispatchStatusCopy(statusToken);
    const deliveryActionFlags = getAdminDeliveryActionFlags(statusToken);
    const scheduledLabel = formatScheduledLabel(row.scheduledFor);
    const pickupEtaLabel = formatPickupEtaLabel(Number(row.pickupEtaMinutes || 0));
    const createdAtLabel = formatHHmm(row.createdAt);
    const itemsHtml = items.map((item: Record<string, unknown>) => {
      const name = escapeHtml(item?.name || '');
      const subName = escapeHtml(String(item?.subName || '').trim());
      const quantity = escapeHtml(item?.quantity ?? '');
      return `<span style="display:inline-block; margin-right:10px; font-size:13px; color:#333; background:#f5f5f5; padding:2px 6px; border-radius:4px; margin-bottom:4px;">${name}${subName ? `<span style="color:#666; font-size:12px; margin-left:4px;">(${subName})</span>` : ''}<span style="color:#d32f2f; font-weight:bold; margin-left:4px;">x${quantity}</span></span>`;
    }).join('');
    const feedbackHtml = riderDeclinedAwaitingCourier && lastRiderDecision
      ? `<div class="order-address-row" style="margin-top:6px; color:#6b7280; font-size:13px;">骑手反馈：${escapeHtml(String(lastRiderDecision.riderName || ''))}已拒单 ${escapeHtml(formatDecisionTime(lastRiderDecision.at))}</div>`
      : '';

    const safeOrderTime = escapeAttr(parseDBDateMs(row.createdAt) || Number(row.id || 0));
    const safeDisplayPrefix = escapeHtml(displayPrefix);
    const safePickupNo = escapeHtml(pickupNo);
    const safeCreatedAtLabel = escapeHtml(createdAtLabel);
    const safeTableInfo = escapeHtml(toDatasetValue(row.tableInfo));
    const safeUserPhone = escapeHtml(toDatasetValue(row.userPhone) || '-');
    const safeScheduledLabel = escapeHtml(scheduledLabel);
    const safePickupEtaLabel = escapeHtml(pickupEtaLabel);
    const safeOrderIdAttr = escapeAttr(orderId);
    const safeStatusClass = `status-${statusToken}`;
    const safeStatusCopy = escapeHtml(statusCopy);
    const safeCourierName = escapeHtml(toDatasetValue(row.courierName) || toDatasetValue(row.courierPhone) || '未命名骑手');
    const safePhoneAttr = escapeAttr(toDatasetValue(row.userPhone));
    const safeAmount = escapeHtml(toDatasetValue(row.totalAmount));

    return `<div class="order-card delivery-card-active" style="border-left: 5px solid #ff9800;" data-order-time="${safeOrderTime}"><div class="order-header"><span class="order-type-tag delivery">外卖</span><span class="order-no">#${safeDisplayPrefix}<span style="color:#d32f2f; font-weight:bold;">${safePickupNo}</span></span><span style="margin-left:10px; background:#e3f2fd; color:#1565c0; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:bold;">取餐号: ${safePickupNo}</span><span class="order-time" style="margin-left:auto;">${safeCreatedAtLabel}</span></div><div class="order-address-row" style="margin-top:0; margin-bottom:10px; font-weight:bold; font-size:14px;">📍 ${safeTableInfo}<span style="font-weight:normal; color:#666; margin-left:10px;">(Tel: ${safeUserPhone})</span></div>${scheduledLabel ? `<div class="order-address-row" style="margin-top:-4px; margin-bottom:10px; color:#1565c0; font-size:13px;">⏰ 预约送达: ${safeScheduledLabel}</div>` : ''}<div class="order-items-list">${itemsHtml}</div>${isAwaitingCourierOrder({ status: row.status }) && pickupEtaLabel ? `<div class="order-address-row" style="margin-top:6px; color:#7c3aed; font-weight:700;">${safePickupEtaLabel}</div>` : ''}<div class="order-footer" style="margin-top:10px; padding-top:10px; border-top:1px dashed #eee;"><div class="footer-left"><span class="status-tag ${safeStatusClass}">${safeStatusCopy}</span>${deliveryActionFlags.canAssign ? `<button class="btn-xs" type="button" data-admin-action="assign-rider" data-order-id="${safeOrderIdAttr}" style="background:#7c3aed; color:white;">👤 指派骑手</button><button class="btn-xs" type="button" data-admin-action="auto-assign-rider" data-order-id="${safeOrderIdAttr}" style="background:#0f766e; color:white;">🔁 自动派单</button><button class="btn-xs" type="button" data-admin-action="mark-paid" data-order-id="${safeOrderIdAttr}" style="background:#4caf50; color:white;">💰 结账</button><button class="btn-xs" type="button" data-admin-action="open-reject" data-order-id="${safeOrderIdAttr}" style="background:#f44336; color:white;">❌ 拒绝</button>` : ''}${deliveryActionFlags.canMarkPickedUp ? `<button class="btn-xs" type="button" data-admin-action="mark-picked-up" data-order-id="${safeOrderIdAttr}" style="background:#2563eb; color:white;">✅ 已取餐</button>` : ''}${deliveryActionFlags.canMarkDelivered ? `<button class="btn-xs" type="button" data-admin-action="mark-delivered" data-order-id="${safeOrderIdAttr}" style="background:#16a34a; color:white;">✅ 确认送达</button>` : ''}${deliveryActionFlags.showAssignedRider ? `<span style="font-size:12px; color:#7c2d12; font-weight:700;">已指派骑手：${safeCourierName}</span>` : ''}${toDatasetValue(row.userPhone) ? `<button type="button" data-admin-action="open-chat" data-phone="${safePhoneAttr}" title="发消息" style="height:24px; width:24px; font-size:12px; background:#0891b2; color:#fff; border:none; border-radius:4px; cursor:pointer;">💬</button>` : ''}${deliveryActionFlags.canEdit ? `<button type="button" class="btn-action" data-admin-action="edit-order" data-order-id="${safeOrderIdAttr}" title="编辑" style="height:24px; width:24px; font-size:12px;">✏️</button>` : ''}<button type="button" class="btn-action" data-admin-action="print-order" data-order-id="${safeOrderIdAttr}" title="打印" style="height:24px; width:24px; font-size:12px;">🖨️</button></div><div class="footer-right"><span class="order-amount">${safeAmount} RSD</span></div></div>${feedbackHtml}</div>`;
  }).join('');
}

function renderAdminOrderList(rows: AdminOrderRow[]) {
  if (typeof document === 'undefined') return;
  const tabOrders = document.getElementById('tab-orders');
  const list = tabOrders?.querySelector?.('.order-list') as { innerHTML?: string } | null;
  if (!list) return;

  const visibleRows = rows
    .filter((row) => Number((row as any)?.isDeleted || 0) !== 1)
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

  list.innerHTML = visibleRows.map((row) => {
    const orderId = toDatasetValue(row.id);
    const isDelivery = isDeliveryOrder(row);
    const orderTypeClass = isDelivery ? 'delivery' : 'dine';
    const orderTypeLabel = isDelivery ? '外卖' : '堂食';
    const statusToken = normalizeStatusToken(row.status);
    const items = parseOrderItems(row.itemsJson);
    const dispatchMeta = readDispatchMetaFromRemarks(String(row.remarksJson || ''));
    const lastRiderDecision = dispatchMeta.lastRiderDecision;
    const scheduledLabel = formatScheduledLabel(row.scheduledFor);
    const pickupEtaLabel = formatPickupEtaLabel(Number(row.pickupEtaMinutes || 0));
    const feedbackHtml = isDelivery && lastRiderDecision
      ? `<div class="order-address-row" style="margin-top:4px; color:#6b7280;">骑手反馈：${escapeHtml(String(lastRiderDecision?.riderName || ''))}${lastRiderDecision?.action === 'declined' ? '已拒单' : '已接单'} ${escapeHtml(formatDecisionTime(lastRiderDecision?.at))}</div>`
      : '';
    const itemsHtml = items.map((item: Record<string, unknown>) => `<div class="order-item-row"><span class="item-name">${escapeHtml(String(item?.name || ''))}</span><span class="item-subname">${escapeHtml(String(item?.subName || ''))}</span><span class="item-price">${escapeHtml(String(item?.price || ''))}</span><span class="item-qty">x${escapeHtml(String(item?.quantity ?? ''))}</span></div>`).join('');

    const safeOrderTime = escapeAttr(parseDBDateMs(row.createdAt) || Number(row.id || 0));
    const safeOrderIdAttr = escapeAttr(orderId);
    const safeOrderNo = escapeHtml(toDatasetValue(row.orderNo || row.id));
    const safePickupNo = escapeHtml(toDatasetValue(row.orderNo || row.id).slice(-3));
    const safeOrderTimeLabel = escapeHtml(formatHHmm(row.createdAt));
    const safeStatusClass = `status-${statusToken}`;
    const safeStatusCopy = escapeHtml(getAdminDispatchStatusCopy(statusToken));
    const safePhoneAttr = escapeAttr(toDatasetValue(row.userPhone));
    const safeAmount = escapeHtml(toDatasetValue(row.totalAmount));
    const safeAddress = escapeHtml(toDatasetValue(row.tableInfo));
    const safePickupEtaLabel = escapeHtml(pickupEtaLabel);
    const safeScheduledLabel = escapeHtml(scheduledLabel);

    return `<div class="order-card" data-order-time="${safeOrderTime}" data-oid="${safeOrderIdAttr}"><div class="order-header"><span class="order-type-tag ${orderTypeClass}">${orderTypeLabel}</span><div style="display:flex; flex-direction:column; margin-left:10px;"><span class="order-no" style="font-size:12px; color:#999;">#${safeOrderNo}</span><span style="font-weight:bold; color:#333; font-size:12px;">取餐号: <span style="color:#d32f2f; font-size:16px;">${safePickupNo}</span></span></div><span class="order-time" style="margin-left:auto;">${safeOrderTimeLabel}</span></div><div class="order-items-list">${itemsHtml}</div><div class="order-footer"><div class="footer-left" style="display:flex; gap:5px; align-items:center;"><span class="status-tag ${safeStatusClass}">${safeStatusCopy}</span>${toDatasetValue(row.userPhone) ? `<button type="button" data-admin-action="open-chat" data-phone="${safePhoneAttr}" title="发消息" style="height:24px; width:24px; font-size:12px; background:#0891b2; color:#fff; border:none; border-radius:4px; cursor:pointer;">💬</button>` : ''}<button type="button" class="btn-action" data-admin-action="print-order" data-order-id="${safeOrderIdAttr}" title="打印" style="height:24px; width:24px; font-size:12px;">🖨️</button></div><div class="footer-right"><span class="order-amount">${safeAmount} RSD</span></div></div>${isDelivery ? `<div class="order-address-row">地址: ${safeAddress}</div>` : ''}${isDelivery && isAwaitingCourierOrder({ status: row.status }) && pickupEtaLabel ? `<div class="order-address-row" style="margin-top:6px; color:#7c3aed; font-weight:700;">${safePickupEtaLabel}</div>` : ''}${isDelivery && scheduledLabel ? `<div class="order-address-row" style="margin-top:4px; color:#1565c0;">预约送达: ${safeScheduledLabel}</div>` : ''}${feedbackHtml}</div>`;
  }).join('');
}

export async function loadOrders() {
  const requestId = ++latestLoadOrdersRequestId;
  const res = await fetch('/api/admin/orders');
  const data = await res.json().catch(() => ([]));
  if (!res.ok) {
    throw new Error('load orders failed');
  }
  if (requestId !== latestLoadOrdersRequestId) {
    return;
  }

  const rows = normalizeAdminOrdersPayload(data);
  replaceHiddenOrderData(rows);
  renderDeliveryOrderList(rows);
  renderAdminOrderList(rows);
}

export async function assignRider(orderId: string, riderId: string, input: { shopSlug?: string; pickupEtaMinutes?: number; riderTelegramChatId?: string; telegramBotToken?: string } = {}) {
  window.__adminAssignInFlight = true;
  window.__adminPendingOrderRefresh = false;

  let res: Response;
  let flushedDeferredRefresh = false;
  let assignError: Error | null = null;
  const controller = new AbortController();
  try {
    const timeoutId = setTimeout(() => controller.abort('request timeout'), ASSIGN_RIDER_REQUEST_TIMEOUT_MS);
    res = await fetch('/api/admin/rider-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_assign',
        orderId,
        riderId,
        shopSlug: input.shopSlug || '',
        pickupEtaMinutes: Number(input.pickupEtaMinutes || 0),
        riderTelegramChatId: String(input.riderTelegramChatId || '').trim(),
        telegramBotToken: String(input.telegramBotToken || '').trim(),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'assign rider failed';
    const normalizedDetail = controller.signal.aborted && String(detail || '').trim() === 'Failed to fetch'
      ? 'request timeout'
      : (detail || 'assign rider failed');
    assignError = new Error(normalizedDetail || 'assign rider failed');
  } finally {
    window.__adminAssignInFlight = false;
    if (window.__adminPendingOrderRefresh) {
      window.__adminPendingOrderRefresh = false;
      flushedDeferredRefresh = true;
    }
  }

  if (assignError) {
    if (flushedDeferredRefresh) {
      const refreshOrderList = window.refreshOrderList;
      if (typeof refreshOrderList === 'function') refreshOrderList();
    }
    throw assignError;
  }

  const responseText = await res.text().catch(() => '');

  let data: Record<string, unknown> = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok || data?.success === false) {
    const detail = String(data?.error || 'assign rider failed').trim() || 'assign rider failed';
    throw new Error(detail);
  }

  const diagnostics = data?.telegram_notification as TelegramNotificationDiagnostics | undefined;
  if (diagnostics?.success === false) {
    const detail = String(diagnostics.error || 'telegram notify failed').trim();
    throw new Error(detail || 'telegram notify failed');
  }

  if (window.showToast) {
    window.showToast('已指派骑手');
  }
  if (window.refreshOrderList) window.refreshOrderList();
}

export async function autoAssignRider(orderId: string, input: { shopSlug?: string; pickupEtaMinutes?: number } = {}) {
  const res = await fetch('/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'auto_assign',
      orderId,
      shopSlug: input.shopSlug || '',
      pickupEtaMinutes: Number(input.pickupEtaMinutes || 0),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'auto assign rider failed');
  }
  if (data?.telegram_notification?.success === false) {
    const detail = String(data?.telegram_notification?.error || 'telegram notify failed').trim();
    throw new Error(detail || 'telegram notify failed');
  }

  if (window.showToast) window.showToast('已自动派单');
  if (window.refreshOrderList) window.refreshOrderList();
}

if (typeof window !== "undefined") {
  const registry = (window.__adminHandlers ||= {});


  window.updateOrderStatus = async function (
    orderId: string | number,
    status: string,
    driverInfo: { name: string; phone: string } | null = null,
  ) {
    try {
      const payload: any = { status };
      if (driverInfo) {
        payload.courierName = driverInfo.name;
        payload.courierPhone = driverInfo.phone;
      }

      const res = await fetch(`/api/admin/orders/${encodeURIComponent(String(orderId))}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (window.showToast) window.showToast("订单状态已更新");
        if (window.refreshOrderList) window.refreshOrderList();
        else location.reload();
      } else {
        alert("Update failed: " + (data.error || "unknown error"));
      }
    } catch (e) {
      alert("Network error");
    }
  };

  window.refreshOrderList = function () {
    if (window.__adminAssignInFlight) {
      window.__adminPendingOrderRefresh = true;
      return;
    }
    const loadOrders = getAdminHandler<() => void>('loadOrders');
    if (typeof loadOrders === 'function') {
      loadOrders();
      return;
    }
    location.reload();
  };

  window.markPaid = async function (orderId: string | number) {
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(String(orderId))}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        if (window.showToast) window.showToast("结账成功");
        if (window.refreshOrderList) window.refreshOrderList();
        else location.reload();
      } else {
        alert("操作失败: " + (data.error || "unknown error"));
      }
    } catch {
      alert("Network error");
    }
  };

  Object.assign(registry, {
    loadOrders,
    updateOrderStatus: window.updateOrderStatus,
    refreshOrderList: window.refreshOrderList,
    markPaid: window.markPaid,
  });

  window.dispatchEvent(new CustomEvent("admin:handlers-registered"));
}
