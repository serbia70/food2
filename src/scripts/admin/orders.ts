import { buildContactableRiderRows } from '../../lib/rider-dispatch.ts';
import {
  getAdminDispatchStatusCopy,
  isAwaitingCourierOrder,
  readDispatchMetaFromRemarks,
} from '../../lib/rider-dispatch.ts';
import { normalizeJSONString, normalizeRemarkJSONString } from '../../lib/admin-dashboard-utils.ts';
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

function formatTelegramDiagnostics(notification: TelegramNotificationDiagnostics): string {
  const status = notification.success === true ? 'success' : 'failed';
  const chatId = String(notification.chatId || '-').trim() || '-';
  const source = String(notification.chatIdSource || '-').trim() || '-';
  const shop = String(notification.shopSlug || '-').trim() || '-';
  const error = String(notification.error || '').trim();
  return error
    ? `派单Telegram: ${status} chat=${chatId} source=${source} shop=${shop} error=${error}`
    : `派单Telegram: ${status} chat=${chatId} source=${source} shop=${shop}`;
}

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

function normalizeAdminOrdersPayload(data: unknown): AdminOrderRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row: any) => ({
    ...row,
    id: row?.id,
    orderNo: row?.orderNo ?? row?.order_no ?? row?.id,
    orderType: row?.orderType ?? row?.order_type ?? (String(row?.tableInfo || row?.table_info || '').trim() ? 'dine_in' : ''),
    status: row?.status ?? (String(row?.tableInfo || row?.table_info || '').trim() ? 'pending' : ''),
    totalAmount: row?.totalAmount ?? row?.total_amount ?? 0,
    itemsJson: normalizeJSONString(row?.itemsJson ?? row?.items_json, '[]'),
    remarksJson: normalizeRemarkJSONString(row?.remarksJson ?? row?.remarks_json),
    tableInfo: row?.tableInfo ?? row?.table_info ?? '',
    userPhone: row?.userPhone ?? row?.user_phone ?? '',
    scheduledFor: row?.scheduledFor ?? row?.scheduled_for ?? '',
    pickupEtaMinutes: row?.pickupEtaMinutes ?? row?.pickup_eta_minutes ?? 0,
    pickupReadyAt: row?.pickupReadyAt ?? row?.pickup_ready_at ?? '',
    riderBroadcastedAt: row?.riderBroadcastedAt ?? row?.rider_broadcasted_at ?? '',
    riderRemindCount: row?.riderRemindCount ?? row?.rider_remind_count ?? 0,
    riderLastRemindedAt: row?.riderLastRemindedAt ?? row?.rider_last_reminded_at ?? '',
    riderContactAttemptedAt: row?.riderContactAttemptedAt ?? row?.rider_contact_attempted_at ?? '',
    courierName: row?.courierName ?? row?.courier_name ?? '',
    courierPhone: row?.courierPhone ?? row?.courier_phone ?? '',
    createdAt: row?.createdAt ?? row?.created_at ?? '',
    isDeleted: row?.isDeleted ?? row?.is_deleted ?? 0,
  } satisfies AdminOrderRow));
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

function renderDeliveryOrderList(rows: AdminOrderRow[]) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('delivery-list-container');
  if (!container) return;

  const activeRows = rows
    .filter((row) => ['awaiting_courier', 'delivering', 'picked_up'].includes(String(row.status || '').trim()))
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
    const items = (() => {
      try {
        const parsed = JSON.parse(String(row.itemsJson || '[]'));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    const dispatchMeta = readDispatchMetaFromRemarks(String(row.remarksJson || ''));
    const lastRiderDecision = dispatchMeta.lastRiderDecision;
    const riderDeclinedAwaitingCourier = isAwaitingCourierOrder({ status: row.status }) && lastRiderDecision?.action === 'declined';
    const statusCopy = riderDeclinedAwaitingCourier ? '骑手已拒单' : getAdminDispatchStatusCopy(String(row.status || ''));
    const itemsHtml = items.map((item: any) => {
      const name = String(item?.name || '');
      const subName = String(item?.subName || '').trim();
      const quantity = String(item?.quantity ?? '');
      return `<span style="display:inline-block; margin-right:10px; font-size:13px; color:#333; background:#f5f5f5; padding:2px 6px; border-radius:4px; margin-bottom:4px;">${name}${subName ? `<span style="color:#666; font-size:12px; margin-left:4px;">(${subName})</span>` : ''}<span style="color:#d32f2f; font-weight:bold; margin-left:4px;">x${quantity}</span></span>`;
    }).join('');
    const feedbackHtml = riderDeclinedAwaitingCourier && lastRiderDecision
      ? `<div class="order-address-row" style="margin-top:6px; color:#6b7280; font-size:13px;">骑手反馈：${String(lastRiderDecision.riderName || '')}已拒单 ${String(lastRiderDecision.at || '')}</div>`
      : '';

    return `<div class="order-card delivery-card-active" style="border-left: 5px solid #ff9800;" data-order-time="${Date.parse(String((row as any)?.createdAt || '')) || Number(row.id || 0)}"><div class="order-header"><span class="order-type-tag delivery">外卖</span><span class="order-no">#${displayPrefix}<span style="color:#d32f2f; font-weight:bold;">${pickupNo}</span></span><span style="margin-left:10px; background:#e3f2fd; color:#1565c0; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:bold;">取餐号: ${pickupNo}</span></div><div class="order-address-row" style="margin-top:0; margin-bottom:10px; font-weight:bold; font-size:14px;">📍 ${toDatasetValue(row.tableInfo)}<span style="font-weight:normal; color:#666; margin-left:10px;">(Tel: ${toDatasetValue(row.userPhone) || '-'})</span></div><div class="order-items-list">${itemsHtml}</div><div class="order-footer" style="margin-top:10px; padding-top:10px; border-top:1px dashed #eee;"><div class="footer-left"><span class="status-tag status-${toDatasetValue(row.status || 'pending')}">${statusCopy}</span><button class="btn-action" data-admin-action="print-order" data-order-id="${orderId}" title="打印" style="height:24px; width:24px; font-size:12px;">🖨️</button></div><div class="footer-right"><span class="order-amount">${toDatasetValue(row.totalAmount)} RSD</span></div></div>${feedbackHtml}</div>`;
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
    const items = (() => {
      try {
        const parsed = JSON.parse(String(row.itemsJson || '[]'));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    const dispatchMeta = readDispatchMetaFromRemarks(String(row.remarksJson || ''));
    const lastRiderDecision = dispatchMeta.lastRiderDecision;
    const itemsHtml = items.map((item: any) => `<div class="order-item-row"><span class="item-name">${String(item?.name || '')}</span><span class="item-subname">${String(item?.subName || '')}</span><span class="item-price">${String(item?.price || '')}</span><span class="item-qty">x${String(item?.quantity ?? '')}</span></div>`).join('');
    const feedbackHtml = toDatasetValue((row as any).orderType) === 'delivery' && lastRiderDecision
      ? `<div class="order-address-row" style="margin-top:4px; color:#6b7280;">骑手反馈：${String(lastRiderDecision?.riderName || '')}${lastRiderDecision?.action === 'declined' ? '已拒单' : '已接单'} ${String(lastRiderDecision?.at || '')}</div>`
      : '';

    return `<div class="order-card" data-order-time="${Date.parse(String((row as any)?.createdAt || '')) || Number(row.id || 0)}" data-oid="${orderId}"><div class="order-header"><span class="order-type-tag ${toDatasetValue((row as any).orderType) === 'delivery' ? 'delivery' : 'dine'}">${toDatasetValue((row as any).orderType) === 'delivery' ? '外卖' : '堂食'}</span><div style="display:flex; flex-direction:column; margin-left:10px;"><span class="order-no" style="font-size:12px; color:#999;">#${toDatasetValue(row.orderNo || row.id)}</span><span style="font-weight:bold; color:#333; font-size:12px;">取餐号: <span style="color:#d32f2f; font-size:16px;">${toDatasetValue(row.orderNo || row.id).slice(-3)}</span></span></div></div><div class="order-items-list">${itemsHtml}</div><div class="order-footer"><div class="footer-left" style="display:flex; gap:5px; align-items:center;"><span class="status-tag status-${toDatasetValue(row.status || 'pending')}">${getAdminDispatchStatusCopy(toDatasetValue(row.status || ''))}</span><button class="btn-action" data-admin-action="print-order" data-order-id="${orderId}" title="打印" style="height:24px; width:24px; font-size:12px;">🖨️</button></div><div class="footer-right"><span class="order-amount">${toDatasetValue(row.totalAmount)} RSD</span></div></div>${toDatasetValue((row as any).orderType) === 'delivery' ? `<div class="order-address-row">地址: ${toDatasetValue(row.tableInfo)}</div>` : ''}${feedbackHtml}</div>`;
  }).join('');
}

export async function loadOrders() {
  const res = await fetch('/api/admin/orders');
  const data = await res.json().catch(() => ([]));
  if (!res.ok) {
    throw new Error('load orders failed');
  }

  const rows = normalizeAdminOrdersPayload(data);
  replaceHiddenOrderData(rows);
  renderDeliveryOrderList(rows);
  renderAdminOrderList(rows);
}

export async function assignRider(orderId: string, riderId: string, input: { shopSlug?: string; pickupEtaMinutes?: number; riderTelegramChatId?: string; telegramBotToken?: string; debugTelegram?: boolean } = {}) {
  if (input.debugTelegram === true && typeof alert === 'function') {
    alert('派单调试: 已进入 assignRider，准备请求 /api/admin/rider-assign');
  }

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
        debugTelegram: input.debugTelegram === true,
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
    if (input.debugTelegram === true && typeof alert === 'function') {
      alert(`派单调试: /api/admin/rider-assign 请求失败 ${normalizedDetail}`);
    }
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

  if (input.debugTelegram === true && typeof alert === 'function') {
    alert(`派单调试: /api/admin/rider-assign 已返回 ${res.status}`);
  }

  const responseText = await res.text().catch(() => '');
  if (input.debugTelegram === true && typeof alert === 'function') {
    alert(`派单调试: /api/admin/rider-assign 响应 ${responseText.slice(0, 300) || '<empty>'}`);
  }

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
    if (input.debugTelegram === true && typeof alert === 'function') alert(`派单失败: ${detail}`);
    throw new Error(detail);
  }

  const diagnostics = data?.telegram_notification as TelegramNotificationDiagnostics | undefined;
  if (input.debugTelegram === true) {
    const message = diagnostics
      ? formatTelegramDiagnostics(diagnostics)
      : '派单Telegram: missing_diagnostics';
    if (typeof alert === 'function') alert(message);
    else if (window.showToast) window.showToast(message);
  }

  if (diagnostics?.success === false) {
    const detail = String(diagnostics.error || 'telegram notify failed').trim();
    throw new Error(detail || 'telegram notify failed');
  }

  if (input.debugTelegram !== true && window.showToast) {
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
