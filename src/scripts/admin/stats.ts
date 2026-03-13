
export async function loadStats() {
  const start = (document.getElementById('stats-start') as HTMLInputElement)?.value;
  const end = (document.getElementById('stats-end') as HTMLInputElement)?.value;
  if (!start || !end) {
    alert('请选择日期范围 / Izaberite opseg datuma');
    return;
  }
  const type = (document.getElementById('stats-type') as HTMLSelectElement)?.value || 'all';
  try {
    const res = await fetch(
      `/api/admin/stats?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&type=${encodeURIComponent(type)}`,
    );
    let data: any;
    try {
      data = await res.json();
    } catch (err) {
      console.error('Failed to parse stats response', err);
      if (res.status === 401 || res.status === 403) {
        alert('登录已失效，请重新登录 / Sesija je istekla, prijavite se ponovo');
        window.location.href = `${window.location.pathname.replace(/\/?$/, '')}/login`;
        return;
      }
      alert('查询失败 / Neuspešan upit：响应解析失败');
      return;
    }
    if (!res.ok || data?.success === false) {
      if (res.status === 401 || res.status === 403) {
        alert('登录已失效，请重新登录 / Sesija je istekla, prijavite se ponovo');
        window.location.href = `${window.location.pathname.replace(/\/?$/, '')}/login`;
        return;
      }
      const message = data?.message ? `：${String(data.message)}` : '';
      alert(`查询失败 / Neuspešan upit${message}`);
      return;
    }
    renderStats(data);
  } catch (e: any) {
    alert('查询失败 / Neuspešan upit');
  }
}

function renderStats(data: any) {
  renderSummary(data);
  renderTopItemsTable(data);
}

function renderSummary(data: any) {
  const stats = data?.stats || {};
  const totalRevenue =
    Number(stats.totalRevenue ?? stats.total_revenue ?? data.totalRevenue ?? data.total_revenue ?? 0) || 0;
  const totalOrders =
    Number(stats.totalOrders ?? stats.total_orders ?? data.totalOrders ?? data.total_orders ?? 0) || 0;
  const revenueEl = document.getElementById('val-revenue');
  const ordersEl = document.getElementById('val-orders');
  if (revenueEl) revenueEl.textContent = String(totalRevenue);
  if (ordersEl) ordersEl.textContent = String(totalOrders);
}

function renderTopItemsTable(data: any) {
  const table = document.getElementById('stats-table') as HTMLTableElement | null;
  const tbody = table?.querySelector('tbody');
  if (!tbody) return;
  const items = data?.topItems || data?.top_items || [];
  if (!Array.isArray(items) || items.length === 0) {
    renderEmptyRow(tbody, '暂无数据 / Nema podataka');
    return;
  }
  tbody.textContent = '';
  items.forEach((item: any, idx: number) => {
    const row = document.createElement('tr');
    const name = String(item?.display_name || item?.name || '').trim() || '-';
    const count = Number(item?.count ?? 0) || 0;
    const amount = Number(item?.amount ?? 0) || 0;
    row.append(
      createCell(String(idx + 1)),
      createCell(name),
      createCell(String(count)),
      createCell(String(amount)),
    );
    tbody.appendChild(row);
  });
}

function createCell(text: string) {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

function renderEmptyRow(tbody: HTMLTableSectionElement, message: string) {
  tbody.textContent = '';
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 4;
  cell.style.textAlign = 'center';
  cell.textContent = message;
  row.appendChild(cell);
  tbody.appendChild(row);
}

function getLocalTodayISODate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function initDefaultDatesAndLoad() {
  const startInput = document.getElementById('stats-start') as HTMLInputElement | null;
  const endInput = document.getElementById('stats-end') as HTMLInputElement | null;
  if (!startInput || !endInput) return;
  
  // Only set if empty
  if (!startInput.value) {
      const today = getLocalTodayISODate();
      startInput.value = today;
      endInput.value = today;
      void loadStats();
  }
}

// Remove the auto-listener, we will call it explicitly
// document.addEventListener('DOMContentLoaded', initDefaultDatesAndLoad);
