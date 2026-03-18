export type FetchJSONResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
};

export async function fetchJSON<T = unknown>(url: string, init: RequestInit = {}): Promise<FetchJSONResult<T>> {
  try {
    const mergedInit: RequestInit = {
      ...init,
      cache: 'no-store',
      headers: {
        ...(init.headers || {}),
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    };
    const res = await fetch(url, mergedInit);
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 503, data: null };
  }
}
