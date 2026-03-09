
import { showTab } from './core';
import { getAdminHandler, getAdminRuntimeState, registerAdminGlobal, showAdminToast } from './globals';

function setStyles(el: HTMLElement, styles: Record<string, string>) {
  Object.entries(styles).forEach(([key, value]) => {
    (el.style as any)[key] = value;
  });
}

function setReservationListMessage(list: HTMLElement, text: string, color: string, extraStyles: Record<string, string> = {}) {
  const div = document.createElement('div');
  setStyles(div, { textAlign: 'center', padding: '20px', color, ...extraStyles });
  div.textContent = text;
  list.replaceChildren(div);
}

function buildReservationActionButton(text: string, handler: () => void, styles: Record<string, string>) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  setStyles(button, styles);
  button.addEventListener('click', handler);
  return button;
}

export async function loadReservationStats() {
  try {
    const res = await fetch('/api/admin/reservation-stats');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const map: any = {
      'res-stat-total': data.today_total,
      'res-stat-pending': data.today_pending,
      'res-stat-confirmed': data.today_confirmed,
      'res-stat-completed': data.today_completed,
      'res-stat-cancelled': data.today_cancelled
    };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = String(map[id] || 0);
    });
  } catch (err) {}
}

export async function loadReservations() {
  const list = document.getElementById('reservation-list');
  if (!list) return;
  try {
    const dateInput = document.getElementById('reservation-date') as HTMLInputElement;
    const selectedDate = dateInput?.value;
    
    // 默认 7 天
    if (window.__resFilterMode === undefined) {
        window.__resFilterMode = '7days';
        const btn = document.querySelector('[data-mode="7days"]') as HTMLElement;
        if (btn) {
            btn.style.background = '#2563eb';
            btn.style.color = '#fff';
        }
    }
    
    const mode = window.__resFilterMode;
    let query = '';
    if (selectedDate) {
        query = `?date=${selectedDate}`;
    } else if (mode === 'today') {
      const now = new Date();
      query = `?date=${now.toISOString().split('T')[0]}`;
    } else if (mode === '7days') {
        query = '?limit_days=7'; 
    }

    const statusSelect = document.getElementById('reservation-status') as HTMLSelectElement;
    if (statusSelect?.value) {
        query += (query ? '&' : '?') + `status=${statusSelect.value}`;
    }

    const res = await fetch(`/api/admin/reservations${query}`);
    const data = await res.json();
    
    if (Array.isArray(data)) {
      renderReservations(data);
    } else if (data && data.reservations && Array.isArray(data.reservations)) {
      renderReservations(data.reservations);
    } else {
       renderReservations([]);
    }
  } catch (err) {
    console.error('loadReservations error:', err);
    setReservationListMessage(list, '加载失败 / Neuspešno učitavanje', 'red');
  }
}

function renderReservations(items: any[]) {
  const list = document.getElementById('reservation-list');
  if (!list) return;

  // 清除旧的预约隐藏数据
  document.querySelectorAll('.hidden-data-res').forEach(el => el.remove());

  if (!items.length) {
    setReservationListMessage(list, '暂无预约记录 / Nema zapisa o rezervaciji', '#94a3b8', { padding: '40px', background: '#f8fafc', borderRadius: '12px' });
    return;
  }
  
  const hiddenContainer = document.querySelector('div[aria-hidden="true"]');
  const cards = items.map(item => {
    let hasItems = false;
    try {
        const parsed = JSON.parse(item.items_json || '[]');
        if (Array.isArray(parsed) && (parsed.length > 0 || (typeof parsed === 'object' && Object.keys(parsed).length > 0))) {
            hasItems = true;
        }
    } catch {}

    // 为编辑功能准备隐藏数据
    if (hiddenContainer) {
        const span = document.createElement('span');
        span.className = 'hidden-data hidden-data-res';
        span.dataset.oid = 'res-' + item.id;
        span.dataset.orderId = 'res-' + item.id;
        span.dataset.items = item.items_json || '[]';
        span.dataset.total = String(item.total_amount || 0);
        span.dataset.isReservation = 'true';
        hiddenContainer.appendChild(span);
    }

    const isPending = item.status === 'pending';
    const isConfirmed = item.status === 'confirmed';
    const isCompleted = item.status === 'completed';
    const isCancelled = item.status === 'cancelled';

    const card = document.createElement('div');
    setStyles(card, { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' });

    const top = document.createElement('div');
    setStyles(top, { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' });
    const title = document.createElement('span');
    setStyles(title, { fontWeight: 'bold', color: '#1e293b', fontSize: '16px' });
    title.textContent = `${item.customer_name || '客人'} (${item.guest_count}人)`;
    const status = document.createElement('span');
    setStyles(status, { padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' });
    status.style.cssText += getStatusStyle(item.status);
    status.textContent = getStatusText(item.status);
    top.append(title, status);

    const time = document.createElement('div');
    setStyles(time, { fontSize: '14px', color: '#475569', marginBottom: '4px' });
    time.textContent = `📅 预约时间: ${item.reservation_time}`;
    const phone = document.createElement('div');
    setStyles(phone, { fontSize: '14px', color: '#475569', marginBottom: '8px' });
    phone.textContent = `📞 联系电话: ${item.customer_phone}`;

    const actions = document.createElement('div');
    setStyles(actions, { marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' });

    if (item.remarks) {
      const remarks = document.createElement('div');
      setStyles(remarks, { fontSize: '13px', color: '#64748b', background: '#f8fafc', padding: '8px', borderRadius: '6px', marginBottom: '8px', borderLeft: '3px solid #cbd5e0' });
      remarks.textContent = `备注: ${item.remarks}`;
      card.appendChild(remarks);
    }

    if (isPending) {
      actions.append(
        buildReservationActionButton('✅ 确认预约', () => window.updateReservationStatus(item.id, 'confirmed'), { flex: '1', padding: '10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }),
        buildReservationActionButton('❌ 拒绝', () => window.updateReservationStatus(item.id, 'cancelled'), { flex: '1', padding: '10px', background: '#fff', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }),
      );
    }

    if (isConfirmed) {
      actions.append(
        buildReservationActionButton(hasItems ? '🚀 到桌 (转订单)' : '✅ 标记到店', () => window.openCheckinModal(item.id, hasItems), { flex: '1.5', padding: '10px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }),
        buildReservationActionButton('📝 修改', () => window.editReservationItems(item.id), { padding: '10px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer' }),
        buildReservationActionButton('取消', () => window.updateReservationStatus(item.id, 'cancelled'), { padding: '10px', background: '#fff', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }),
      );
    }

    if (isCompleted) {
      const done = document.createElement('div');
      setStyles(done, { color: '#059669', fontWeight: '600', fontSize: '14px', padding: '5px' });
      done.textContent = '✨ 已完成到店';
      actions.appendChild(done);
    }

    if (isCancelled) {
      const cancelled = document.createElement('div');
      setStyles(cancelled, { color: '#94a3b8', fontWeight: '600', fontSize: '14px', padding: '5px' });
      cancelled.textContent = '⚪ 已取消';
      actions.appendChild(cancelled);
    }

    card.append(top, time, phone, actions);
    return card;
  });
  list.replaceChildren(...cards);
}

registerAdminGlobal('editReservationItems', function(id: number) {
    const triggerEditOrder = getAdminHandler<(id: string) => void>('triggerEditOrder');
    if (typeof triggerEditOrder === 'function') {
        triggerEditOrder('res-' + id);
    } else {
        alert('编辑模块未加载');
    }
});

registerAdminGlobal('updateReservationStatus', async function(id: number, status: string) {
  try {
    const res = await fetch(`/api/admin/reservations`, { 
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
    });
    if (res.ok) {
      showAdminToast('状态已更新');
      loadReservationStats();
      loadReservations();
    } else {
      const data = await res.json();
      alert('操作失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
      alert('网络错误');
  }
});

registerAdminGlobal('openCheckinModal', function(id: number, hasItems: boolean) {
    if (!hasItems) {
        const updateReservationStatus = getAdminHandler<(id: number, status: string) => void>('updateReservationStatus');
        if (confirm('确认客人已到店？\nPotvrdi dolazak gosta?')) {
            if (typeof updateReservationStatus === 'function') updateReservationStatus(id, 'completed');
        }
        return;
    }
    
    const modal = document.getElementById('checkin-modal');
    if (!modal) return;
    
    const container = document.getElementById('checkin-tables');
    const tableConfig = Array.isArray(getAdminRuntimeState().tableConfig) ? getAdminRuntimeState().tableConfig : [];
    if (container && tableConfig.length > 0) {
        const nodes: HTMLElement[] = [];
        tableConfig.forEach((zone: any) => {
            const zoneName = zone.name || '大厅 / Glavna sala';
            const header = document.createElement('div');
            setStyles(header, { gridColumn: '1 / -1', fontWeight: 'bold', marginTop: '10px', borderBottom: '1px solid #eee', paddingBottom: '5px', color: '#64748b', fontSize: '12px' });
            header.textContent = zoneName;
            nodes.push(header);
            for (let i = 1; i <= (zone.count || 0); i++) {
                const prefix = zone.prefix || '';
                const tableName = prefix ? `${prefix}${i}号桌` : `${i}号桌`;
                const display = `${i}号`;
                const option = document.createElement('div');
                option.className = 'checkin-table-opt';
                setStyles(option, { border: '1px solid #e2e8f0', padding: '12px 8px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', fontSize: '14px', background: '#fff', transition: 'all 0.2s', fontWeight: '600' });
                option.textContent = display;
                option.addEventListener('click', () => window.selectCheckinTable(option, tableName));
                nodes.push(option);
            }
        });
        container.replaceChildren(...nodes);
    }
    
    modal.dataset.resId = String(id);
    modal.dataset.selectedTable = '';
    modal.style.display = 'flex';
});

registerAdminGlobal('selectCheckinTable', function(el: HTMLElement, tableName: string) {
    document.querySelectorAll('.checkin-table-opt').forEach(e => {
        (e as HTMLElement).style.borderColor = '#e2e8f0';
        (e as HTMLElement).style.backgroundColor = '#fff';
        (e as HTMLElement).style.color = '#333';
        (e as HTMLElement).style.boxShadow = 'none';
    });
    el.style.borderColor = '#2563eb';
    el.style.backgroundColor = '#eff6ff';
    el.style.color = '#2563eb';
    el.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.1)';
    const modal = document.getElementById('checkin-modal');
    if (modal) modal.dataset.selectedTable = tableName;
});

registerAdminGlobal('confirmCheckin', async function() {
    const modal = document.getElementById('checkin-modal');
    if (!modal) return;
    const resId = modal.dataset.resId;
    const tableName = modal.dataset.selectedTable;
    
    if (!tableName) {
        alert('请选择桌号 / Molimo izaberite sto');
        return;
    }
    
    const confirmBtn = modal.querySelector('.btn-save') as HTMLButtonElement;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerText = '正在转订单...';
    }
    
    try {
        const res = await fetch(`/api/admin/reservations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: Number(resId), action: 'checkin', table_info: tableName })
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast('已转为订单并分配桌号');
            modal.style.display = 'none';
            loadReservations();
            loadReservationStats();
            const loadOrders = getAdminHandler<() => void>('loadOrders');
            if (typeof loadOrders === 'function') loadOrders();
        } else {
            alert('操作失败: ' + (data.error || '未知错误'));
        }
    } catch (e) {
        alert('网络错误');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerText = '✅ 确认入座';
        }
    }
});

registerAdminGlobal('closeCheckinModal', function() {
    const modal = document.getElementById('checkin-modal');
    if (modal) modal.style.display = 'none';
});

function getStatusStyle(s: string) {
  if (s === 'pending') return 'background:#fef3c7;color:#92400e;';
  if (s === 'confirmed') return 'background:#dbeafe;color:#1e40af;';
  if (s === 'completed') return 'background:#dcfce7;color:#166534;';
  if (s === 'cancelled') return 'background:#fee2e2;color:#991b1b;';
  return 'background:#f1f5f9;color:#475569;';
}

function getStatusText(s: string) {
  const map: any = { 
      pending: '待处理 / Na čekanju', 
      confirmed: '已确认 / Potvrđeno', 
      completed: '已到店 / Stigao', 
      cancelled: '已取消 / Otkazano' 
  };
  return map[s] || s;
}

registerAdminGlobal('setReservationDateFilter', function(mode: string) {
  window.__resFilterMode = mode;
  document.querySelectorAll('[data-admin-action="reservation-filter"]').forEach(btn => {
    (btn as HTMLElement).style.background = (btn as HTMLElement).dataset.mode === mode ? '#2563eb' : '#f1f5f9';
    (btn as HTMLElement).style.color = (btn as HTMLElement).dataset.mode === mode ? '#fff' : '#475569';
  });
  loadReservations();
});
