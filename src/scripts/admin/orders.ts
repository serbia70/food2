export async function loadOrderStats() {
  const restaurantId = window.location.pathname.split("/")[2];
  try {
    const res = await fetch("/api/admin/orders/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stats", restaurantId }),
    });
    const data = await res.json();
    if (!data.success) return;

    const completedEl = document.getElementById("completed-orders-count");
    if (completedEl) completedEl.textContent = String(data.stats?.completed || 0);

    const archivedEl = document.getElementById("archived-orders-count");
    if (archivedEl) archivedEl.textContent = String(data.stats?.archived || 0);

    const dbSizeEl = document.getElementById("db-size");
    if (dbSizeEl) dbSizeEl.textContent = "Calculating...";
  } catch (error) {
    console.error("loadOrderStats failed:", error);
  }
}

export async function archiveOldOrders() {
  const restaurantId = window.location.pathname.split("/")[2];
  const monthsInput = document.getElementById("archive-months") as HTMLInputElement | null;
  const months = Number(monthsInput?.value || 3);

  if (!confirm(`Archive completed orders older than ${months} months?`)) return;

  try {
    const res = await fetch("/api/admin/orders/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", restaurantId, months }),
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || "Archived.");
      loadOrderStats();
      return;
    }
    alert("Archive failed: " + (data.error || "unknown error"));
  } catch (error: any) {
    alert("Archive failed: " + (error?.message || error));
  }
}

import {
  buildContactableRiderRows,
  buildDispatchPublishPayload,
  buildReminderPayload,
} from '../../lib/rider-dispatch.ts';

export async function deleteArchivedOrders() {
  const restaurantId = window.location.pathname.split("/")[2];
  const password = prompt("Dangerous operation: permanently delete archived orders.\nInput admin password to continue:");
  if (!password) return;
  if (!confirm("Final confirm: permanently delete all archived orders?")) return;

  try {
    const res = await fetch("/api/admin/orders/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_archived", restaurantId }),
    });
    const data = await res.json();
    if (data.success) {
      alert((data.message || "Deleted.") + (data.backup ? `\nBackup: ${data.backup}` : ""));
      loadOrderStats();
      return;
    }
    alert("Delete failed: " + (data.error || "unknown error"));
  } catch (error: any) {
    alert("Delete failed: " + (error?.message || error));
  }
}

export async function publishRiderDispatch(orderId: string, etaMinutes: number) {
  const payload = {
    orderId,
    action: 'publish',
    ...buildDispatchPublishPayload(etaMinutes, new Date().toISOString()),
  };

  const res = await fetch('/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'dispatch publish failed');
  }

  const tg = data?.telegram_dispatch;
  if (tg && typeof tg === 'object') {
    const deliveredCount = Number(tg.deliveredCount || 0);
    const availableRiderCount = Number(tg.availableRiderCount || 0);
    const telegramBoundCount = Number(tg.telegramBoundCount || 0);
    const failedCount = Number(tg.failedCount || 0);
    const skippedReason = String(tg.skippedReason || '').trim();

    if (deliveredCount > 0) {
      const suffix = failedCount > 0 ? `，另有 ${failedCount} 人发送失败` : '';
      if (window.showToast) window.showToast(`已通知 ${deliveredCount} 位骑手${suffix}`);
    } else if (skippedReason === 'no_available_riders') {
      throw new Error('当前没有 available 骑手，未发送通知');
    } else if (skippedReason === 'no_telegram_bound_riders') {
      throw new Error(`当前有 ${availableRiderCount} 位 available 骑手，但 0 位绑定 Telegram，未发送通知`);
    } else if (skippedReason === 'missing_restaurant_id') {
      throw new Error('订单缺少店铺标识，无法生成骑手接单链接');
    } else if (skippedReason === 'missing_order_snapshot') {
      throw new Error('派单已提交，但上游未返回订单快照，无法确认通知结果');
    } else if (telegramBoundCount > 0) {
      const attempts = Array.isArray(tg.attempts) ? tg.attempts : [];
      const firstError = attempts.find((item: any) => !item?.delivered && item?.error)?.error;
      throw new Error(`已找到 ${telegramBoundCount} 位已绑定 Telegram 的骑手，但发送失败${firstError ? `：${firstError}` : ''}`);
    } else {
      throw new Error('未找到可通知的骑手');
    }
  } else {
    if (window.showToast) window.showToast('已通知骑手');
  }

  if (window.refreshOrderList) window.refreshOrderList();
  else location.reload();
}

export async function remindRiders(orderId: string, order: { rider_remind_count?: number | null } = {}) {
  const payload = {
    orderId,
    action: 'remind',
    ...buildReminderPayload(order, new Date().toISOString()),
  };

  const res = await fetch('/api/admin/rider-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'remind failed');
  }

  if (window.showToast) window.showToast('已再次提醒骑手');
  if (window.refreshOrderList) window.refreshOrderList();
  else location.reload();
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

if (typeof window !== "undefined") {
  const registry = (window.__adminHandlers ||= {});

  window.loadOrderStats = loadOrderStats;
  window.archiveOldOrders = archiveOldOrders;
  window.deleteArchivedOrders = deleteArchivedOrders;

  window.updateOrderStatus = async function (
    orderId: string | number,
    status: string,
    driverInfo: { name: string; phone: string } | null = null,
  ) {
    try {
      const payload: any = { status };
      if (driverInfo) {
        payload.courier_name = driverInfo.name;
        payload.courier_phone = driverInfo.phone;
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
    loadOrderStats,
    archiveOldOrders,
    deleteArchivedOrders,
    updateOrderStatus: window.updateOrderStatus,
    refreshOrderList: window.refreshOrderList,
    markPaid: window.markPaid,
  });

  window.dispatchEvent(new CustomEvent("admin:handlers-registered"));
}
