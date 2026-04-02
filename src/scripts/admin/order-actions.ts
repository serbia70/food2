
import { registerAdminGlobal, showAdminToast } from './globals';
import { fetchAvailableRiders, publishRiderDispatch, remindRiders, assignRider, autoAssignRider } from './orders';

const DELIVERY_ETA_OPTIONS = [10, 15, 20, 30, 45];

// ================== Delivery Modal Logic ==================

export function openDeliveryModal(orderId: string) {
  const modal = document.getElementById('delivery-modal');
  const listEl = document.getElementById('driver-select-list');
  if (!modal || !listEl) return;

  modal.dataset.orderId = orderId;
  modal.dataset.etaMinutes = '';
  listEl.replaceChildren();

  DELIVERY_ETA_OPTIONS.forEach((minutes, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'driver-option';
    option.dataset.etaMinutes = String(minutes);
    option.textContent = `${minutes} 分钟`;
    option.style.width = '100%';
    option.style.padding = '10px';
    option.style.border = '1px solid #eee';
    option.style.borderRadius = '6px';
    option.style.cursor = 'pointer';
    option.style.background = '#fff';
    option.style.marginBottom = '8px';
    option.addEventListener('click', () => {
      modal.dataset.etaMinutes = String(minutes);
      listEl.querySelectorAll('[data-eta-minutes]').forEach((node) => {
        const item = node as HTMLElement;
        item.style.background = '#fff';
        item.style.borderColor = '#eee';
      });
      option.style.background = '#eef2ff';
      option.style.borderColor = '#6366f1';
    });

    listEl.appendChild(option);
    if (index === 1) option.click();
  });

  modal.style.display = 'flex';
}

export function closeDeliveryModal() {
  const modal = document.getElementById('delivery-modal');
  if (modal) {
    modal.style.display = 'none';
    delete modal.dataset.orderId;
    delete modal.dataset.etaMinutes;
  }
}

// Expose helper for onclick selection
registerAdminGlobal('selectDriver', (idx: number) => {
  const modal = document.getElementById('delivery-modal');
  const listEl = document.getElementById('driver-select-list');
  if (!modal || !listEl) return;

  const options = listEl.querySelectorAll('[data-eta-minutes]');
  const target = options[idx] as HTMLElement | undefined;
  if (!target) return;
  target.click();
});

export async function confirmDelivery() {
  const modal = document.getElementById('delivery-modal');
  if (!modal || !modal.dataset.orderId) return;

  const etaMinutes = Number(modal.dataset.etaMinutes || 0);
  if (!etaMinutes) {
    showAdminToast('请选择预计取餐时间');
    return;
  }

  try {
    await publishRiderDispatch(modal.dataset.orderId, etaMinutes);
    closeDeliveryModal();
  } catch (error: any) {
    showAdminToast(error?.message || '发布失败');
  }
}

function getReminderCountFromDataset(orderId: string): number {
  const candidates = [
    document.querySelector(`.order-card[data-oid="${orderId}"]`) as HTMLElement | null,
    document.querySelector(`.hidden-data[data-oid="${orderId}"]`) as HTMLElement | null,
    document.querySelector(`.hidden-data[data-order-id="${orderId}"]`) as HTMLElement | null,
  ];

  for (const node of candidates) {
    const raw = String(node?.dataset?.riderRemindCount || '').trim();
    if (!raw) continue;
    const count = Number(raw);
    if (Number.isFinite(count) && count >= 0) return Math.floor(count);
  }

  return 0;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export async function remindAwaitingOrder(orderId: string) {
  if (!orderId) return;
  const riderRemindCount = getReminderCountFromDataset(orderId);

  try {
    await remindRiders(orderId, { riderRemindCount });
  } catch (error: unknown) {
    showAdminToast(getErrorMessage(error, '提醒失败'));
  }
}

export async function contactRidersForOrder(orderId: string) {
  if (!orderId) return;

  try {
    const riders = await fetchAvailableRiders();
    const hasRiders = riders.length > 0;
    const selection = prompt(hasRiders
      ? '输入 1 再次提醒骑手；输入 2 联系在线骑手。'
      : '当前无可联系骑手。输入 1 再次提醒骑手。');
    if (!selection) return;

    if (selection.trim() === '1') {
      await remindAwaitingOrder(orderId);
      return;
    }

    if (!hasRiders) {
      showAdminToast('当前无可联系骑手，仅支持再次提醒');
      return;
    }

    if (selection.trim() !== '2') {
      showAdminToast('请输入 1 或 2');
      return;
    }

    const lines = riders.map((rider, idx) => `${idx + 1}. ${rider.name} (${rider.phone})`);
    const selected = prompt(`可联系骑手：\n${lines.join('\n')}\n\n输入序号可拨号联系，取消则不操作。`);
    if (!selected) return;

    const selectedIdx = Number(selected) - 1;
    const target = riders[selectedIdx];
    if (!target) {
      showAdminToast('序号无效');
      return;
    }

    window.location.href = `tel:${target.phone}`;
  } catch (error: unknown) {
    showAdminToast(getErrorMessage(error, '联系骑手失败'));
  }
}

registerAdminGlobal('contact-riders', async (el: HTMLElement) => {
  const orderId = String(el?.dataset?.orderId || '').trim();
  await contactRidersForOrder(orderId);
}, false);

registerAdminGlobal('remind-riders', async (el: HTMLElement) => {
  const orderId = String(el?.dataset?.orderId || '').trim();
  await remindAwaitingOrder(orderId);
}, false);

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

async function pickDispatchEtaMinutes() {
  const modal = document.getElementById('delivery-modal');
  const listEl = document.getElementById('driver-select-list');
  if (!modal || !listEl) return 0;

  modal.dataset.etaMinutes = '';
  listEl.replaceChildren();

  DELIVERY_ETA_OPTIONS.forEach((minutes, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'driver-option';
    option.dataset.etaMinutes = String(minutes);
    option.textContent = `${minutes} 分钟`;
    option.style.width = '100%';
    option.style.padding = '10px';
    option.style.border = '1px solid #eee';
    option.style.borderRadius = '6px';
    option.style.cursor = 'pointer';
    option.style.background = '#fff';
    option.style.marginBottom = '8px';
    option.addEventListener('click', () => {
      modal.dataset.etaMinutes = String(minutes);
      listEl.querySelectorAll('[data-eta-minutes]').forEach((node) => {
        const item = node as HTMLElement;
        item.style.background = '#fff';
        item.style.borderColor = '#eee';
      });
      option.style.background = '#eef2ff';
      option.style.borderColor = '#6366f1';
    });

    listEl.appendChild(option);
    if (index === 1) option.click();
  });

  const selected = prompt(`请选择预计取餐时间：\n${DELIVERY_ETA_OPTIONS.map((m, idx) => `${idx + 1}. ${m} 分钟`).join('\n')}\n\n请输入序号`);
  if (!selected) return 0;
  const eta = DELIVERY_ETA_OPTIONS[Number(selected) - 1] || 0;
  if (!eta) return 0;
  modal.dataset.etaMinutes = String(eta);
  return eta;
}

registerAdminGlobal('assign-rider', async (el: HTMLElement) => {
  const orderId = String(el?.dataset?.orderId || '').trim();
  if (!orderId) return;

  try {
    const pickupEtaMinutes = await pickDispatchEtaMinutes();
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
    const pickupEtaMinutes = await pickDispatchEtaMinutes();
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
