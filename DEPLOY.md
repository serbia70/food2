# Frontend Deploy (Cloudflare)

This frontend now builds with `@astrojs/cloudflare` (`output: server`).

## 1) Required env vars (Cloudflare project)
- `PUBLIC_API_URL` = your Go backend base URL, e.g. `https://api.your-domain.com`

## Secrets / auth
- Do **NOT** expose secrets as `PUBLIC_*` variables. Anything prefixed with `PUBLIC_` is bundled and browser-visible.
- `PUBLIC_MASTER_TOKEN` / `PUBLIC_MQTT_USERNAME` / `PUBLIC_MQTT_PASSWORD` should be treated as **server-only secrets** (remove from Pages "public" env).
- Prefer backend-issued auth (session cookie / short-lived token) and have the frontend call backend routes that enforce authorization.
- If you still need MQTT credentials, provide them via server-side routes / proxy and keep them in non-public env vars (e.g. `MQTT_USERNAME`, `MQTT_PASSWORD`).

## 2) Build command
Use one package manager consistently. Recommended now:
```bash
npm ci
npm run build
```

## 3) Deploy options
- Cloudflare Pages (Functions)
- Cloudflare Workers via wrangler

`wrangler.toml` is included and can be adapted per environment.

## 4) Local run
```bash
cp .env.example .env
npm install
npm run dev -- --port 3000
```

## Important
- Current code still contains some Node-style API routes (`fs/path`). Build passes, but for strict Worker runtime, continue migrating those routes to Go API.
