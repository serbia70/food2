export type FetchJSONResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  code?: string;
  errorDetail?: string;
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

export async function fetchJSON<T = unknown>(url: string | URL, init: RequestInit = {}): Promise<FetchJSONResult<T>> {
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
      let parsed: unknown = null;
      let parsedOk = false;
      try {
        parsed = text ? JSON.parse(text) : null;
        parsedOk = true;
      } catch {
        parsed = null;
      }
      const data = parsedOk ? unwrapCanonicalData<T>(parsed) : null;
      const error = parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string'
        ? String((parsed as { error?: unknown }).error || '').trim()
        : undefined;
      const code = parsed && typeof parsed === 'object' && typeof (parsed as { code?: unknown }).code === 'string'
        ? String((parsed as { code?: unknown }).code || '').trim()
        : undefined;
      const errorDetail = text.trim() || undefined;
      const shouldRetryGet = method === 'GET' && attempt === 0 && (
        res.status === 502 || res.status === 503 || res.status === 504 || (!parsedOk && text.trim() !== '')
      );
      if (shouldRetryGet) continue;
      return { ok: res.ok, status: res.status, data, error, code, errorDetail };
    } catch {
      if (method === 'GET' && attempt === 0) continue;
      return { ok: false, status: 503, data: null, error: 'fetch_failed', errorDetail: 'fetch_failed' };
    }
  }

  return { ok: false, status: 503, data: null, error: 'fetch_failed', errorDetail: 'fetch_failed' };
}
