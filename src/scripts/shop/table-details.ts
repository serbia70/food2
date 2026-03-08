type TableDetailsDeps = {
  shopSlug: string;
  endedOrderStatusList?: string[];
  belgradeTimeOptions?: Intl.DateTimeFormatOptions;
  buildTableLookupKeys: (value: string) => string[];
  createBelgradeFormatter: (options?: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat;
  escapeHtml: (value: string) => string;
  fetch?: typeof fetch;
  document?: Document;
};

type TableOrder = {
  id?: number | string;
  order_no?: string | number;
  total_amount?: number | string;
  created_at?: string;
  status?: string;
  items_json?: string;
};

export function createTableDetails(deps: TableDetailsDeps) {
  const debug = false;
  const ended = new Set(deps.endedOrderStatusList || []);
  const fmt = deps.createBelgradeFormatter(deps.belgradeTimeOptions || {});
  const esc = deps.escapeHtml;
  const doc = deps.document || document;
  const fetchFn = deps.fetch || fetch;
  const orderCache = new Map<string, Promise<TableOrder[]>>();

  function logDebug(...args: any[]) {
    if (!debug) return;
    console.log(...args);
  }

  async function runWithConcurrency<T>(limit: number, tasks: Array<() => Promise<T>>) {
    const max = Math.max(1, Number(limit || 1));
    const results = new Array(tasks.length) as T[];
    let index = 0;

    async function worker() {
      while (index < tasks.length) {
        const current = index++;
        results[current] = await tasks[current]();
      }
    }

    const workers = Array.from({ length: Math.min(max, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  function formatOrderTime(rawValue: any) {
    const raw = String(rawValue || '').replace(' ', 'T');
    const d = new Date(raw.endsWith('Z') ? raw : `${raw}Z`);
    if (Number.isNaN(d.getTime())) return String(rawValue || '--');
    return fmt.format(d);
  }

  function parseItemsJson(raw: any) {
    try {
      const parsed = JSON.parse(String(raw || '[]'));
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.values(parsed);
      return [];
    } catch {
      return [];
    }
  }

  function closeTableDetailsModal() {
    const modal = doc.getElementById('table-details-modal');
    if (modal) modal.style.display = 'none';
  }

  function showTableDetailsModal(title: string, rows: string[], total: number) {
    const modal = doc.getElementById('table-details-modal');
    const titleEl = doc.getElementById('table-details-title');
    const bodyEl = doc.getElementById('table-details-body');
    const totalEl = doc.getElementById('table-details-total');
    if (!modal || !titleEl || !bodyEl || !totalEl) return;

    titleEl.innerHTML = esc(title);

    if (rows.length === 0) {
      bodyEl.innerHTML = '<div class="table-details-empty">当前无进行中订单</div>';
    } else {
      bodyEl.innerHTML = rows
        .map((row) => `<div class="table-details-row">${esc(row).replace(/\n/g, '<br/>')}</div>`)
        .join('');
    }

    totalEl.textContent = `合计 / Ukupno: ${Number(total || 0)} RSD`;
    modal.style.display = 'flex';
  }

  async function safeFetchOrders(url: string) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) return [] as TableOrder[];
      const data = await res.json();
      const orders = data && (data as any).orders;
      return Array.isArray(orders) ? (orders as TableOrder[]) : [];
    } catch {
      logDebug('safeFetchOrders failed', url);
      return [] as TableOrder[];
    }
  }

  async function fetchOrdersByKey(key: string) {
    const slug = String(deps.shopSlug || '');
    const cacheKey = `${slug}|${key}`;
    const cached = orderCache.get(cacheKey);
    if (cached) return cached;

    const promise = safeFetchOrders(
      `/api/order/by_table?slug=${encodeURIComponent(slug)}&table=${encodeURIComponent(key)}`,
    )
      .then((orders) => {
        if (!Array.isArray(orders) || orders.length === 0) {
          orderCache.delete(cacheKey);
        }
        return orders;
      })
      .catch((err) => {
        orderCache.delete(cacheKey);
        throw err;
      });

    orderCache.set(cacheKey, promise);
    return promise;
  }

  async function loadOrders(tableValue: string) {
    const keys = deps.buildTableLookupKeys(tableValue);
    const merged = new Map<number, TableOrder>();

    const tasks = keys.map((key) => () => fetchOrdersByKey(key));
    const results = await runWithConcurrency(3, tasks);

    for (const orders of results) {
      for (const o of orders) {
        const id = Number((o && o.id) || 0);
        if (id > 0) merged.set(id, o);
      }
    }

    return Array.from(merged.values());
  }

  function buildOrderLines(activeOrders: TableOrder[]) {
    return activeOrders
      .sort((a, b) => Number((b && b.id) || 0) - Number((a && a.id) || 0))
      .map((o, idx) => {
        const t = formatOrderTime(o && o.created_at);
        const items = parseItemsJson(o && o.items_json);
        const itemText = items
          .map((it: any) => {
            const n = String((it && (it.name || it.product_name)) || '').trim();
            const sub = String((it && (it.sub_name || it.subName)) || '').trim();
            const q = Number((it && (it.quantity || it.qty)) || 1);
            if (!n) return '';
            return `${n}${sub ? `(${sub})` : ''}x${q}`;
          })
          .filter(Boolean)
          .join('、');

        const base = `${idx + 1}. #${(o && (o.order_no || o.id)) || ''} | ${(o && o.total_amount) || 0} RSD | ${t}`;
        return itemText ? `${base}\n   菜品: ${itemText}` : base;
      });
  }

  async function openTableDetails(tableValue: string, displayNum: string) {
    try {
      const all = await loadOrders(tableValue);
      const active = all.filter((o) => !ended.has(String((o && o.status) || '').toLowerCase()));

      if (active.length === 0) {
        showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, [], 0);
        return;
      }

      const lines = buildOrderLines(active);
      const total = active.reduce((sum, o) => sum + Number((o && o.total_amount) || 0), 0);
      showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, lines, total);
    } catch {
      logDebug('openTableDetails failed', tableValue, displayNum);
      showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, ['加载失败，请稍后重试'], 0);
    }
  }

  return {
    closeTableDetailsModal,
    showTableDetailsModal,
    openTableDetails,
    safeFetchOrders,
  };
}
