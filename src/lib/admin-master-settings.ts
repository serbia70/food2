import { API_BASE_URL } from '../config.ts';

function readAdminAuthFromCookie(rawCookie: string): string {
  for (const chunk of String(rawCookie || '').split(';')) {
    const [rawKey, ...rest] = chunk.split('=');
    if (String(rawKey || '').trim() !== 'admin_token') continue;
    const token = rest.join('=').trim();
    return token ? `Bearer ${token}` : '';
  }
  return '';
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function fetchProtectedAdminMasterSettings(input: {
  authorization?: string;
  cookie?: string;
}): Promise<Record<string, unknown>> {
  const cookie = String(input.cookie || '').trim();
  const authorization = String(input.authorization || '').trim() || readAdminAuthFromCookie(cookie);
  if (!authorization && !cookie) return {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authorization) headers.authorization = authorization;
  if (cookie) headers.cookie = cookie;

  const response = await fetch(`${API_BASE_URL}/api/admin/settings/master`, {
    method: 'POST',
    headers,
    body: '{}',
  }).catch(() => null);
  if (!response?.ok) return {};

  const rawText = await response.text().catch(() => '');
  let rawData: unknown = {};
  if (rawText) {
    try {
      rawData = JSON.parse(rawText);
    } catch {
      rawData = {};
    }
  }

  const normalized = asObject(
    rawData && typeof rawData === 'object' && 'success' in rawData && (rawData as { success?: unknown }).success === true
      ? (rawData as { data?: unknown; settings?: unknown }).data || (rawData as { data?: unknown; settings?: unknown }).settings || rawData
      : rawData,
  );

  return asObject(normalized.settings || normalized);
}
