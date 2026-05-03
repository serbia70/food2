import { registerAdminGlobal, showAdminToast } from './globals';

type ItemMap = Record<string, any>;

function setStyles(el: HTMLElement, styles: Record<string, string>) {
  Object.entries(styles).forEach(([key, value]) => {
    (el.style as any)[key] = value;
  });
}

export function initOrderEditUI(options: {
  getCurrentOrderId: () => string | number | null;
  getCurrentOrderItems: () => ItemMap | null;
  setCurrentOrderItems: (items: ItemMap) => void;
  handleEditOrder: (el: any) => void;
}) {
  const { getCurrentOrderId, getCurrentOrderItems, setCurrentOrderItems, handleEditOrder } = options;

  const setText = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const renderOrderItems = () => {
    const container = document.getElementById('order-items-container');
    if (!container) return;
    const itemsMap = getCurrentOrderItems() || {};
    const itemNodes = Object.entries(itemsMap).map(([key, item]: [string, any]) => {
      const row = document.createElement('div');
      setStyles(row, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px',
        borderBottom: '1px solid #f1f5f9',
        gap: '10px',
      });

      const info = document.createElement('div');
      setStyles(info, { flex: '1', minWidth: '0' });
      const name = document.createElement('div');
      setStyles(name, { fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
      name.textContent = String(item.name || '');
      const sub = document.createElement('div');
      setStyles(sub, { fontSize: '11px', color: '#94a3b8' });
      sub.textContent = String(item.subName || item.sub_name || '');
      info.append(name, sub);

      const actions = document.createElement('div');
      setStyles(actions, { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: '0' });

      const priceWrap = document.createElement('div');
      setStyles(priceWrap, { display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '2px 5px' });
      const priceInput = document.createElement('input');
      priceInput.type = 'number';
      priceInput.value = String(item.price ?? '');
      priceInput.addEventListener('change', () => {
        const changeItemPrice = window.__adminHandlers?.changeItemPrice;
        if (typeof changeItemPrice === 'function') changeItemPrice(key, priceInput.value);
      });
      setStyles(priceInput, { width: '60px', border: 'none', outline: 'none', textAlign: 'right', fontWeight: 'bold', color: '#e53e3e', fontSize: '13px' });
      const currency = document.createElement('span');
      setStyles(currency, { fontSize: '10px', color: '#999', marginLeft: '2px' });
      currency.textContent = 'RSD';
      priceWrap.append(priceInput, currency);

      const qtyWrap = document.createElement('div');
      setStyles(qtyWrap, { display: 'flex', alignItems: 'center', gap: '5px', background: '#f1f5f9', borderRadius: '15px', padding: '2px 8px' });
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.dataset.adminAction = 'change-item-qty';
      minus.dataset.key = key;
      minus.dataset.delta = '-1';
      minus.textContent = '-';
      setStyles(minus, { border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', width: '20px' });
      const qty = document.createElement('span');
      setStyles(qty, { minWidth: '20px', textAlign: 'center', fontWeight: 'bold' });
      qty.textContent = String(item.quantity);
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.dataset.adminAction = 'change-item-qty';
      plus.dataset.key = key;
      plus.dataset.delta = '1';
      plus.textContent = '+';
      setStyles(plus, { border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', width: '20px' });
      qtyWrap.append(minus, qty, plus);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.adminAction = 'remove-order-item';
      remove.dataset.key = key;
      remove.textContent = '🗑️';
      setStyles(remove, { border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px' });

      actions.append(priceWrap, qtyWrap, remove);
      row.append(info, actions);
      return row;
    });
    if (itemNodes.length === 0) {
      const empty = document.createElement('div');
      setStyles(empty, { padding: '20px', textAlign: 'center', color: '#94a3b8' });
      empty.textContent = '暂无菜品';
      container.replaceChildren(empty);
    } else {
      container.replaceChildren(...itemNodes);
    }
    let total = 0;
    Object.values(itemsMap).forEach((i: any) => { total += Number(i.price || 0) * Number(i.quantity || 1); });
    const totalEl = document.getElementById('order-edit-total');
    if (totalEl) totalEl.textContent = total + ' RSD';
  };

  registerAdminGlobal('openOrderEditModal', (orderId: string | number, orderNo: string) => {
    const idEl = document.getElementById('order-edit-id') as HTMLInputElement | null;
    if (idEl) idEl.value = String(orderId);
    setText('order-edit-no', '#' + String(orderNo || '').slice(-9));
    const modal = document.getElementById('order-edit-modal');
    if (modal) modal.style.display = 'flex';
  });
  registerAdminGlobal('closeOrderEditModal', () => {
    const modal = document.getElementById('order-edit-modal');
    if (modal) modal.style.display = 'none';
  });
  registerAdminGlobal('changeItemQty', (key: string, delta: number) => {
    const items = getCurrentOrderItems();
    if (!items || !items[key]) return;
    items[key].quantity = Math.max(1, Number(items[key].quantity || 1) + Number(delta || 0));
    setCurrentOrderItems(items);
    renderOrderItems();
  });
  registerAdminGlobal('changeItemPrice', (key: string, val: string) => {
    const items = getCurrentOrderItems();
    if (!items || !items[key]) return;
    items[key].price = parseInt(val) || 0;
    setCurrentOrderItems(items);
    renderOrderItems();
  });
  registerAdminGlobal('removeOrderItem', (key: string) => {
    const items = getCurrentOrderItems();
    if (!items || !items[key]) return;
    if (!confirm('确定删除这个菜品吗？')) return;
    delete items[key];
    setCurrentOrderItems(items);
    renderOrderItems();
  });
  registerAdminGlobal('addManualItem', () => {
    const items = getCurrentOrderItems() || {};
    const nameEl = document.getElementById('add-item-name') as HTMLInputElement | null;
    const subEl = document.getElementById('add-item-subname') as HTMLInputElement | null;
    const priceEl = document.getElementById('add-item-price') as HTMLInputElement | null;
    const qtyEl = document.getElementById('add-item-qty') as HTMLInputElement | null;
    const name = nameEl?.value.trim();
    if (!name) return showAdminToast('请输入菜品名称');
    items['manual_' + Date.now()] = { name, subName: subEl?.value.trim(), price: parseInt(priceEl?.value || '0'), quantity: parseInt(qtyEl?.value || '1') };
    setCurrentOrderItems(items);
    if (nameEl) nameEl.value = '';
    if (subEl) subEl.value = '';
    if (priceEl) priceEl.value = '';
    if (qtyEl) qtyEl.value = '1';
    renderOrderItems();
  });
  registerAdminGlobal('saveOrderEdit', async () => {
    const currentOrderId = getCurrentOrderId();
    if (!currentOrderId) return;
    const itemsArray = Object.values(getCurrentOrderItems() || {});
    let newTotal = 0;
    itemsArray.forEach((item: any) => { newTotal += Number(item?.price || 0) * Number(item?.quantity || 1); });
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(String(currentOrderId))}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemsJson: JSON.stringify(itemsArray), totalAmount: newTotal }),
      });
      const data = await res.json();
      if (data.success) {
        showAdminToast('订单更新成功');
        const closeOrderEditModal = window.__adminHandlers?.closeOrderEditModal;
        if (typeof closeOrderEditModal === 'function') closeOrderEditModal();
        setTimeout(() => location.reload(), 500);
      } else {
        showAdminToast('修改失败: ' + (data.error || '未知错误'));
      }
    } catch {
      showAdminToast('网络错误');
    }
  });
  registerAdminGlobal('handleEditOrder', handleEditOrder);

  return { renderOrderItems };
}
