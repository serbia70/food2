import { registerAdminGlobal } from './globals';

async function fetchJSONWithRetry(url: string, init?: RequestInit) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      return { res, data };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function setStyles(el: HTMLElement, styles: Record<string, string>) {
  Object.entries(styles).forEach(([key, value]) => {
    (el.style as any)[key] = value;
  });
}

function setStateMessage(container: HTMLElement, text: string, color: string) {
  const div = document.createElement('div');
  setStyles(div, { padding: '40px', textAlign: 'center', color });
  div.textContent = text;
  container.replaceChildren(div);
}

function createCell(tag: 'td' | 'th', text: string, styles: Record<string, string>) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  setStyles(cell, styles);
  return cell;
}

function buildRecordsTable(records: any[], compact = false) {
  const table = document.createElement('table');
  setStyles(table, { width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: compact ? '12px' : '13px' });
  const thead = document.createElement('thead');
  if (!compact) setStyles(thead, { background: '#f1f5f9', position: 'sticky', top: '0', zIndex: '1' });
  const headRow = document.createElement('tr');
  if (compact) {
    setStyles(headRow, { background: '#f8fafc', color: '#64748b', borderBottom: '1px solid #f1f5f9' });
  }
  [
    ['订单号', 'left'],
    ['订单金额', 'right'],
    ['扣费', 'right'],
    ['余额', 'right'],
  ].forEach(([text, align], index) => {
    const label = compact || index > 0 ? text : '日期';
    headRow.appendChild(createCell('th', label, { padding: compact ? '8px 10px' : '12px', textAlign: align, fontWeight: '600', borderBottom: '1px solid #e2e8f0' }));
  });
  if (!compact) {
    headRow.replaceChildren(
      createCell('th', '日期', { padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }),
      createCell('th', '订单号', { padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }),
      createCell('th', '金额', { padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }),
      createCell('th', '扣费', { padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }),
      createCell('th', '余额', { padding: '12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }),
    );
  }
  thead.appendChild(headRow);
  const tbody = document.createElement('tbody');
  records.forEach((r: any) => {
    const row = document.createElement('tr');
    const orderNo = String(r.orderNo || '');
    const orderDisplay = orderNo.length > 9 ? orderNo.slice(-9) : orderNo;
    const orderLabel = orderDisplay ? `#${orderDisplay}` : '-';
    const totalAmount = Number.isFinite(Number(r.totalAmount)) ? String(r.totalAmount) : '-';
    const commissionAmount = Number.isFinite(Number(r.commissionAmount)) ? `-${r.commissionAmount}` : '-';
    const balanceAfter = Number.isFinite(Number(r.balanceAfter)) ? String(r.balanceAfter) : '-';
    if (compact) {
      setStyles(row, { borderBottom: '1px solid #f8fafc' });
      row.append(
        createCell('td', orderLabel, { padding: '8px 10px', color: '#334155', fontWeight: '600' }),
        createCell('td', totalAmount, { padding: '8px 10px', textAlign: 'right', color: '#64748b' }),
        createCell('td', commissionAmount, { padding: '8px 10px', textAlign: 'right', color: '#d32f2f', fontWeight: '700' }),
        createCell('td', balanceAfter, { padding: '8px 10px', textAlign: 'right', color: '#1e293b', fontWeight: '600', background: '#f1f5f9' }),
      );
    } else {
      const createdAt = new Date(r.createdAt);
      const date = Number.isNaN(createdAt.getTime()) ? '--' : createdAt.toLocaleString('sr-RS', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      row.append(
        createCell('td', date, { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }),
        createCell('td', orderLabel, { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace', fontWeight: '600' }),
        createCell('td', totalAmount, { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }),
        createCell('td', commissionAmount, { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#d32f2f', fontWeight: 'bold' }),
        createCell('td', balanceAfter, { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#1e293b', fontWeight: '600', background: '#f8fafc' }),
      );
    }
    tbody.appendChild(row);
  });
  table.append(thead, tbody);
  return table;
}

export async function showCommissionRecords() {
  const modalId = 'commission-records-modal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000;';
    document.body.appendChild(modal);
  }
  const card = document.createElement('div');
  setStyles(card, { background: '#fff', width: '95%', maxWidth: '800px', maxHeight: '85vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' });
  const header = document.createElement('div');
  setStyles(header, { padding: '15px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' });
  const title = document.createElement('h3');
  setStyles(title, { margin: '0', fontSize: '16px' });
  title.textContent = '📊 佣金扣费明细 (最近200笔)';
  const closeTop = document.createElement('button');
  closeTop.type = 'button';
  setStyles(closeTop, { border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' });
  closeTop.textContent = '×';
  closeTop.addEventListener('click', () => { modal!.style.display = 'none'; });
  header.append(title, closeTop);
  const body = document.createElement('div');
  body.id = 'commission-list-body';
  setStyles(body, { flex: '1', overflowY: 'auto', padding: '0' });
  setStateMessage(body, '正在加载记录...', '#666');
  const footer = document.createElement('div');
  setStyles(footer, { padding: '12px 20px', borderTop: '1px solid #eee', textAlign: 'right', background: '#f8fafc' });
  const closeBottom = document.createElement('button');
  closeBottom.type = 'button';
  setStyles(closeBottom, { padding: '8px 20px', border: '1px solid #ddd', background: '#fff', borderRadius: '6px', cursor: 'pointer' });
  closeBottom.textContent = '关闭';
  closeBottom.addEventListener('click', () => { modal!.style.display = 'none'; });
  footer.appendChild(closeBottom);
  card.append(header, body, footer);
  modal.replaceChildren(card);
  modal.style.display = 'flex';

  try {
    const { res, data } = await fetchJSONWithRetry('/api/admin/billing');
    const body = document.getElementById('commission-list-body') as HTMLElement | null;
    if (!body) return;
    if (res.status === 401 || res.status === 403) {
      setStateMessage(body, '登录已失效，请重新登录', '#ef4444');
      window.location.href = `${window.location.pathname.replace(/\/?$/, '')}/login`;
      return;
    }
    const records = Array.isArray(data?.billing?.records) ? data.billing.records : [];
    if (!res.ok || !data.success || !records.length) {
      setStateMessage(body, '暂无扣费记录', '#999');
      return;
    }
    body.replaceChildren(buildRecordsTable(records, false));
  } catch {
    const body = document.getElementById('commission-list-body') as HTMLElement | null;
    if (body) setStateMessage(body, '加载失败，请刷新重试', '#ef4444');
  }
}

export async function loadFeeDailySummary() {
  const container = document.getElementById('fee-daily-summary');
  if (!container || container.dataset.loaded === 'true') return;
  try {
    const { res, data } = await fetchJSONWithRetry('/api/admin/billing');
    if (res.status === 401 || res.status === 403) {
      const error = document.createElement('div');
      setStyles(error, { padding: '20px', textAlign: 'center', color: '#ef4444' });
      error.textContent = '登录已失效，请重新登录';
      container.replaceChildren(error);
      window.location.href = `${window.location.pathname.replace(/\/?$/, '')}/login`;
      return;
    }
    const records = Array.isArray(data?.billing?.records) ? data.billing.records : [];
    if (!res.ok || !data.success || !records.length) {
      const empty = document.createElement('div');
      setStyles(empty, { padding: '20px', textAlign: 'center', color: '#94a3b8' });
      empty.textContent = '暂无历史扣费记录';
      container.replaceChildren(empty);
      return;
    }
    const wrap = document.createElement('div');
    setStyles(wrap, { border: '1px solid #f1f5f9', borderRadius: '8px', overflow: 'hidden' });
    wrap.appendChild(buildRecordsTable(records.slice(0, 15), true));
    const note = document.createElement('p');
    setStyles(note, { marginTop: '10px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' });
    note.textContent = '* 仅显示最近 15 笔明细';
    container.replaceChildren(wrap, note);
    container.dataset.loaded = 'true';
  } catch {
    const error = document.createElement('div');
    setStyles(error, { padding: '20px', textAlign: 'center', color: '#ef4444' });
    error.textContent = '加载汇总失败';
    container.replaceChildren(error);
  }
}

export function bindBillingGlobals() {
  registerAdminGlobal('loadFeeDailySummary', loadFeeDailySummary);
  registerAdminGlobal('showCommissionRecords', showCommissionRecords);
}
