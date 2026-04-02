
import { registerAdminGlobal, showAdminToast } from './globals';
import { fetchAvailableRiders, assignRider, autoAssignRider } from './orders';

const DELIVERY_ETA_OPTIONS = [10, 15, 20, 30, 45];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}


function readAssignContext(orderId: string) {
  const hidden = document.querySelector(`.hidden-data[data-order-id="${orderId}"]`) as HTMLElement | null
    || document.querySelector(`.hidden-data[data-oid="${orderId}"]`) as HTMLElement | null;
  const runtime = (window as typeof window & {
    __adminRuntime?: { shopSlug?: string };
    __adminDispatchCursor?: Record<string, string>;
  }).__adminRuntime;
  const cursorStore = ((window as typeof window & { __adminDispatchCursor?: Record<string, string> }).__adminDispatchCursor ||= {});
  const shopSlug = String(runtime?.shopSlug || '').trim();
  const lastAssignedRiderId = String(cursorStore[shopSlug] || '').trim();
  return {
    shopSlug,
    lastAssignedRiderId,
    hidden,
    cursorStore,
  };
}

function pickDispatchEtaMinutes() {
  const selected = prompt(`请选择预计取餐时间：\n${DELIVERY_ETA_OPTIONS.map((m, idx) => `${idx + 1}. ${m} 分钟`).join('\n')}\n\n请输入序号`);
  if (!selected) return 0;
  return DELIVERY_ETA_OPTIONS[Number(selected) - 1] || 0;
}

registerAdminGlobal('assign-rider', async (el: HTMLElement) => {
  const orderId = String(el?.dataset?.orderId || '').trim();
  if (!orderId) return;

  try {
    const pickupEtaMinutes = pickDispatchEtaMinutes();
    if (!pickupEtaMinutes) {
      showAdminToast('请选择预计取餐时间');
      return;
    }

    const riders = await fetchAvailableRiders();
    if (riders.length === 0) {
      showAdminToast('当前无可接单骑手');
      return;
    }

    const lines = riders.map((rider, idx) => `${idx + 1}. ${rider.name} (${rider.phone})`);
    const selected = prompt(`选择要指派的骑手：\n${lines.join('\n')}\n\n请输入序号`);
    if (!selected) return;

    const target = riders[Number(selected) - 1];
    if (!target) {
      showAdminToast('序号无效');
      return;
    }

    const { shopSlug, cursorStore } = readAssignContext(orderId);
    await assignRider(orderId, String(target.id || ''), { shopSlug, pickupEtaMinutes });
    if (shopSlug) cursorStore[shopSlug] = String(target.id || '').trim();
  } catch (error) {
    showAdminToast(getErrorMessage(error, '指派骑手失败'));
  }
}, false);

registerAdminGlobal('auto-assign-rider', async (el: HTMLElement) => {
  const orderId = String(el?.dataset?.orderId || '').trim();
  if (!orderId) return;

  try {
    const pickupEtaMinutes = pickDispatchEtaMinutes();
    if (!pickupEtaMinutes) {
      showAdminToast('请选择预计取餐时间');
      return;
    }

    const { shopSlug, lastAssignedRiderId } = readAssignContext(orderId);
    await autoAssignRider(orderId, { shopSlug, lastAssignedRiderId, pickupEtaMinutes });
  } catch (error) {
    showAdminToast(getErrorMessage(error, '自动派单失败'));
  }
}, false);

export async function updateOrderStatus(orderId: string | number, status: string, driverInfo: any = null) {
  try {
    const payload: any = { status };
    if (driverInfo) {
      payload.courierName = driverInfo.name;
      payload.courierPhone = driverInfo.phone;
    }
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast("状态已更新");
      setTimeout(() => location.reload(), 1000);
    } else {
      showAdminToast("更新失败: " + data.error);
    }
  } catch (e) {
    showAdminToast("网络错误");
  }
}

export async function markPaid(orderId: string | number) {
  if (!confirm("确定标记为已支付吗？")) return;
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast("标记成功");
      setTimeout(() => location.reload(), 1000);
    } else {
      showAdminToast("操作失败: " + data.error);
    }
  } catch (e) {
    showAdminToast("网络错误");
  }
}
