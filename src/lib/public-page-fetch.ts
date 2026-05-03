export type PublicPageFetchResult<T = unknown> = {
  response: Response;
  data: T | null;
};

function shouldRetryGet(response: Response, text: string, parsedOk: boolean, attempt: number): boolean {
  if (attempt > 0) return false;
  if (!response.ok && (response.status === 502 || response.status === 503 || response.status === 504)) {
    return true;
  }
  return !parsedOk && text.trim() !== '';
}

export async function fetchJsonWithSingleRetry<T = unknown>(url: string, init: RequestInit = {}): Promise<PublicPageFetchResult<T>> {
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
      const response = await fetch(url, mergedInit);
      const text = await response.text();
      let data: T | null = null;
      let parsedOk = false;
      try {
        data = text ? JSON.parse(text) as T : null;
        parsedOk = true;
      } catch {
        data = null;
      }
      if (method === 'GET' && shouldRetryGet(response, text, parsedOk, attempt)) {
        continue;
      }
      return { response, data };
    } catch {
      if (method === 'GET' && attempt === 0) {
        continue;
      }
      return { response: new Response('Upstream unavailable', { status: 503 }), data: null };
    }
  }

  return { response: new Response('Upstream unavailable', { status: 503 }), data: null };
}
