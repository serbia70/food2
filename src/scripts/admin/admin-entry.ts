import { initMqtt } from './mqtt-audio';
import { showTab } from './core';
import { getAdminRuntimeState, registerAdminGlobal, showAdminToast } from './globals';
import { loadFeeDailySummary } from './billing-ui';
import { loadReservations, loadReservationStats } from './reservations';
import { loadStats, initDefaultDatesAndLoad } from './stats';
import { initSettingsUI } from './settings-ui';
import { initOrderEditUI } from './order-edit-ui';
import { initAdminChatUI } from './user-chat';
import { bindAdminGlobals } from './global-bindings';
import { bindAdminClickDelegation } from './click-delegation';
import './orders';
import './data';

// --- Order Edit State ---
let currentOrderId: string | number | null = null;
let currentOrderItems: any = null;

const handleEditOrder = (el: any) => {
  if (!el || !el.dataset) return;
  const orderId = el.dataset.orderId || el.dataset.oid;
  const orderNo = el.dataset.orderNo || '';
  
  // 优化：尝试从按钮获取，若无则从对应的 .hidden-data 获取
  let itemsRaw = el.dataset.items;
  if (!itemsRaw) {
    const hidden = document.querySelector(`.hidden-data[data-oid="${orderId}"]`) as HTMLElement;
    itemsRaw = hidden?.dataset?.items;
  }
  
  currentOrderId = orderId;
  try {
    const items = typeof itemsRaw === 'string' ? JSON.parse(itemsRaw) : (itemsRaw || []);
    // 转换为对象格式便于操作
    currentOrderItems = {};
    if (Array.isArray(items)) {
      items.forEach((it, idx) => { currentOrderItems['item_' + Date.now() + idx] = { ...it }; });
    } else {
      currentOrderItems = { ...items };
    }
  } catch (e) { currentOrderItems = {}; }

  const openOrderEditModal = window.__adminHandlers?.openOrderEditModal;
  if (typeof openOrderEditModal === 'function') openOrderEditModal(orderId, orderNo);
  const renderOrderItems = window.__adminHandlers?.renderOrderItems;
  if (typeof renderOrderItems === 'function') renderOrderItems();
};

// --- Initialization ---

export const initAdminPage = () => {
  try {
    bindAdminGlobals();
    const lastTab = localStorage.getItem('adminLastTab') || 'orders';
    showTab(lastTab);
    const runtime = getAdminRuntimeState();
    initMqtt(String(runtime.shopSlug || ''), String(runtime.mqttSecret || 'default'), String(runtime.brokerIp || ''), runtime.currentSettings);
    initAdminChatUI();
    const orderEditUI = initOrderEditUI({
      getCurrentOrderId: () => currentOrderId,
      getCurrentOrderItems: () => currentOrderItems,
      setCurrentOrderItems: (items) => { currentOrderItems = items; },
      handleEditOrder,
    });
    registerAdminGlobal('renderOrderItems', orderEditUI.renderOrderItems);
    bindAdminClickDelegation({
      handleEditOrder,
      getCurrentOrderId: () => currentOrderId,
    });
    initSettingsUI(() => showAdminToast('✅ 设置已全部保存'));
    initDefaultDatesAndLoad();
    void loadFeeDailySummary();
    console.log('[admin-entry] initialized');
  } catch (error) {
    console.error('[admin-entry] init failed', error);
  }
};


// Auto-run
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminPage, { once: true });
} else {
  initAdminPage();
}
