# Neon + Worker cutover (secrets checklist)

Full plan: store doc `docs/neon-migration-plan.md` (Cursor project Context).

## Albert creates

1. **Neon project** → copy pooled `DATABASE_URL` (never paste into git/issues).
2. **Cloudflare account** (free) → deploy `api/` Worker; approve host URL for China/VPN risk.
3. Apply schema: `psql "$DATABASE_URL" -f db/schema.sql`

## Secrets / env names

| Name | Where |
|------|--------|
| `DATABASE_URL` | `wrangler secret put` |
| `AUTH_SECRET` | `wrangler secret put` |
| `CRON_SECRET` | Worker + optional GitHub Actions |
| `RESEND_API_KEY` / `RESEND_FROM` | Worker (optional) |
| `VITE_API_URL` | GitHub Actions secret for Pages build |

After cutover: clear `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Local offline

No `VITE_API_URL` and no `VITE_SUPABASE_*` → existing `awb-store-v1` / `localApi` mode unchanged.
