import { getAdminRuntimeState, registerAdminGlobal, showAdminToast } from './globals';
import { buildTableConfigPayloadFromDOM } from './table-config-payload';

type SettingsSubmitOptions = {
  successMessage?: string;
  reload?: boolean;
};

function createZoneField(className: string, placeholder: string, value: string, flex: string, type = 'text') {
  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  input.className = className;
  input.value = value;
  input.style.flex = flex;
  input.style.padding = '8px';
  input.style.border = '1px solid #ddd';
  input.style.borderRadius = '4px';
  if (type === 'number') input.style.width = '80px';
  return input;
}

export function initSettingsUI(onSaved: () => void) {
  const mergeSettings = (base: Record<string, any>, patch: Record<string, unknown>) => ({
    ...base,
    ...patch,
    contact: {
      ...((base.contact && typeof base.contact === 'object') ? base.contact : {}),
      ...(((patch as any).contact && typeof (patch as any).contact === 'object') ? (patch as any).contact : {}),
    },
    currency: {
      ...((base.currency && typeof base.currency === 'object') ? base.currency : {}),
      ...(((patch as any).currency && typeof (patch as any).currency === 'object') ? (patch as any).currency : {}),
    },
    telegram: {
      ...((base.telegram && typeof base.telegram === 'object') ? base.telegram : {}),
      ...(((patch as any).telegram && typeof (patch as any).telegram === 'object') ? (patch as any).telegram : {}),
    },
    delivery: {
      ...((base.delivery && typeof base.delivery === 'object') ? base.delivery : {}),
      ...(((patch as any).delivery && typeof (patch as any).delivery === 'object') ? (patch as any).delivery : {}),
    },
    holidays: {
      ...((base.holidays && typeof base.holidays === 'object') ? base.holidays : {}),
      ...(((patch as any).holidays && typeof (patch as any).holidays === 'object') ? (patch as any).holidays : {}),
    },
    hours: {
      ...((base.hours && typeof base.hours === 'object') ? base.hours : {}),
      ...(((patch as any).hours && typeof (patch as any).hours === 'object') ? (patch as any).hours : {}),
    },
  });

  const submitPayload = async (payload: Record<string, unknown>, options: SettingsSubmitOptions = {}) => {
    try {
      const runtime = getAdminRuntimeState();
      const currentSettings = (runtime.currentSettings && typeof runtime.currentSettings === 'object') ? runtime.currentSettings as Record<string, any> : {};
      const mergedPayload = mergeSettings(currentSettings, payload);
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergedPayload),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.success) {
        runtime.currentSettings = mergedPayload;
        onSaved();
        showAdminToast(options.successMessage || '保存成功');
        if (options.reload !== false) {
          setTimeout(() => location.reload(), 800);
        }
        return true;
      }
      showAdminToast('保存失败: ' + ((data && data.error) || '未知错误'));
      return false;
    } catch {
      showAdminToast('网络错误，无法保存设置');
      return false;
    }
  };

  const form = document.getElementById('settings-form') as HTMLFormElement | null;
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      showAdminToast('请使用各分区的保存按钮');
    });
  }

  const zonesContainer = document.getElementById('zones-container');
  const runtime = getAdminRuntimeState();
  const tableConfig = Array.isArray(runtime.tableConfig) ? runtime.tableConfig : [];
  if (zonesContainer) {
    zonesContainer.replaceChildren();
    tableConfig.forEach((zone: any) => {
      const div = document.createElement('div');
      div.className = 'zone-config-item';
      div.style.cssText = 'background:#f9f9f9; padding:10px; border-radius:6px; margin-bottom:10px; display:flex; gap:10px; align-items:center;';
      div.appendChild(createZoneField('zone-name', '区域名称', String(zone.name || ''), '2'));
      div.appendChild(createZoneField('zone-prefix', '前缀', String(zone.prefix || ''), '1'));
      div.appendChild(createZoneField('zone-count', '数量', String(zone.count || 0), '0 0 auto', 'number'));
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.adminAction = 'remove-zone';
      button.textContent = '删除';
      button.style.background = '#ff5252';
      button.style.color = 'white';
      button.style.border = 'none';
      button.style.padding = '6px 10px';
      button.style.borderRadius = '4px';
      button.style.cursor = 'pointer';
      div.appendChild(button);
      zonesContainer.appendChild(div);
    });
  }

  registerAdminGlobal('renderZones', () => {
    const zonesContainer = document.getElementById('zones-container');
    const runtime = getAdminRuntimeState();
    const tableConfig = Array.isArray(runtime.tableConfig) ? runtime.tableConfig : [];
    if (!zonesContainer) return;
    zonesContainer.replaceChildren();
    tableConfig.forEach((zone: any) => {
      const div = document.createElement('div');
      div.className = 'zone-config-item';
      div.style.cssText = 'background:#f9f9f9; padding:10px; border-radius:6px; margin-bottom:10px; display:flex; gap:10px; align-items:center;';
      div.appendChild(createZoneField('zone-name', '区域名称', String(zone.name || ''), '2'));
      div.appendChild(createZoneField('zone-prefix', '前缀', String(zone.prefix || ''), '1'));
      div.appendChild(createZoneField('zone-count', '数量', String(zone.count || 0), '0 0 auto', 'number'));
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.adminAction = 'remove-zone';
      button.textContent = '删除';
      button.style.background = '#ff5252';
      button.style.color = 'white';
      button.style.border = 'none';
      button.style.padding = '6px 10px';
      button.style.borderRadius = '4px';
      button.style.cursor = 'pointer';
      div.appendChild(button);
      zonesContainer.appendChild(div);
    });
  }, false);

  registerAdminGlobal('add-zone', () => {
    const zonesContainer = document.getElementById('zones-container');
    if (!zonesContainer) return;
    const div = document.createElement('div');
    div.className = 'zone-config-item';
    div.style.cssText = 'background:#f9f9f9; padding:10px; border-radius:6px; margin-bottom:10px; display:flex; gap:10px; align-items:center;';
    div.appendChild(createZoneField('zone-name', '区域名称', '', '2'));
    div.appendChild(createZoneField('zone-prefix', '前缀', '', '1'));
    div.appendChild(createZoneField('zone-count', '数量', '1', '0 0 auto', 'number'));
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.adminAction = 'remove-zone';
    button.textContent = '删除';
    button.style.background = '#ff5252';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.padding = '6px 10px';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    div.appendChild(button);
    zonesContainer.appendChild(div);
  });

  registerAdminGlobal('save-table-config', async () => {
    const zonesContainer = document.getElementById('zones-container');
    if (!zonesContainer) {
      showAdminToast('未找到桌台配置区域');
      return;
    }

    const payload = buildTableConfigPayloadFromDOM(zonesContainer);

    try {
      showAdminToast('保存中...');
      const res = await fetch('/api/admin/settings/table-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        showAdminToast('✅ 桌台设置已保存');
        setTimeout(() => location.reload(), 800);
      } else {
        showAdminToast('保存失败: ' + (data?.error || '未知错误'));
      }
    } catch {
      showAdminToast('网络错误，无法保存桌台设置');
    }
  });

  registerAdminGlobal('save-location', async () => {
    const cityNode = document.getElementById('shop-city') as HTMLSelectElement | null;
    const zoneNode = document.getElementById('shop-zone') as HTMLInputElement | null;
    const addressNode = document.getElementById('shop-address') as HTMLInputElement | null;
    const mapUrlNode = document.getElementById('shop-map-url') as HTMLInputElement | null;
    await submitPayload({
      city: cityNode?.value || '',
      zone: zoneNode?.value || '',
      address: addressNode?.value || '',
      contact: {
        map_url: mapUrlNode?.value || '',
      },
    }, { successMessage: '位置信息已保存' });
  });

  registerAdminGlobal('update-shop-name', async () => {
    const shopNameNode = document.getElementById('shop-name-input') as HTMLInputElement | null;
    await submitPayload({
      name: shopNameNode?.value || '',
    }, { successMessage: '店铺名称已保存' });
  });

  registerAdminGlobal('update-shop-category', async () => {
    const shopCategoryNode = document.getElementById('shop-category-input') as HTMLSelectElement | null;
    const phoneNode = document.querySelector('input[name="contact_phone"]') as HTMLInputElement | null;
    await submitPayload({
      category: shopCategoryNode?.value || '',
      contact: {
        phone: phoneNode?.value || '',
      },
    }, { successMessage: '店铺分类与电话已保存' });
  });

  registerAdminGlobal('update-mqtt-secret', async () => {
    const mqttSecretNode = document.getElementById('mqttSecretInput') as HTMLInputElement | null;
    await submitPayload({
      mqtt_secret: mqttSecretNode?.value || '',
    }, { successMessage: '打印机 Secret 已保存' });
  });

  registerAdminGlobal('save-payment-settings', async () => {
    const form = document.getElementById('settings-form') as HTMLFormElement | null;
    const wechatNode = form?.querySelector('input[name="wechat_qr"]') as HTMLInputElement | null;
    const rateNode = document.getElementById('rate-input') as HTMLInputElement | null;
    await submitPayload({
      currency: {
        wechat_qr: wechatNode?.value || '',
        rate: rateNode?.value || '',
      },
    }, { successMessage: '汇率与支付已保存' });
  });

  registerAdminGlobal('save-shop-basics', async () => {
    const shopNameNode = document.getElementById('shop-name-input') as HTMLInputElement | null;
    const shopCategoryNode = document.getElementById('shop-category-input') as HTMLSelectElement | null;
    const phoneNode = document.querySelector('input[name="contact_phone"]') as HTMLInputElement | null;
    const menuTextModeNode = document.getElementById('menu-text-mode') as HTMLInputElement | null;
    const logoPreviewNode = document.getElementById('shop-logo-preview') as HTMLImageElement | null;
    await submitPayload({
      name: shopNameNode?.value || '',
      category: shopCategoryNode?.value || '',
      logo: logoPreviewNode?.getAttribute('src') || '',
      menu_text_mode: menuTextModeNode?.checked === true,
      contact: {
        phone: phoneNode?.value || '',
      },
    }, { successMessage: '店铺基本信息已保存' });
  });

  registerAdminGlobal('save-print-settings', async () => {
    const printOnCheckoutNode = document.getElementById('print-on-checkout') as HTMLInputElement | null;
    await submitPayload({
      print_on_checkout: printOnCheckoutNode?.checked === true,
    }, { successMessage: '打印设置已保存' });
  });

  registerAdminGlobal('save-telegram-settings', async () => {
    const form = document.getElementById('settings-form') as HTMLFormElement | null;
    const tokenNode = form?.querySelector('input[name="tg_token"]') as HTMLInputElement | null;
    const chatIdNode = form?.querySelector('input[name="tg_chat_id"]') as HTMLInputElement | null;
    await submitPayload({
      telegram: {
        token: tokenNode?.value || '',
        chat_id: chatIdNode?.value || '',
      },
    }, { successMessage: 'Telegram 设置已保存' });
  });

  registerAdminGlobal('save-delivery-type', async () => {
    const feeNode = document.querySelector('input[name="fee"]') as HTMLInputElement | null;
    const freeThresholdNode = document.querySelector('input[name="free_threshold"]') as HTMLInputElement | null;
    const zonesNode = document.querySelector('textarea[name="zones"]') as HTMLTextAreaElement | null;
    const deliveryTypeNode = document.getElementById('delivery-type') as HTMLSelectElement | null;
    await submitPayload({
      delivery_type: String(deliveryTypeNode?.value || 'merchant') === 'platform' ? 'platform' : 'merchant',
      delivery: {
        fee: Number(feeNode?.value || 0),
        free_threshold: Number(freeThresholdNode?.value || 0),
        zones: zonesNode?.value || '',
      },
    }, { successMessage: '配送设置已保存' });
  });

  registerAdminGlobal('load-drivers', async () => {
    const listEl = document.getElementById('drivers-list');
    const summaryEl = document.getElementById('drivers-dispatch-summary');
    if (!listEl) return;

    listEl.innerHTML = '<div style="color:#666; font-size:13px;">加载中...</div>';
    if (summaryEl) summaryEl.innerHTML = '';

    try {
      const res = await fetch('/api/rider/status?action=list_available');
      const data = await res.json().catch(() => ({}));
      type RiderInfo = { name?: string; phone?: string; status?: string; telegram_chat_id?: string };
      const riders: RiderInfo[] = Array.isArray(data?.riders)
        ? data.riders.map((r) => {
            const rider = typeof r === 'object' && r !== null ? r as Record<string, unknown> : {};
            return {
              name: typeof rider.name === 'string' ? rider.name : undefined,
              phone: typeof rider.phone === 'string' ? rider.phone : undefined,
              status: typeof rider.status === 'string' ? rider.status : undefined,
              telegram_chat_id: typeof rider.telegram_chat_id === 'string' ? rider.telegram_chat_id : undefined,
            };
          })
        : [];
      listEl.replaceChildren();

      const eligibleCount = riders.filter((rider) => String(rider?.telegram_chat_id || '').trim() !== '').length;
      const blockedCount = riders.length - eligibleCount;
      if (summaryEl) {
        const summaryColor = blockedCount > 0 ? '#e65100' : '#2e7d32';
        summaryEl.innerHTML = `<div style="font-size:13px; padding:10px 12px; border-radius:6px; background:#fff8e1; color:${summaryColor};">当前 available 骑手 <strong>${riders.length}</strong> 人；可接收通知 <strong>${eligibleCount}</strong> 人；因未绑定 Telegram 被拦截 <strong>${blockedCount}</strong> 人。骑手需先在骑手端完成 Telegram 绑定。</div>`;
      }

      if (riders.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#666; font-size:13px; background:#f9f9f9; padding:10px; border-radius:6px;';
        empty.textContent = '当前没有可用骑手。请先注册骑手，并让骑手在骑手端把状态切到 available；offline / busy 不会出现在这里。';
        listEl.appendChild(empty);
        return;
      }

      riders.forEach((rider) => {
        const row = document.createElement('div');
        row.className = 'driver-row';
        row.style.cssText = 'padding:10px; background:#f9f9f9; margin-bottom:8px; border-radius:6px;';

        const name = document.createElement('div');
        name.style.cssText = 'font-weight:600; color:#111;';
        name.textContent = `${String(rider?.name || '未命名骑手')} (${String(rider?.phone || '-')})`;

        const meta = document.createElement('div');
        const status = String(rider?.status || 'offline');
        const tgBound = String(rider?.telegram_chat_id || '').trim() !== '';
        meta.style.cssText = 'margin-top:4px; font-size:12px; color:#666;';
        meta.textContent = `状态: ${status} · Telegram: ${tgBound ? '已绑定' : '未绑定'}`;

        if (!tgBound) {
          const warn = document.createElement('div');
          warn.style.cssText = 'margin-top:6px; font-size:12px; color:#d32f2f; font-weight:700;';
          warn.textContent = '阻断原因：未绑定 Telegram，骑手需先在骑手端完成绑定，点击“通知骑手”也不会收到消息';
          row.append(name, meta, warn);
        } else {
          const ok = document.createElement('div');
          ok.style.cssText = 'margin-top:6px; font-size:12px; color:#2e7d32;';
          ok.textContent = '满足派单条件：可接收 Telegram 通知';
          row.append(name, meta, ok);
        }

        listEl.appendChild(row);
      });
    } catch {
      if (summaryEl) summaryEl.innerHTML = '';
      listEl.innerHTML = '<div style="color:#d32f2f; font-size:13px;">骑手状态加载失败</div>';
    }
  });

  registerAdminGlobal('save-hours-settings', async () => {
    const openNode = document.querySelector('input[name="open"]') as HTMLInputElement | null;
    const closeNode = document.querySelector('input[name="close"]') as HTMLInputElement | null;
    await submitPayload({
      hours: {
        open: openNode?.value || '',
        close: closeNode?.value || '',
      },
    }, { successMessage: '营业时间已保存' });
  });

  registerAdminGlobal('save-holiday-settings', async () => {
    const closedDatesNode = document.querySelector('input[name="closed_dates"]') as HTMLInputElement | null;
    const holidayMessageNode = document.querySelector('input[name="holiday_message"]') as HTMLInputElement | null;
    const holidayEnabledNode = document.getElementById('holiday-enabled') as HTMLInputElement | null;
    await submitPayload({
      holidays: {
        enabled: holidayEnabledNode?.checked === true,
        closed_dates: closedDatesNode?.value || '',
        message: holidayMessageNode?.value || '',
      },
    }, { successMessage: '节假日设置已保存' });
  });

  registerAdminGlobal('open-logo-upload', () => {
    const target = document.getElementById('shop-logo-input') as HTMLInputElement | null;
    if (!target) {
      showAdminToast('未找到 Logo 上传控件');
      return;
    }
    target.click();
  });

  const logoInput = document.getElementById('shop-logo-input') as HTMLInputElement | null;
  const logoPreview = document.getElementById('shop-logo-preview') as HTMLImageElement | null;
  if (typeof window !== 'undefined') {
    const loadDrivers = (window as any)['load-drivers'];
    if (typeof loadDrivers === 'function') {
      void loadDrivers();
    }
  }
  if (logoInput && logoPreview) {
    logoInput.addEventListener('change', async () => {
      const file = logoInput.files && logoInput.files[0];
      if (!file) return;

      try {
        showAdminToast('Logo 上传中...');
        const uploadFile = file;
        const formData = new FormData();
        formData.append('file', uploadFile);
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false || !data?.url) {
          throw new Error(data?.error || '上传失败');
        }

        const uploadedUrl = String(data.url);
        logoPreview.src = uploadedUrl;
        logoInput.dataset.uploadedUrl = uploadedUrl;
        await submitPayload({
          logo: uploadedUrl,
        }, { successMessage: '店铺 Logo 已保存' });
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showAdminToast('Logo 上传失败: ' + message);
      } finally {
        logoInput.value = '';
      }
    });
  }
}
