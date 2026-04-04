import { buildContactableRiderRows } from '../../lib/rider-dispatch.ts';

type TelegramNotificationDiagnostics = {
  success?: boolean;
  error?: unknown;
  chatId?: unknown;
  chatIdSource?: unknown;
  shopSlug?: unknown;
};

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

export async function assignRider(orderId: string, riderId: string, input: { shopSlug?: string; pickupEtaMinutes?: number; riderTelegramChatId?: string; debugTelegram?: boolean } = {}) {
  const res = await fetch('/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId,
      riderId,
      shopSlug: input.shopSlug || '',
      pickupEtaMinutes: Number(input.pickupEtaMinutes || 0),
      riderTelegramChatId: String(input.riderTelegramChatId || '').trim(),
      debugTelegram: input.debugTelegram === true,
    }),
  });

  const data = await res.json().catch(() => ({}));
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
    setTimeout(() => location.reload(), 1500);
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
    updateOrderStatus: window.updateOrderStatus,
    refreshOrderList: window.refreshOrderList,
    markPaid: window.markPaid,
  });

  window.dispatchEvent(new CustomEvent("admin:handlers-registered"));
}
