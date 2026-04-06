
import { registerAdminGlobal, showAdminToast } from './globals';
import { readDispatchMetaFromRemarks } from '../../lib/rider-dispatch.ts';
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
    __adminRuntime?: {
      shopSlug?: string;
      shopId?: string | number;
      shopName?: string;
      name?: string;
      currentSettings?: {
        telegramBotToken?: string;
        telegram_bot_token?: string;
        telegram?: { token?: string; telegramBotToken?: string };
        server?: { telegramBotToken?: string; telegram_bot_token?: string };
      };
    };
  }).__adminRuntime;
  const shopSlug = String(runtime?.shopSlug || '').trim();
  const telegramBotToken = String(
    runtime?.currentSettings?.telegramBotToken
      || runtime?.currentSettings?.telegram_bot_token
      || runtime?.currentSettings?.telegram?.token
      || runtime?.currentSettings?.telegram?.telegramBotToken
      || runtime?.currentSettings?.server?.telegramBotToken
      || runtime?.currentSettings?.server?.telegram_bot_token
      || '',
  ).trim();
  return {
    hidden,
    shopSlug,
    shopId: String(runtime?.shopId || '').trim(),
    shopName: String(runtime?.shopName || runtime?.name || '').trim(),
    telegramBotToken,
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
    const { hidden } = readAssignContext(orderId);
    const declinedRiderIds = new Set(readDispatchMetaFromRemarks(String(hidden?.dataset?.remarks || '')).declinedRiderIds);
    const riders = (await fetchAvailableRiders()).filter((rider) => !declinedRiderIds.has(String(rider.id || '').trim()));
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

    const pickupEtaMinutes = pickDispatchEtaMinutes();
    if (!pickupEtaMinutes) {
      showAdminToast('请选择预计取餐时间');
      return;
    }

    const { shopSlug, telegramBotToken } = readAssignContext(orderId);
    await assignRider(orderId, String(target.id || ''), {
      shopSlug,
      pickupEtaMinutes,
      riderTelegramChatId: String((target as { telegramChatId?: string }).telegramChatId || '').trim(),
      telegramBotToken,
      debugTelegram: true,
    });
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

    const { shopSlug } = readAssignContext(orderId);
    await autoAssignRider(orderId, { shopSlug, pickupEtaMinutes });
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
