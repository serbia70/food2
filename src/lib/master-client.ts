export type MasterClientFetch = (input: string | URL, init?: RequestInit) => Promise<any>;

export type CreateMasterClientOptions = {
  fetch?: MasterClientFetch;
};

export type BackupAction = 'list' | 'create' | 'delete';

export type MasterClient = {
  init: () => Promise<any>;
  manage: (action: string, payload?: Record<string, unknown>) => Promise<any>;
  backup: (action: BackupAction, backupName?: string) => Promise<any>;
  restore: (body: FormData | Record<string, unknown>) => Promise<any>;
  upload: (body: FormData | Record<string, unknown>) => Promise<any>;
  logout: () => Promise<any>;
};

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function jsonPostInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  };
}

function postBodyInit(body: FormData | Record<string, unknown>): RequestInit {
  if (isFormData(body)) {
    return {
      method: 'POST',
      body,
    };
  }
  return jsonPostInit(body);
}

async function safeJson(res: any) {
  if (!res || typeof res.json !== 'function') return undefined;
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export function createMasterClient(options: CreateMasterClientOptions = {}): MasterClient {
  const fetchImpl: MasterClientFetch = options.fetch ?? (globalThis.fetch as any);
  if (!fetchImpl) {
    throw new Error('createMasterClient requires a fetch implementation');
  }

  const initPath = '/api/master/init';
  const managePath = '/api/master/manage';
  const backupPath = '/api/master/backup';
  const restorePath = '/api/master/restore';
  const uploadPath = '/api/master/upload';
  const logoutPath = '/api/master/logout';

  return {
    async init() {
      const res = await fetchImpl(initPath, { method: 'GET' });
      return await safeJson(res);
    },

    async manage(action, payload = {}) {
      const body = { action, ...(payload ?? {}) };
      const res = await fetchImpl(managePath, jsonPostInit(body));
      return await safeJson(res);
    },

    async backup(action, backupName) {
      const name = String(backupName ?? '').trim();
      if (action === 'create' || action === 'delete') {
        if (!name) {
          throw new Error('backupName is required for backup create/delete');
        }
      }

      const body: any = { action };
      if (name) body.backupName = name;
      const res = await fetchImpl(backupPath, jsonPostInit(body));
      return await safeJson(res);
    },

    async restore(body) {
      const res = await fetchImpl(restorePath, postBodyInit(body));
      return await safeJson(res);
    },

    async upload(body) {
      const res = await fetchImpl(uploadPath, postBodyInit(body));
      return await safeJson(res);
    },

    async logout() {
      const res = await fetchImpl(logoutPath, { method: 'POST' });
      return await safeJson(res);
    },
  };
}
