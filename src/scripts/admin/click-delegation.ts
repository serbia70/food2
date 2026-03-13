import { showTab, logout } from './core';
import { loadReservations } from './reservations';
import { loadStats } from './stats';
import { showCommissionRecords } from './billing-ui';
import { markPaid, openDeliveryModal, closeDeliveryModal, confirmDelivery } from './order-actions';
import { handlePrintOrder } from './table-actions';
import { openEditModal, saveEditProd, localizeImages, moveCategory, delCategory, moveProduct, delProd, addProd } from './products';
import { getAdminHandlers } from './globals';
import { invokeAdminAction } from './action-registry';
import {
  handleModify as handleModifyTable,
  handleTableOrder as handleTableOrderForTable,
  handleTableRemarks as handleTableRemarksForTable,
  closeOrderModal as closeOrderModalUI,
  closeRemarksModal as closeRemarksModalUI,
  saveRemarks as saveRemarksUI,
  closeDetailsModal as closeDetailsModalUI,
  closeCheckoutModal as closeCheckoutModalUI,
  confirmCheckout as confirmCheckoutUI,
  handlePrintTable as handlePrintTableUI,
  openRejectModal,
} from './table-management';

export function bindAdminClickDelegation(options: {
  handleEditOrder: (el: any) => void;
  getCurrentOrderId: () => string | number | null;
}) {
  const { handleEditOrder, getCurrentOrderId } = options;

  document.addEventListener('click', async (e: any) => {
    const el = e.target.closest('[data-admin-action]');
    if (!el) return;

    const action = el.dataset.adminAction;
    const val = el.dataset.tabName || el.dataset.command || el.dataset.mode;
    const id = el.dataset.orderId || el.dataset.productId || el.dataset.categoryId;
    const table = el.dataset.table;

    if (action === 'show-tab') showTab(val);
    else if (action === 'enable-audio') (window as any).enableAudio?.();
    else if (action === 'test-sound') (window as any).testSound?.();
    else if (action === 'logout') logout();
    else if (action === 'reload-page') location.reload();
    else if (action === 'load-reservations') loadReservations();
    else if (action === 'load-stats') loadStats();
    else if (action === 'table-checkout') (window as any).handleTableCheckout?.(table || '');
    else if (action === 'table-print') void handlePrintTableUI(table || '');
    else if (action === 'table-order') handleTableOrderForTable(table || '');
    else if (action === 'table-modify') handleModifyTable(table || '');
    else if (action === 'table-remarks') handleTableRemarksForTable(table || '');
    else if (action === 'order-remarks') handleTableRemarksForTable(null as any, id || null);
    else if (action === 'edit-order') handleEditOrder(el);
    else if (action === 'close-remarks-modal') closeRemarksModalUI();
    else if (action === 'save-remarks') void saveRemarksUI();
    else if (action === 'close-details-modal') closeDetailsModalUI();
    else if (action === 'close-order-modal') closeOrderModalUI();
    else if (action === 'close-checkout-modal') closeCheckoutModalUI();
    else if (action === 'confirm-checkout') void confirmCheckoutUI();
    else if (action === 'mark-paid') markPaid(id || '');
    else if (action === 'open-reject') openRejectModal(id || '');
    else if (action === 'open-delivery') openDeliveryModal(id || '');
    else if (action === 'confirm-delivery') confirmDelivery();
    else if (action === 'close-delivery-modal') closeDeliveryModal();
    else if (action === 'show-commission-records') void showCommissionRecords();
    else if (action === 'print-order') void handlePrintOrder(id || '');
    else if (action === 'print-current-order') void handlePrintOrder(String(getCurrentOrderId() || ''));
    else if (action === 'open-edit-product') openEditModal(e, parseInt(id || '0', 10), parseInt(el.dataset.categoryId || '0', 10));
    else if (action === 'save-edit-product') saveEditProd();
    else if (action === 'close-edit-modal') {
      const m = document.getElementById('edit-modal');
      if (m) m.style.display = 'none';
    } else if (action === 'open-create-category') {
      const m = document.getElementById('create-cat-modal');
      if (m) m.style.display = 'flex';
    } else if (action === 'close-create-category-modal') {
      const m = document.getElementById('create-cat-modal');
      if (m) m.style.display = 'none';
    } else if (action === 'save-new-category') {
      const nameEl = document.getElementById('create-cat-name') as HTMLInputElement | null;
      const subEl = document.getElementById('create-cat-sub') as HTMLInputElement | null;
      const name = String(nameEl?.value || '').trim();
      const sub = String(subEl?.value || '').trim();
      if (!name) return alert('分类名称必填');
      const payload = { name, sub_name: sub || name };
      fetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(data => { if (data.success) location.reload(); else alert('创建失败'); });
    } else if (action === 'localize-images') localizeImages();
    else if (action === 'move-category') moveCategory(el.dataset.categoryId, el.dataset.direction);
    else if (action === 'delete-category') delCategory(el.dataset.categoryId, el.dataset.productCount);
    else if (action === 'move-product') moveProduct(el.dataset.productId, el.dataset.direction, el.dataset.categoryId);
    else if (action === 'delete-product') delProd(el.dataset.productId);
    else if (action === 'add-product') addProd(el.dataset.shopId, el.dataset.categoryId);
    else if (action === 'trigger-upload') (window as any).triggerUpload(el.dataset.targetInput);
    else if (action === 'add-item-to-order') (window as any).addManualItem?.();
    else if (action === 'change-item-qty') (window as any).changeItemQty?.(el.dataset.key, parseInt(el.dataset.delta || '0'));
    else if (action === 'remove-order-item') (window as any).removeOrderItem?.(el.dataset.key);
    else if (action === 'add-driver') {
      const nameEl = document.getElementById('new-driver-name') as HTMLInputElement;
      const phoneEl = document.getElementById('new-driver-phone') as HTMLInputElement;
      const jsonEl = document.getElementById('drivers-json') as HTMLInputElement;
      const listEl = document.getElementById('drivers-list');
      const name = nameEl?.value.trim();
      const phone = phoneEl?.value.trim();
      if (!name || !phone) return alert('请填写姓名和电话');
      let drivers = [];
      try { drivers = JSON.parse(jsonEl?.value || '[]'); } catch {}
      drivers.push({ name, phone });
      if (jsonEl) jsonEl.value = JSON.stringify(drivers);
      if (nameEl) nameEl.value = '';
      if (phoneEl) phoneEl.value = '';
      if (listEl) {
        const div = document.createElement('div');
        div.className = 'driver-row';
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px; background:#f9f9f9; margin-bottom:5px; border-radius:4px;';
        const label = document.createElement('span');
        label.textContent = `${name} (${phone})`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-xs btn-red';
        button.dataset.adminAction = 'remove-driver';
        button.dataset.driverIndex = String(drivers.length - 1);
        button.textContent = '删除';
        div.append(label, button);
        listEl.appendChild(div);
      }
    } else if (action === 'remove-driver') {
      const idx = parseInt(el.dataset.driverIndex || '0');
      const jsonEl = document.getElementById('drivers-json') as HTMLInputElement;
      let drivers = [];
      try { drivers = JSON.parse(jsonEl?.value || '[]'); } catch {}
      drivers.splice(idx, 1);
      if (jsonEl) jsonEl.value = JSON.stringify(drivers);
      el.closest('.driver-row')?.remove();
    } else if (action === 'save-delivery-type') {
      const form = document.getElementById('settings-form') as HTMLFormElement;
      if (form) form.requestSubmit();
    } else if (action === 'save-order-edit') (window as any).saveOrderEdit?.();
    else if (action === 'close-order-edit-modal') (window as any).closeOrderEditModal?.();
    else {
      // Fallback: allow feature modules to register handlers without editing this chain.
      // E.g. data.ts registers "import-data" / "export-data".
      const handled = await invokeAdminAction(getAdminHandlers(), action, el, e);
      if (!handled) {
        console.warn('[admin] unhandled action:', action);
      }
    }
  });
}
