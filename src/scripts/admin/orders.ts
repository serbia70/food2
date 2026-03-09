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
