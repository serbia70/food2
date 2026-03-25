import { normalizeMasterTab } from './master-active-tab.ts';

export function resolveMasterPanels(activeTab: string) {
  const tab = normalizeMasterTab(activeTab);
  return {
    shops: tab !== 'shops',
    overview: tab !== 'overview',
    settings: tab !== 'settings',
    backup: tab !== 'backup',
  };
}
