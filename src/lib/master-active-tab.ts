import type { MasterDashboardTab } from './master-dashboard-view';

export type MasterActiveTab = MasterDashboardTab;

export function normalizeMasterTab(value: unknown): MasterActiveTab {
  const raw = String(value || '').trim();
  if (raw === 'management') return 'shops';
  if (raw === 'shops') return 'shops';
  if (raw === 'overview') return 'overview';
  if (raw === 'settings') return 'settings';
  if (raw === 'backup') return 'backup';
  return 'overview';
}
