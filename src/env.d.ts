/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_MQTT_BROKER: string;
  readonly PUBLIC_DISPATCH_AUTO_REASSIGN_MINUTES: string;
  readonly PUBLIC_DEFAULT_USER_PASSWORD: string;
  readonly PUBLIC_CART_SUPPRESS_RELOAD_MS: string;
  readonly PUBLIC_API_PROXY_TIMEOUT_MS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
