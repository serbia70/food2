import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  integrations: [preact()],
  adapter: cloudflare(),
  image: {
    service: {
      entrypoint: "astro/assets/services/noop",
    },
  },
  output: "server",
  distDir: "dist",
  build: {
    format: "file",
  },
  server: {
    port: 3000,
  },
  vite: {
    server: {
      watch: {
        ignored: ["**/.claude/**"],
      },
    },
    ssr: {
      external: ["node:crypto"],
    },
    build: {
      target: ["es2015", "ios12"],
      cssTarget: "chrome61",
    },
  },
});
