# Neon Auth + Data API cutover (aligned with ks-sw-dashboard_test)

Working reference: [live test](https://chungalbert.github.io/ks-sw-dashboard_test/) · repo [`chungalbert/ks-sw-dashboard_test`](https://github.com/chungalbert/ks-sw-dashboard_test).

## Architecture (proven)

```
GitHub Pages SPA
  → @neondatabase/neon-js (SupabaseAuthAdapter)
  → Neon Auth + Neon Data API
  → Neon Postgres (RLS via auth.user_id(); profile ids are text)
```

## Confirmed working `VITE_NEON_URL` (public — safe to show)

```
https://ep-divine-meadow-azqo19a2.c-3.ap-southeast-1.aws.neon.tech/neondb
```

- Extracted from the live test bundle and the test repo Pages workflow.
- **Same Neon project** as Albert’s shared pooled host `ep-divine-meadow-azqo19a2…` (public HTTPS endpoint; **not** the postgres password URL).
- No user, password, or query string.

## GitHub Actions

`.github/workflows/pages.yml` uses that URL by default (same as test). Optional override: repo secret `VITE_NEON_URL`.

Agent could not set the secret (`gh secret set` → HTTP 403). If you want an explicit secret anyway, paste the URL above into:

**Settings → Secrets and variables → Actions → `VITE_NEON_URL`**

Clear unused `VITE_SUPABASE_*` after cutover.

## Schema

1. Neon console: **Auth** + **Data API** enabled (already used by the test site).
2. Apply `neon/schema.sql` (already applied on this project).
3. Ignore deprecated Worker `db/schema.sql` / uuid repair for production.

## Local offline

No `VITE_NEON_URL` and no `VITE_SUPABASE_*` → `awb-store-v1` / `localApi` unchanged.

## Albert checklist

1. [x] Neon Auth + Data API (test login works).
2. [x] Same Neon host as production cutover target.
3. [x] Pages workflow bakes in the working public `VITE_NEON_URL` (secret set failed; default URL is enough).
4. [ ] **Rotate Neon DB password** if the postgres URL was pasted in chat (Data API URL has no password).
5. [ ] After merge to `main`: confirm production Pages deploy + smoke login on `/ks-sw-dashboard/`.
6. [ ] Do **not** deploy the deprecated `api/` Worker.

## Merge readiness

PR #47 is code-ready to cut over once Albert wants production switched. Prefer: merge → wait for Pages → smoke login → then clear Supabase secrets. Ask before merge if you want a final go-ahead.
