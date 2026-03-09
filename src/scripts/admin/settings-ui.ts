import { getAdminRuntimeState, showAdminToast } from './globals';

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
      const settings: any = {
        hours: { open: formData.get('open'), close: formData.get('close') },
        holidays: { enabled: formData.get('holiday_enabled') === 'on', closed_dates: formData.get('closed_dates'), message: formData.get('holiday_message') },
        delivery: { zones: formData.get('zones') },
        print: { auto_print_checkout: formData.get('print-on-checkout') === 'on' },
        drivers: []
      };
      try {
        const driversJson = (document.getElementById('drivers-json') as HTMLInputElement | null)?.value;
        settings.drivers = JSON.parse(driversJson || '[]');
      } catch {}
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
  if (zonesContainer && tableConfig.length > 0) {
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
}
