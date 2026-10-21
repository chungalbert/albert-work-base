# KSSW API (Cloudflare Worker + Neon)

Replaces Supabase Auth, PostgREST, and Edge Functions for the Vite SPA on GitHub Pages (`/ks-sw-dashboard/`).

## Secrets (do not commit values)

```bash
cd api
npm ci
npx wrangler login   # required once; CI/agent needs CLOUDFLARE_API_TOKEN instead
npx wrangler secret put DATABASE_URL   # Neon pooled URL (sslmode=require)
npx wrangler secret put AUTH_SECRET    # openssl rand -hex 32
# optional:
# npx wrangler secret put CRON_SECRET
# npx wrangler secret put RESEND_API_KEY
# npx wrangler secret put RESEND_FROM
```

Set `CORS_ORIGIN` in `wrangler.toml` (or vars) to the Pages origin, e.g. `https://chungalbert.github.io`.

## Schema

```bash
psql "$DATABASE_URL" -f ../db/schema.sql
# If the DB already had text-id app tables from an earlier attempt:
psql "$DATABASE_URL" -f ../db/repair-align-uuid.sql
```

## Deploy

```bash
npm run deploy
# → copy Worker URL into GitHub Actions secret VITE_API_URL
# → smoke: POST /auth/sign-in then open Pages build with VITE_API_URL
```

Agent environments without Cloudflare login **cannot** deploy; leave secrets only in Wrangler.

## China / reachability

Workers and Neon are overseas. Cellular access from mainland China may still need VPN/Wi‑Fi — same class of issue as Supabase.
