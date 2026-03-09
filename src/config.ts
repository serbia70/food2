// API config
export const API_BASE_URL = 'https://api.serbia70.com';

// Master auth token (frontend-visible by design for current flow)
export const MASTER_TOKEN =
  (import.meta as any).env?.PUBLIC_MASTER_TOKEN || 'master-token';

// MQTT config (avoid hardcoded credentials in pages)
export const MQTT_BROKER =
  (import.meta as any).env?.PUBLIC_MQTT_BROKER ||
  'wss://mqtt.serbia70.com:443/mqtt';
export const MQTT_USERNAME =
  (import.meta as any).env?.PUBLIC_MQTT_USERNAME || '';
export const MQTT_PASSWORD =
  (import.meta as any).env?.PUBLIC_MQTT_PASSWORD || '';

export const APP_NAME = 'MeituanGo';
export const APP_VERSION = '1.0.0';

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
