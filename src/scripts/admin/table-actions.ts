
import { getOrdersForTable } from "./table-utils";
import { getAdminRuntimeState, showAdminToast } from './globals';

export async function performCheckout(orderIds: string[]) {
  const uniqueOrderIds = Array.from(new Set((orderIds || []).map((v) => String(v || '').trim()).filter(Boolean)));
  if (uniqueOrderIds.length === 0) return;
  if (!confirm(`确定要为选中的 ${uniqueOrderIds.length} 个订单结账吗？`)) return;
  
  const restaurantId = window.location.pathname.split("/")[2];
  try {
    const res = await fetch("/api/admin/tables/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, orderIds: uniqueOrderIds }),
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast(`结账成功：${orderIds.length} 单`);
      location.reload();
    } else {
      alert("结账失败: " + data.error);
    }
  } catch (e) {
    alert("网络错误");
  }
}

export function handleTableCheckout(tableNum: string) {
  const orders = getOrdersForTable(tableNum);
  if (orders.length === 0) {
    alert("该桌号没有活跃订单");
    return;
  }
  const orderIds = Array.from(new Set(orders.map((o) => String(o.id || '').trim()).filter(Boolean)));
  performCheckout(orderIds);
}

export async function handlePrintTable(tableNum: string) {
  try {
    const runtime = getAdminRuntimeState();
    const res = await fetch("/api/admin/reprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableNum, shopSlug: runtime.shopSlug }),
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast(`打印指令已发送: 桌号 ${tableNum}`);
    } else {
      alert("打印失败: " + data.error);
    }
  } catch (e) {
    alert("网络错误");
  }
}

export async function handlePrintOrder(orderId: string) {
  if (!orderId) return;
  try {
    const runtime = getAdminRuntimeState();
    const res = await fetch("/api/admin/reprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, shopSlug: runtime.shopSlug }),
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast(`打印指令已发送: 订单 #${orderId.slice(-4)}`);
    } else {
      alert("打印失败: " + data.error);
    }
  } catch (e) {
    alert("网络错误");
  }
}
