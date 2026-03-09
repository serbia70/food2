/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_MQTT_BROKER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
