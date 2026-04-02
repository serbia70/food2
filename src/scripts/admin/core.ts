
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
  const loadCustomers = getAdminHandler<() => void>('loadCustomers') || (window as any).loadCustomers;
  const loadStats = getAdminHandler<() => void>('loadStats') || (window as any).loadStats;
  const loadDrivers = getAdminHandler<() => void>('load-drivers') || (window as any)['load-drivers'];
  const loadPromotions = getAdminHandler<() => void>('loadPromotions') || (window as any).loadPromotions;
  const loadMarketingProducts = getAdminHandler<() => void>('loadMarketingProducts') || (window as any).loadMarketingProducts;

  if (tabName === 'settings') {
    if (typeof renderZones === 'function') renderZones();
    if (typeof loadDrivers === 'function') loadDrivers();
  }
  if (tabName === 'reservations') {
    if (typeof loadReservationStats === 'function') loadReservationStats();
    if (typeof loadReservations === 'function') loadReservations();
  }
  if (tabName === 'renew') {
    if (typeof loadFeeDailySummary === 'function') loadFeeDailySummary();
  }
  if (tabName === 'customers' && typeof loadCustomers === 'function') loadCustomers();
  if (tabName === 'stats' && typeof loadStats === 'function') loadStats();
  if (tabName === 'marketing') {
    if (typeof loadPromotions === 'function') loadPromotions();
    if (typeof loadMarketingProducts === 'function') loadMarketingProducts();
  }
}


export function logout() {
  if (confirm('确认退出登录吗？')) {
    fetch('/api/admin/logout', { method: 'POST' })
      .catch(() => {})
      .finally(() => {
        document.cookie = 'admin_token=; Max-Age=0; path=/';
        location.href = location.pathname.replace(/\/?$/, '/login');
      });
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
