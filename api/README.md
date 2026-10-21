# KSSW API (Cloudflare Worker + Neon)

Replaces Supabase Auth, PostgREST, and Edge Functions for the Vite SPA on GitHub Pages (`/ks-sw-dashboard/`).

## Secrets (do not commit values)

```bash
cd api
npm ci
npx wrangler secret put DATABASE_URL   # Neon pooled connection string
npx wrangler secret put AUTH_SECRET    # long random string
npx wrangler secret put CRON_SECRET    # optional, reminders
# optional: RESEND_API_KEY, RESEND_FROM
```

Set `CORS_ORIGIN` in `wrangler.toml` (or vars) to the Pages origin, e.g. `https://chungalbert.github.io`.

## Schema

```bash
psql "$DATABASE_URL" -f ../db/schema.sql
```

## Deploy

```bash
npm run deploy
# → copy Worker URL into GitHub Actions secret VITE_API_URL
```

## China / reachability

Workers and Neon are overseas. Cellular access from mainland China may still need VPN/Wi‑Fi — same class of issue as Supabase.
