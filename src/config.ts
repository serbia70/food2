// API config
export const API_BASE_URL =
  (import.meta as any).env?.PUBLIC_API_URL || process.env.PUBLIC_API_URL || 'https://food2api.serbia70.com';

export const SITE_BASE_URL =
  (import.meta as any).env?.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://food2.serbia70.com';

// Master auth token
// NOTE: master token must never be read from PUBLIC_* runtime env.
export const MASTER_TOKEN = '';

// MQTT config
// NOTE: Do not read credentials from PUBLIC_* env vars (browser-visible).
export const MQTT_BROKER =
  (import.meta as any).env?.PUBLIC_MQTT_BROKER ||
  'wss://mqtt.serbia70.com:443/mqtt';

// Credentials removed from frontend. Keep placeholders to avoid breaking imports in
// older code paths (should not be used).
export const MQTT_USERNAME = '';
export const MQTT_PASSWORD = '';

export const APP_NAME = 'MeituanGo';
export const APP_VERSION = String(Date.now());

export function parsePositiveIntConfig(value: unknown, fallback: number): number {
  const parsed = Number(String(value ?? '').trim());
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

export const DISPATCH_AUTO_REASSIGN_MINUTES = parsePositiveIntConfig(
  (import.meta as any).env?.PUBLIC_DISPATCH_AUTO_REASSIGN_MINUTES ?? process.env.PUBLIC_DISPATCH_AUTO_REASSIGN_MINUTES,
  5,
);

export function formatPrice(amount: number): string {
  return `RSD ${amount.toLocaleString()}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getShopSlug(): string {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  const match = path.match(/^\/([^\/]+)$/);
  return match ? match[1] : '';
}
