# Neon Auth + Data API cutover (aligned with ks-sw-dashboard_test)

Working reference: [live test](https://chungalbert.github.io/ks-sw-dashboard_test/) · repo [`chungalbert/ks-sw-dashboard_test`](https://github.com/chungalbert/ks-sw-dashboard_test).

## Architecture (proven)

```
GitHub Pages SPA
  → @neondatabase/neon-js (SupabaseAuthAdapter)
  → Neon Auth + Neon Data API
  → Neon Postgres (RLS via auth.user_id(); profile ids are text)
```

- Env: `VITE_NEON_URL=https://ep-....neon.tech/neondb` (**no** user/password/query).
- Wins over legacy `VITE_SUPABASE_*` when set.
- **No Cloudflare Worker** required for auth/data (unlike the earlier Worker stub under `api/`, now deprecated).
- Invite/reset/delete still call `functions.invoke("invite-members")` — that Edge path is Supabase-era; on Neon-only, prefer Personnel UI extras / follow test-repo behavior until a Neon admin path exists.

## Schema

1. In Neon console: enable **Auth** and **Data API**.
2. Apply `neon/schema.sql` (SQL Editor or `psql`).
3. Do **not** use the Worker-oriented `db/schema.sql` / `db/repair-align-uuid.sql` for production (uuid `users`/`sessions` was a parallel design; test site uses Neon Auth + text profile ids).

## GitHub Actions

Set secret `VITE_NEON_URL` to the same HTTPS URL shape as the test site workflow (host + `/neondb`, no credentials). Clear `VITE_SUPABASE_*` after cutover if unused.

## Local offline

No `VITE_NEON_URL` and no `VITE_SUPABASE_*` → `awb-store-v1` / `localApi` unchanged.

## Albert checklist

1. [x] Neon project with Auth + Data API (test site already uses this project).
2. [ ] Confirm `neon/schema.sql` applied (RLS + `auth.user_id()` helpers).
3. [ ] Set production GitHub secret `VITE_NEON_URL` (same pattern as test; rotate DB password if it was pasted in chat).
4. [ ] Smoke login on a Pages build with `VITE_NEON_URL` before merge to production.
5. [ ] **Do not** deploy the deprecated `api/` Worker for this cutover.
