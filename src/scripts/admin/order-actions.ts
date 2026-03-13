
import { getAdminRuntimeState, registerAdminGlobal, showAdminToast } from './globals';

// ================== Delivery Modal Logic ==================

export function openDeliveryModal(orderId: string) {
  const modal = document.getElementById("delivery-modal");
  const listEl = document.getElementById("driver-select-list");
  if (!modal || !listEl) return;

  // Store current order ID on the modal for confirmation
  modal.dataset.orderId = orderId;

  const drivers = getAdminRuntimeState().currentSettings?.drivers || [];
  listEl.replaceChildren();
  
  if (drivers.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#999';
    empty.style.textAlign = 'center';
    empty.style.padding = '10px';
    empty.textContent = '暂无保存的骑手，请手动输入或在设置中添加';
    listEl.appendChild(empty);
  } else {
    drivers.forEach((d: any, idx: number) => {
      const option = document.createElement('div');
      option.className = 'driver-option';
      option.style.padding = '10px';
      option.style.borderBottom = '1px solid #eee';
      option.style.cursor = 'pointer';
      option.style.display = 'flex';
      option.style.justifyContent = 'space-between';
      option.style.alignItems = 'center';
      option.addEventListener('click', () => {
        const radios = document.querySelectorAll('input[name="driver-radio"]');
        if (radios[idx]) (radios[idx] as HTMLInputElement).checked = true;
      });

      const textWrap = document.createElement('div');
      const name = document.createElement('div');
      name.style.fontWeight = 'bold';
      name.textContent = String(d?.name || '');
      const phone = document.createElement('div');
      phone.style.fontSize = '12px';
      phone.style.color = '#666';
      phone.textContent = String(d?.phone || '');
      textWrap.append(name, phone);

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'driver-radio';
      radio.value = String(idx);

      option.append(textWrap, radio);
      listEl.appendChild(option);
    });
  }

  // Clear manual inputs
  const nameInput = document.getElementById("temp-driver-name") as HTMLInputElement;
  const phoneInput = document.getElementById("temp-driver-phone") as HTMLInputElement;
  if (nameInput) nameInput.value = "";
  if (phoneInput) phoneInput.value = "";

  modal.style.display = "flex";
}

export function closeDeliveryModal() {
  const modal = document.getElementById("delivery-modal");
  if (modal) {
    modal.style.display = "none";
    delete modal.dataset.orderId;
  }
}

// Expose helper for onclick selection
registerAdminGlobal('selectDriver', (idx: number) => {
    const radios = document.querySelectorAll('input[name="driver-radio"]');
    if(radios[idx]) (radios[idx] as HTMLInputElement).checked = true;
});

export async function confirmDelivery() {
    const modal = document.getElementById("delivery-modal");
    if (!modal || !modal.dataset.orderId) return;
    
    const orderId = modal.dataset.orderId;
    
    // Check selection
    let driverName = "";
    let driverPhone = "";
    
    const checked = document.querySelector('input[name="driver-radio"]:checked') as HTMLInputElement;
    if (checked) {
        const idx = parseInt(checked.value);
        const drivers = getAdminRuntimeState().currentSettings?.drivers || [];
        if (drivers[idx]) {
            driverName = drivers[idx].name;
            driverPhone = drivers[idx].phone;
        }
    }
    
    // Check manual input (overrides selection)
    const nameInput = document.getElementById("temp-driver-name") as HTMLInputElement;
    const phoneInput = document.getElementById("temp-driver-phone") as HTMLInputElement;
    
    if (nameInput && nameInput.value.trim()) {
        driverName = nameInput.value.trim();
        driverPhone = phoneInput?.value.trim() || "";
    }
    
    if (!driverName) {
        showAdminToast("请选择骑手或输入姓名");
        return;
    }
    
    await updateOrderStatus(orderId, 'delivering', { name: driverName, phone: driverPhone });
    closeDeliveryModal();
}

export async function updateOrderStatus(orderId: string | number, status: string, driverInfo: any = null) {
  try {
    const payload: any = { status };
    if (driverInfo) {
      payload.courier_name = driverInfo.name;
      payload.courier_phone = driverInfo.phone;
    }
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast("状态已更新");
      setTimeout(() => location.reload(), 1000);
    } else {
      showAdminToast("更新失败: " + data.error);
    }
  } catch (e) {
    showAdminToast("网络错误");
  }
}

export async function markPaid(orderId: string | number) {
  if (!confirm("确定标记为已支付吗？")) return;
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast("标记成功");
      setTimeout(() => location.reload(), 1000);
    } else {
      showAdminToast("操作失败: " + data.error);
    }
  } catch (e) {
    showAdminToast("网络错误");
  }
}
