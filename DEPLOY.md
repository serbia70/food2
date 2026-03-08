# Frontend Deploy (Cloudflare)

This frontend now builds with `@astrojs/cloudflare` (`output: server`).

## 1) Required env vars (Cloudflare project)
- `PUBLIC_API_URL` = your Go backend base URL, e.g. `https://api.your-domain.com`
- `PUBLIC_MASTER_TOKEN` = must match backend `MEITUAN_MASTER_TOKEN`
- optional (browser MQTT):
  - `PUBLIC_MQTT_BROKER`
  - `PUBLIC_MQTT_USERNAME`
  - `PUBLIC_MQTT_PASSWORD`
- optional (server-side MQTT proxy routes):
  - `MQTT_USERNAME`
  - `MQTT_PASSWORD`

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

## Important.
- Current code still contains some Node-style API routes (`fs/path`). Build passes, but for strict Worker runtime, continue migrating those routes to Go API.
