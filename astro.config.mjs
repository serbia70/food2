import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  integrations: [preact()],
  adapter: cloudflare(),
  output: "server",
  distDir: "dist",
  build: {
    format: "file",
  },
  server: {
    port: 3000,
  },
});
