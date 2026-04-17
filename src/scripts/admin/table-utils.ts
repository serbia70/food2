
import { matchesTableRef, parseTableRef } from '../../lib/admin-table-ref';
import { isActiveDineInOrder } from '../../lib/admin-dashboard-utils.ts';
import { buildAdminTableOrderSummaryShared, parseOrderItemsShared } from '../../lib/order-items-shared.ts';

export function getOrdersForTable(tableNum: string) {
  const targetRef = parseTableRef(String(tableNum || ""));
  const maxConfiguredTable = Array.from(document.querySelectorAll<HTMLElement>(".table-card-wide[data-table]")).reduce((max, el) => {
    const t = String(el.dataset.table || "");
    const num = Number.parseInt((t.match(/(\d+)(?:号桌)?$/) || ["", "0"])[1], 10);
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);
  const allOrders = document.querySelectorAll<HTMLElement>(".hidden-data");
  const tableOrders: any[] = [];
  const seen = new Set<string>();
  allOrders.forEach((el) => {
    const oidRaw = String(el.dataset.oid || el.dataset.orderId || '').trim();
    if (oidRaw) {
      if (seen.has(oidRaw)) return;
      seen.add(oidRaw);
    }
    const status = el.dataset.status || "pending";
    if (!isActiveDineInOrder({ orderType: 'dine_in', status })) return;
    const tableInfo = el.dataset.table || "";
    if (matchesTableRef(targetRef, tableInfo, maxConfiguredTable)) {
      const items = parseOrderItemsShared(el.dataset.items || '[]');
      let remarks: string[] = [];
      try {
        const r = JSON.parse(el.dataset.remarks || "[]");
        remarks = Array.isArray(r) ? r : (el.dataset.remarks ? [el.dataset.remarks] : []);
      } catch (e) {}
      let time = "--:--";
      const card = el.closest(".order-card");
      if (card) {
        const timeEl = card.querySelector<HTMLElement>(".order-time");
        if (timeEl) time = timeEl.innerText;
      }
      tableOrders.push({
        id: el.dataset.oid, orderNo: el.dataset.orderNo, amount: el.dataset.total,
        items, remarks, time, summary: buildAdminTableOrderSummaryShared(el.dataset.items || '[]'),
        element: el
      });
    }
  });
  return tableOrders;
}
