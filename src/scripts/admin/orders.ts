import { buildContactableRiderRows } from '../../lib/rider-dispatch.ts';

export async function fetchAvailableRiders() {
  const res = await fetch('/api/rider/status?action=list_available');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'load riders failed');
  }

  const rows = Array.isArray(data?.riders) ? data.riders : [];
  return buildContactableRiderRows(rows);
}

export async function assignRider(orderId: string, riderId: string, input: { shopSlug?: string; pickupEtaMinutes?: number } = {}) {
  const res = await fetch('/api/admin/rider-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'manual_assign',
      orderId,
      riderId,
      shopSlug: input.shopSlug || '',
      pickupEtaMinutes: Number(input.pickupEtaMinutes || 0),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'assign rider failed');
  }
  if (data?.telegram_notification?.success === false) {
    const detail = String(data?.telegram_notification?.error || 'telegram notify failed').trim();
    throw new Error(detail || 'telegram notify failed');
  }

  if (window.showToast) window.showToast('已指派骑手');
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
