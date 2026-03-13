# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

### Install
- `pnpm install`

(Repo has `pnpm-lock.yaml`; prefer pnpm.)

### Local dev
- `pnpm dev` (Astro dev server, defaults to port 3000 via `astro.config.mjs`)
- `pnpm run dev:force` (Astro dev with `--force`)
- `pnpm run dev:reset` (remove `node_modules/.vite` + `node_modules/.astro`, then dev)

### Build / preview
- `pnpm build`
- `pnpm preview`

### Tests (security gates)
This repo uses Node’s built-in test runner for “security gate” checks.

- Run full gate suite:
  - `pnpm run test:security`

- Run a single test file (examples):
  - `node --test scripts/check-no-unsafe-dom-apis.test.mjs`
  - `node --test scripts/check-no-public-secrets-in-src.test.mjs`
  - `node --test src/lib/user-api-route.test.ts`

Note: some gates scan `dist/` and will fail until you build (`pnpm build`).

### Deploy (Cloudflare Pages)
See `DEPLOY.md`.

- Deploy build output:
  - `pnpm build`
  - `npx wrangler pages deploy dist`

## Configuration / environment

- `PUBLIC_API_URL`: backend base URL used by server-side routes and some SSR fetches.
- `PUBLIC_MQTT_BROKER`: MQTT broker URL (browser-visible).

Cloudflare config lives in `wrangler.toml` (e.g. `[vars]` section). `PUBLIC_*` variables are bundled/exposed to the browser; do not put secrets in them (reinforced in `DEPLOY.md`).

## High-level architecture

### Tech stack
- Astro (`astro.config.mjs`) with Cloudflare adapter (`@astrojs/cloudflare`), `output: "server"`.
- Preact islands via `@astrojs/preact`.
- Node `node --test` is used for repository “security gate” checks.

### Request flow (big picture)
- **HTML/UI** is served by Astro pages under `src/pages/**`.
- **Same-origin BFF/API routes** are implemented as Astro API routes under `src/pages/api/**`.
  - These routes proxy to the backend base URL (`API_BASE_URL` from `src/config.ts`), returning backend JSON/text to the browser.
  - Some auth flows set **HttpOnly cookies** (e.g. admin/master tokens) in the API route response.

### Key modules and boundaries
- `src/pages/**`: route-driven UI (Astro pages) and endpoints (under `src/pages/api/**`).
- `src/components/**`: UI components; Preact `.tsx` islands live here.
- `src/lib/**`: shared logic used by pages and API routes:
  - `src/lib/api-proxy.ts`: `proxyFetch()` wrapper with timeout + consistent error JSON.
  - `src/lib/admin-api-route.ts`: helpers for proxying admin requests with auth from header/cookie.
  - Additional `src/lib/*.test.ts` files are Node-test unit tests (run with `node --test`).
- `scripts/**`: repo-level Node tests that enforce security/consistency constraints (many run in `pnpm run test:security`).

### Auth patterns (as implemented here)
- **Admin/master**: API routes can set HttpOnly cookies (e.g. `admin_token`, `master_token`), and server-side proxy helpers read cookies and forward `Authorization` headers to the backend.
- **User**: browser-side user state exists in `src/lib/user-auth.ts` and `src/lib/userStore.ts` (note: README mentions localStorage usage).

### Cloudflare runtime constraints
Astro is configured for Cloudflare (`output: "server"`). Avoid introducing Node-only APIs (e.g. `fs`, `path`) into runtime code that will execute in Pages/Workers; keep Node usage in `scripts/**` and tests.
