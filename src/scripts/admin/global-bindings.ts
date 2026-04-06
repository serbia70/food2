import { enableAudio, playAudio } from './mqtt-audio';
import { showTab, logout, compressImage } from './core';
import { registerAdminGlobal, showAdminToast } from './globals';
import { bindBillingGlobals } from './billing-ui';
import { loadReservations, loadReservationStats } from './reservations';
import { loadStats } from './stats';
import { handleTableCheckout, performCheckout } from './table-actions';
import { updateOrderStatus, markPaid } from './order-actions';
import {
  openEditModal,
  saveEditProd,
  localizeImages,
  moveCategory,
  delCategory,
  moveProduct,
  delProd,
  addProd,
} from './products';
import { openChatForPhone, toggleAdminChat, sendAdminChat } from './user-chat';
import { openRejectModal, closeRejectModal, confirmReject } from './table-management';

export function bindAdminGlobals() {
  if (typeof window.__adminHandlers?.showToast !== 'function') {
    registerAdminGlobal('showToast', (msg: string) => {
      const id = 'admin-toast';
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'position:fixed; left:50%; bottom:24px; transform:translateX(-50%); padding:10px 14px; border-radius:10px; background:rgba(15,23,42,0.92); color:#fff; z-index:99999; box-shadow:0 10px 25px rgba(0,0,0,0.25);';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { if (el) el.style.display = 'none'; }, 2200);
    });
  }

  registerAdminGlobal('showTab', showTab);
  registerAdminGlobal('logout', logout);
  registerAdminGlobal('enableAudio', enableAudio);
  registerAdminGlobal('playAudio', playAudio);
  registerAdminGlobal('loadReservations', loadReservations);
  registerAdminGlobal('loadReservationStats', loadReservationStats);
  registerAdminGlobal('loadStats', loadStats);
  registerAdminGlobal('handleTableCheckout', handleTableCheckout);
  registerAdminGlobal('performCheckout', performCheckout);
  registerAdminGlobal('updateOrderStatus', updateOrderStatus);
  registerAdminGlobal('markPaid', markPaid);
  registerAdminGlobal('openRejectModal', openRejectModal);
  registerAdminGlobal('closeRejectModal', closeRejectModal);
  registerAdminGlobal('confirmReject', confirmReject);

  registerAdminGlobal('openEditModal', openEditModal);
  registerAdminGlobal('saveEditProd', saveEditProd);
  registerAdminGlobal('localizeImages', localizeImages);
  registerAdminGlobal('moveCategory', moveCategory);
  registerAdminGlobal('delCategory', delCategory);
  registerAdminGlobal('moveProduct', moveProduct);
  registerAdminGlobal('delProd', delProd);
  registerAdminGlobal('addProd', addProd);

  registerAdminGlobal('openChatForPhone', openChatForPhone);
  registerAdminGlobal('toggleAdminChat', toggleAdminChat);
  registerAdminGlobal('sendAdminChat', sendAdminChat);

  registerAdminGlobal('testSound', () => playAudio());
  registerAdminGlobal('changeSoundMode', (v: string) => {
    localStorage.setItem('adminSoundMode', v);
    playAudio();
  });
  registerAdminGlobal('refreshOrderList', () => {
    if (window.__adminAssignInFlight) {
      window.__adminPendingOrderRefresh = true;
      return;
    }
    location.reload();
  });

  bindBillingGlobals();

  if (typeof window.__adminHandlers?.triggerUpload !== 'function') {
    registerAdminGlobal('triggerUpload', async (targetInputId?: string) => {
      const targetId = String(targetInputId || '').trim();
      if (!targetId) {
        showAdminToast('未找到图片输入框');
        return;
      }

      const fileInput = document.getElementById('global-file-input') as HTMLInputElement | null;
      if (!fileInput) {
        showAdminToast('上传控件未初始化');
        return;
      }

      fileInput.value = '';
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        const target = document.getElementById(targetId) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!target) {
          showAdminToast('未找到目标输入框');
          return;
        }

        try {
          const uploadFile = await compressImage(file);
          const formData = new FormData();
          formData.append('file', uploadFile);

          showAdminToast('图片上传中...');
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.success === false || !data?.url) {
            throw new Error(data?.error || '上传失败');
          }

          target.value = String(data.url);
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          showAdminToast('图片上传成功');
        } catch (error: any) {
          alert('图片上传失败: ' + (error?.message || error || '未知错误'));
        } finally {
          fileInput.value = '';
        }
      };

      fileInput.click();
    });
  }
}
