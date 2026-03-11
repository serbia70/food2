/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_MASTER_TOKEN: string;

  readonly PUBLIC_MQTT_USERNAME: string;
  readonly PUBLIC_MQTT_PASSWORD: string;
  readonly PUBLIC_MQTT_BROKER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
