import { getAdminRuntimeState, registerAdminGlobal, showAdminToast } from './globals';
import { buildAdminSettingsPayload } from './settings-payload';
import { buildTableConfigPayloadFromDOM } from './table-config-payload';

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
  const form = document.getElementById('settings-form') as HTMLFormElement | null;
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const deliveryType = String((document.getElementById('delivery-type') as HTMLSelectElement | null)?.value || 'merchant');
      const driversJson = (document.getElementById('drivers-json') as HTMLInputElement | null)?.value;
      const settings: any = buildAdminSettingsPayload(formData, {
        deliveryType: deliveryType === 'platform' ? 'platform' : 'merchant',
        driversJson: driversJson || '[]',
      });
      try {
        const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
        const data = await res.json();
        if (data.success) {
          onSaved();
          setTimeout(() => location.reload(), 1000);
        } else {
          showAdminToast('保存失败: ' + (data.error || '未知错误'));
        }
      } catch {
        showAdminToast('网络错误，无法保存设置');
      }
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
    showAdminToast('该功能后端接口未接入（暂无法保存位置信息）');
  });
}
