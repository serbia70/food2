// API config
export const API_BASE_URL =
  (import.meta as any).env?.PUBLIC_API_URL || 'http://localhost:3030';

// Master auth token (frontend-visible by design for current flow)
// NOTE: do NOT provide a usable default token in frontend.
export const MASTER_TOKEN =
  (import.meta as any).env?.PUBLIC_MASTER_TOKEN || '';

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
