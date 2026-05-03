# Frontend Deploy (Cloudflare)

This frontend now builds with `@astrojs/cloudflare` (`output: server`).

## 1) Required env vars (Cloudflare project)
- `PUBLIC_API_URL` = your Go backend base URL, e.g. `https://api.your-domain.com`

## Secrets / auth
- Do **NOT** expose secrets as `PUBLIC_*` variables. Anything prefixed with `PUBLIC_` is bundled and browser-visible.
- **This frontend must not hold any usable credentials** (master token / MQTT username/password).
- Master operations should rely on cookie/header based auth (login flow) rather than a baked-in or env-provided token.
- MQTT username/password in the browser is not supported by this build (realtime may be degraded if broker requires auth).
- If you still need MQTT credentials anywhere, keep them server-side only (non-public env vars) and proxy through authenticated routes.

## 2) Build command
Use one package manager consistently. Recommended now:
```bash
pnpm install --frozen-lockfile
pnpm build
```

## 3) Deploy options
- Cloudflare Pages (Functions)
- Cloudflare Workers via wrangler

`wrangler.toml` is included and can be adapted per environment.

## 4) Local run
```bash
cp .env.example .env
pnpm install
pnpm dev -- --port 3000
```

## Important
- Current code still contains some Node-style API routes (`fs/path`). Build passes, but for strict Worker runtime, continue migrating those routes to Go API.
