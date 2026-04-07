import { buildContactableRiderRows } from '../../lib/rider-dispatch.ts';

type TelegramNotificationDiagnostics = {
  success?: boolean;
  error?: unknown;
  chatId?: unknown;
  chatIdSource?: unknown;
  shopSlug?: unknown;
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
    updateOrderStatus: window.updateOrderStatus,
    refreshOrderList: window.refreshOrderList,
    markPaid: window.markPaid,
  });

  window.dispatchEvent(new CustomEvent("admin:handlers-registered"));
}
