export function createMasterRuntimeHelpers({
  logoutPath = '/api/master/logout',
  loginPath = '/master/login',
}: {
  logoutPath?: string;
  loginPath?: string;
} = {}) {
  function parseRuntimeObject(jsonText: string) {
    try {
      const parsed = JSON.parse(jsonText || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function parseRuntimeArray(jsonText: string) {
    try {
      const parsed = JSON.parse(jsonText || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function createRuntimeState(input: Record<string, unknown>) {
    return {
      shopViewsData: String(input.shopViewsData || '[]'),
      shopEditPanelData: String(input.shopEditPanelData || '{}'),
      shopTopupPanelData: String(input.shopTopupPanelData || '{}'),
      shopDineInPanelData: String(input.shopDineInPanelData || '{}'),
      canLoadProtectedMasterActions: Boolean(input.canLoadProtectedMasterActions),
    };
  }

  function isUnauthorizedResponse(res: Response | null | undefined, data: unknown) {
    return (res && res.status === 401) || (data && typeof data === 'object' && 'error' in data && data.error === 'unauthorized');
  }

  async function handleMasterUnauthorized() {
    try {
      await fetch(logoutPath, { method: 'POST' });
    } catch {}
    window.location.href = loginPath;
  }

  return {
    parseRuntimeObject,
    parseRuntimeArray,
    createRuntimeState,
    isUnauthorizedResponse,
    handleMasterUnauthorized,
  };
}
