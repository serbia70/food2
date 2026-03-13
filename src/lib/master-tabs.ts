export function resolveMasterPanels(activeTab: string) {
  return {
    management: activeTab !== 'management',
    overview: activeTab === 'overview' ? false : true,
    settings: activeTab !== 'settings',
  };
}
