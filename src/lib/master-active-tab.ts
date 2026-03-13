export type MasterActiveTab = 'management' | 'overview' | 'settings';

export function normalizeMasterTab(value: unknown): MasterActiveTab {
  const raw = String(value || '').trim();
  if (raw === 'management') return 'management';
  if (raw === 'overview') return 'overview';
  if (raw === 'settings') return 'settings';
  return 'overview';
}
