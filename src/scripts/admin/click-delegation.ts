import { showTab, logout } from './core';
import { loadReservations } from './reservations';
import { loadStats } from './stats';
import { showCommissionRecords } from './billing-ui';
import { markPaid, openDeliveryModal, closeDeliveryModal, confirmDelivery } from './order-actions';
import { handlePrintOrder } from './table-actions';
import { loadOrderStats, archiveOldOrders, deleteArchivedOrders } from './orders';
import { showAdminToast } from './globals';
import { openEditModal, saveEditProd, localizeImages, moveCategory, delCategory, moveProduct, delProd, addProd } from './products';
import { getAdminHandlers } from './globals';
import { invokeAdminAction } from './action-registry';
import {
  handleModify as handleModifyTable,
  handleTableDetails as handleTableDetailsForTable,
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
  approveTableReviews,
  rejectTableReviews,
} from './table-management';

export function bindAdminClickDelegation(options: {
  handleEditOrder: (el: any) => void;
  getCurrentOrderId: () => string | number | null;
}) {
  const { handleEditOrder, getCurrentOrderId } = options;

  // iOS Safari can report EventTarget as a Text node when tapping on button text.
  // Normalize to an Element before calling .closest().
  const getActionEl = (target: any): HTMLElement | null => {
    if (!target) return null;
    const base = target.nodeType === 1 ? target : target.parentElement;
    if (!base || typeof base.closest !== 'function') return null;
    return base.closest('[data-admin-action]') as HTMLElement | null;
  };

  document.addEventListener('input', (e: any) => {
    const el = getActionEl(e.target);
    if (!el) return;
    const action = el.dataset.adminAction;
    if (action === 'filter-customers') {
      const value = (el as HTMLInputElement).value;
      (window as any).filterCustomers?.(value);
    }
  });

  document.addEventListener('change', (e: any) => {
    const el = getActionEl(e.target);
    if (!el) return;
    if (el.dataset.adminAction === 'load-reservations') {
      loadReservations();
    }
  });

  document.addEventListener('click', async (e: any) => {
    const el = getActionEl(e.target);
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
    else if (action === 'load-order-stats') void loadOrderStats();
    else if (action === 'archive-old-orders') void archiveOldOrders();
    else if (action === 'delete-archived-orders') void deleteArchivedOrders();
    else if (action === 'table-checkout') (window as any).handleTableCheckout?.(table || '');
    else if (action === 'table-print') void handlePrintTableUI(table || '');
    else if (action === 'table-order') handleTableOrderForTable(table || '');
    else if (action === 'table-details') handleTableDetailsForTable(table || '');
    else if (action === 'table-modify') handleModifyTable(table || '');
    else if (action === 'table-remarks') handleTableRemarksForTable(table || '');
    else if (action === 'approve-table-reviews') void approveTableReviews(table || '');
    else if (action === 'reject-table-reviews') void rejectTableReviews(table || '');
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
    else if (action === 'update-password') {
      const form = document.getElementById('password-form') as HTMLFormElement | null;
      const input = form?.querySelector('input[name="new_password"]') as HTMLInputElement | null;
      const newPassword = String(input?.value || '').trim();
      if (!newPassword) return alert('请输入新密码');
      fetch('/api/admin/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      })
        .then((res) => res.json().catch(() => ({})).then((data) => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (ok && data?.success !== false) {
            if (form) form.reset();
            showAdminToast('密码已更新');
          } else {
            alert('更新失败: ' + (data?.error || 'unknown error'));
          }
        })
        .catch(() => {
          alert('网络错误');
        });
    }
    else if (action === 'system-control') {
      const command = String(el.dataset.command || '').trim();
      if (command === 'reboot' || command === 'shutdown') {
        showAdminToast('该系统控制按钮尚未接入');
      }
    }
    else if (action === 'upgrade-business') {
      showAdminToast('升级入口暂未接入');
    }
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
    else if (action === 'load-drivers') {
      await invokeAdminAction(getAdminHandlers(), action, el, e);
    } else if (action === 'save-delivery-type') {
      await invokeAdminAction(getAdminHandlers(), action, el, e);
    } else if (action === 'save-order-edit') (window as any).saveOrderEdit?.();
    else if (action === 'close-order-edit-modal') (window as any).closeOrderEditModal?.();
    else if (action === 'open-add-customer') (window as any).openAddCustomerModal?.();
    else if (action === 'close-add-customer') (window as any).closeAddCustomerModal?.();
    else if (action === 'export-customers') (window as any).exportCustomers?.();
    else if (action === 'gift-points') (window as any).giftPoints?.();
    else if (action === 'set-customer-vip') (window as any).setCustomerVIP?.();
    else if (action === 'open-promotion') (window as any).openPromotionModal?.();
    else if (action === 'close-promotion') (window as any).closePromotionModal?.();
    else if (action === 'save-points-settings') (window as any).savePointsSettings?.();
    else if (action === 'confirm-checkin') (window as any).confirmCheckin?.();
    else if (action === 'close-checkin') (window as any).closeCheckinModal?.();
    else if (action === 'reservation-filter') (window as any).setReservationDateFilter?.(val || '');
    else if (action === 'open-chat') (window as any).openChatForPhone?.(el.dataset.phone || '');
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
