const DEFAULT_USER_PASSWORD_FALLBACK = "8888";
const CART_SUPPRESS_RELOAD_MS_FALLBACK = 8000;
const API_PROXY_TIMEOUT_MS_FALLBACK = 8000;

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const DEFAULT_USER_PASSWORD =
  (import.meta.env.PUBLIC_DEFAULT_USER_PASSWORD || "").trim() ||
  DEFAULT_USER_PASSWORD_FALLBACK;

export const CART_SUPPRESS_RELOAD_MS = readPositiveInt(
  import.meta.env.PUBLIC_CART_SUPPRESS_RELOAD_MS,
  CART_SUPPRESS_RELOAD_MS_FALLBACK,
);

export const API_PROXY_TIMEOUT_MS = readPositiveInt(
  import.meta.env.PUBLIC_API_PROXY_TIMEOUT_MS,
  API_PROXY_TIMEOUT_MS_FALLBACK,
);
