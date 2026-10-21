# Neon + Worker cutover (secrets checklist)

Full plan: store doc `docs/neon-migration-plan.md` (Cursor project Context).

## Status (2026-10-21)

- [x] Neon DB schema applied (`db/schema.sql` + `db/repair-align-uuid.sql`)
- [x] Tables verified: `users`, `sessions`, `profiles`, `projects`, `project_members`, `tasks`, `shared_notes`, `otp_vault_entries`
- [x] Existing admin profile linked into `users` (temporary password `123456` — change after first login)
- [ ] Cloudflare Worker deploy (**blocked**: no `wrangler login` / API token in this environment)
- [ ] GitHub `VITE_API_URL` (only after Worker is live + smoke login)
- [ ] **Rotate Neon DB password** (connection string was pasted in chat)

Do **not** merge PR #47 or set production `VITE_API_URL` until Worker smoke login works.

## Albert: deploy Worker (Cloudflare)

From a machine where you are logged into Cloudflare:

```bash
cd api
npm ci
npx wrangler login   # or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID

# Paste values when prompted — never commit them
npx wrangler secret put DATABASE_URL
npx wrangler secret put AUTH_SECRET   # openssl rand -hex 32

# Optional
# npx wrangler secret put CRON_SECRET
# npx wrangler secret put RESEND_API_KEY

npx wrangler deploy
# → copy https://kssw-api.<account>.workers.dev
# → GitHub Actions secret VITE_API_URL = that URL
```

Edit `api/wrangler.toml` `CORS_ORIGIN` if the Pages origin differs.

## Secrets / env names

| Name | Where |
|------|--------|
| `DATABASE_URL` | `wrangler secret put` only |
| `AUTH_SECRET` | `wrangler secret put` (`openssl rand -hex 32`) |
| `CRON_SECRET` | Worker + optional GitHub Actions |
| `RESEND_API_KEY` / `RESEND_FROM` | Worker (optional) |
| `VITE_API_URL` | GitHub Actions secret for Pages build |

After cutover: clear `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Local offline

No `VITE_API_URL` and no `VITE_SUPABASE_*` → existing `awb-store-v1` / `localApi` mode unchanged.
