export type FetchJSONResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
};

function unwrapCanonicalData<T>(value: unknown): T | null {
  if (
    value
    && typeof value === 'object'
    && 'ok' in value
    && (value as { ok?: unknown }).ok === true
    && 'data' in value
  ) {
    return ((value as { data?: T | null }).data ?? null) as T | null;
  }

  return (value as T | null) ?? null;
}

export async function fetchJSON<T = unknown>(url: string, init: RequestInit = {}): Promise<FetchJSONResult<T>> {
  const mergedInit: RequestInit = {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init.headers || {}),
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  };
  const method = String(mergedInit.method || 'GET').toUpperCase();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, mergedInit);
      const text = await res.text();
      let data: T | null = null;
      try {
        const parsed = text ? JSON.parse(text) : null;
        data = unwrapCanonicalData<T>(parsed);
      } catch {
        data = null;
      }
      return { ok: res.ok, status: res.status, data };
    } catch {
      if (method === 'GET' && attempt === 0) continue;
      return { ok: false, status: 503, data: null };
    }
  }

  return { ok: false, status: 503, data: null };
}
