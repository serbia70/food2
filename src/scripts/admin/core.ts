
import { getAdminHandler } from './globals';

export function showTab(tabName: string) {
  let selected = document.getElementById('tab-' + tabName);
  let btn = document.querySelector(`button[data-admin-action="show-tab"][data-tab-name="${tabName}"]`);
  if (!selected || !btn) {
    tabName = 'orders';
    selected = document.getElementById('tab-orders');
    btn = document.querySelector(`button[data-tab-name="orders"]`);
  }
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active-content'));
  if (selected) selected.classList.add('active-content');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  localStorage.setItem('adminLastTab', tabName);
  
  const renderZones = getAdminHandler<() => void>('renderZones');
  const loadReservationStats = getAdminHandler<() => void>('loadReservationStats');
  const loadReservations = getAdminHandler<() => void>('loadReservations');
  const loadFeeDailySummary = getAdminHandler<() => void>('loadFeeDailySummary');

  if (tabName === 'settings' && typeof renderZones === 'function') renderZones();
  if (tabName === 'reservations') {
    if (typeof loadReservationStats === 'function') loadReservationStats();
    if (typeof loadReservations === 'function') loadReservations();
  }
  if (tabName === 'renew') {
    if (typeof loadFeeDailySummary === 'function') loadFeeDailySummary();
  }
}


export function logout() {
  if (confirm('确认退出登录吗？')) {
    document.cookie = 'admin_token=; Max-Age=0; path=/';
    location.reload();
  }
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise(resolve => img.onload = resolve);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(blob => resolve(new File([blob!], file.name.replace(/\.[^.]+$/, '.webp'), {type:'image/webp'})), 'image/webp', 0.82));
}
