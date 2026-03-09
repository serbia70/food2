# Cloudflare Cron Daily Report Example

Use this endpoint to generate yesterday's report for all shops:

- URL: `GET /api/cron/daily-report`
- Auth: `Authorization: Bearer $MEITUAN_CRON_TOKEN`
- Optional query: `date=YYYY-MM-DD`

## Example CF Cron Worker Fetch

```js
await fetch(`${API_BASE}/api/cron/daily-report`, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${CRON_TOKEN}`,
  },
});
```

## Recommended Trigger

- Trigger time: every day at 11:00 (target business timezone)
- Timezone default in backend: `Europe/Belgrade`
- Override timezone with master setting key: `report_timezone`
