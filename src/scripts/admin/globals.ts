type AdminRuntimeState = {
  shopId?: number | string;
  shopSlug?: string;
  tableConfig?: unknown;
  currentSettings?: any;
  brokerIp?: string;
  mqttSecret?: string;
  shop?: unknown;
};

declare global {
  interface Window {
    __adminRuntime?: AdminRuntimeState;
    __adminHandlers?: Record<string, any>;
    __adminAssignInFlight?: boolean;
    __adminPendingOrderRefresh?: boolean;
  }
}

export function setAdminRuntimeState(state: AdminRuntimeState) {
  if (typeof window === 'undefined') return;
  window.__adminRuntime = {
    ...(window.__adminRuntime || {}),
    ...state,
  };
}

export function getAdminRuntimeState(): AdminRuntimeState {
  if (typeof window === 'undefined') return {};
  return window.__adminRuntime || {};
}

export function getAdminHandlers(): Record<string, any> {
  if (typeof window === 'undefined') return {};
  return (window.__adminHandlers ||= {});
}

export function registerAdminGlobal(name: string, handler: any, exposeOnWindow = true) {
  if (typeof window === 'undefined') return handler;
  const registry = getAdminHandlers();
  registry[name] = handler;
  if (exposeOnWindow) {
    (window as any)[name] = handler;
  }
  return handler;
}

export function getAdminHandler<T = any>(name: string): T | undefined {
  const registry = getAdminHandlers();
  return registry[name] as T | undefined;
}

export function showAdminToast(message: string) {
  const toast = getAdminHandler<(msg: string) => void>('showToast');
  if (typeof toast === 'function') {
    toast(message);
    return;
  }
  console.log('[admin-toast]', message);
}
