import { isCanonicalImpersonateSuccess } from './master-rider-status-filters.ts';

function extractSetCookieValues(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    return getSetCookie.call(headers).filter((value) => value.trim());
  }

  const combined = headers.get('set-cookie') || '';
  return combined ? [combined] : [];
}

function mergeCookieHeaders(baseCookieHeader: string, responseHeaders: Headers): string {
  const merged = new Map<string, string>();

  for (const chunk of baseCookieHeader.split(';')) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;
    merged.set(key, value);
  }

  for (const setCookieValue of extractSetCookieValues(responseHeaders)) {
    const firstSegment = setCookieValue.split(';', 1)[0]?.trim() || '';
    const separatorIndex = firstSegment.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = firstSegment.slice(0, separatorIndex).trim();
    const value = firstSegment.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;
    merged.set(key, value);
  }

  return Array.from(merged.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
}

export async function fetchJsonWithRetry(url: string | URL, init: RequestInit, attempts = 2): Promise<{ res: Response; data: unknown }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (res.ok || attempt === attempts - 1) {
        return { res, data };
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('fetch_failed');
}

export async function buildAdminCookieHeaderForShop(
  shopId: number,
  requestUrl: URL,
  authHeader: string,
  cookieHeader: string,
): Promise<string> {
  try {
    const impersonateUrl = new URL('/api/master/impersonate-shop', requestUrl);
    const { res: impersonateRes, data: impersonateData } = await fetchJsonWithRetry(impersonateUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({ id: shopId }),
    });
    if (!impersonateRes.ok || !isCanonicalImpersonateSuccess(impersonateData)) return '';
    const mergedCookieHeader = mergeCookieHeaders(cookieHeader, impersonateRes.headers);
    return mergedCookieHeader.includes('admin_token=') ? mergedCookieHeader : '';
  } catch {
    return '';
  }
}
