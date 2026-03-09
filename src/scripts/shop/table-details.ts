type TableDetailsDeps = {
  shopSlug: string;
  buildTableLookupKeys: (tableValue: string) => string[];
  escapeHtml: (value: string) => string;
  endedOrderStatusList?: string[];
  belgradeTimeOptions?: Intl.DateTimeFormatOptions;
  fetcher?: typeof fetch;
  debug?: boolean;
};

export const createTableDetails = (deps: TableDetailsDeps) => {
  const {
    shopSlug,
    buildTableLookupKeys,
    escapeHtml,
    endedOrderStatusList,
    belgradeTimeOptions,
    fetcher,
    debug,
  } = deps;

  const ended = new Set(endedOrderStatusList || []);
  const fmt = new Intl.DateTimeFormat('sr-RS', belgradeTimeOptions || {});
  const esc = escapeHtml;
  const CONCURRENCY_LIMIT = 3;
  const orderCache = new Map<string, Promise<any[]>>();
  const debugEnabled = Boolean(debug);

  const logDebug = (...args: any[]) => {
    if (!debugEnabled) return;
    console.log(...args);
  };

  const runWithConcurrency = async <T>(limit: number, tasks: Array<() => Promise<T>>) => {
    const max = Math.max(1, Number(limit || 1));
    const results = new Array(tasks.length) as T[];
    let index = 0;

    const worker = async () => {
      while (index < tasks.length) {
        const current = index++;
        results[current] = await tasks[current]();
      }
    };

    const workers = Array.from({ length: Math.min(max, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  };

  const closeTableDetailsModal = () => {
    const modal = document.getElementById('table-details-modal');
    if (modal) modal.style.display = 'none';
  };

  const showTableDetailsModal = (title: string, rows: string[], total: number) => {
    const modal = document.getElementById('table-details-modal');
    const titleEl = document.getElementById('table-details-title');
    const bodyEl = document.getElementById('table-details-body');
    const totalEl = document.getElementById('table-details-total');
    if (!modal || !titleEl || !bodyEl || !totalEl) return;

    titleEl.textContent = title;

    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'table-details-empty';
      empty.textContent = '当前无进行中订单';
      bodyEl.replaceChildren(empty);
    } else {
      const nodes = rows.map((row) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'table-details-row';
        const parts = String(row).split('\n');
        parts.forEach((part, index) => {
          if (index > 0) rowEl.appendChild(document.createElement('br'));
          rowEl.appendChild(document.createTextNode(part));
        });
        return rowEl;
      });
      bodyEl.replaceChildren(...nodes);
    }

    totalEl.textContent = `合计 / Ukupno: ${Number(total || 0)} RSD`;
    modal.style.display = 'flex';
  };

  const safeFetchOrders = async (url: string) => {
    try {
      const res = await (fetcher || fetch)(url);
      if (!res.ok) return [];
      let data: any;
      try {
        data = await res.json();
      } catch {
        return [];
      }
      const orders = Array.isArray(data && data.orders) ? data.orders : [];
      return orders;
    } catch (error) {
      logDebug('[table-details] safeFetchOrders failed', url, error);
      return [];
    }
  };

  const fetchOrdersByKey = async (key: string) => {
    const cacheKey = `${shopSlug}|${key}`;
    const cached = orderCache.get(cacheKey);
    if (cached) return cached;

    const promise = safeFetchOrders(
      `/api/order/by_table?slug=${encodeURIComponent(shopSlug)}&table=${encodeURIComponent(key)}`,
    )
      .then((orders) => {
        if (!Array.isArray(orders) || orders.length === 0) {
          orderCache.delete(cacheKey);
        }
        return orders;
      })
      .catch(() => {
        orderCache.delete(cacheKey);
        return [] as any[];
      });

    orderCache.set(cacheKey, promise);
    return promise;
  };

  const openTableDetails = async (tableValue: string, displayNum: string) => {
    try {
      const keys = buildTableLookupKeys(tableValue);

      const merged = new Map<number, any>();
      const tasks = keys.map((key) => () => fetchOrdersByKey(key));
      const results = await runWithConcurrency(CONCURRENCY_LIMIT, tasks);
      for (const orders of results) {
        for (const o of orders) {
          const id = Number((o && o.id) || 0);
          if (id > 0) merged.set(id, o);
        }
      }

      const all = Array.from(merged.values());
      const active = all.filter((o) => !ended.has(String((o && o.status) || '').toLowerCase()));

      if (active.length === 0) {
        showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, [], 0);
        return;
      }

      const lines = active
        .sort((a, b) => Number((b && b.id) || 0) - Number((a && a.id) || 0))
        .map((o, idx) => {
          const raw = String((o && o.created_at) || '').replace(' ', 'T');
          const d = new Date(raw.endsWith('Z') ? raw : `${raw}Z`);
          const t = Number.isNaN(d.getTime()) ? String((o && o.created_at) || '--') : fmt.format(d);
          let itemText = '';
          try {
            const parsed = JSON.parse(String((o && o.items_json) || '[]'));
            const arr = Array.isArray(parsed)
              ? parsed
              : parsed && typeof parsed === 'object'
                ? Object.values(parsed)
                : [];
            itemText = arr
              .map((it: any) => {
                const n = String((it && (it.name || it.product_name)) || '').trim();
                const sub = String((it && (it.sub_name || it.subName)) || '').trim();
                const q = Number((it && (it.quantity || it.qty)) || 1);
                if (!n) return '';
                return `${n}${sub ? `(${sub})` : ''}x${q}`;
              })
              .filter(Boolean)
              .join('、');
          } catch {}

          const base = `${idx + 1}. #${(o && (o.order_no || o.id)) || ''} | ${(o && o.total_amount) || 0} RSD | ${t}`;
          return itemText ? `${base}\n   菜品: ${itemText}` : base;
        });

      const total = active.reduce((sum, o) => sum + Number((o && o.total_amount) || 0), 0);
      showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, lines, total);
    } catch (error) {
      logDebug('[table-details] openTableDetails failed', tableValue, displayNum, error);
      showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, ['加载失败，请稍后重试'], 0);
    }
  };

  return {
    closeTableDetailsModal,
    showTableDetailsModal,
    openTableDetails,
    safeFetchOrders,
  };
};
