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
3. Project middle columns + custom column defs: apply `neon/project-columns.sql` (alters `projects`, adds `project_columns`). Already applied on `ep-divine-meadow-azqo19a2`.
4. Personnel Role column: apply `neon/personnel-role.sql` (`profiles.personnel_role` Admin/DM/DL/DE). Required so Role edits persist across refresh (not localStorage-only).
5. After that DDL, **refresh the Neon Data API schema cache** (Console → Data API → Refresh schema cache, or `neon data-api refresh-schema`). `NOTIFY pgrst` alone is **not** enough on Neon Auth Data API. Until refresh, `project_columns` INSERT may return intermittent `PGRST205`; the app dual-writes column defs to the hidden `__kssw_meta__` project's `custom` jsonb so **+ ADD COLUMN** still works. Same refresh needed after `personnel-role.sql` or Role UPDATE may 404/unknown column.
6. Ignore deprecated Worker `db/schema.sql` / uuid repair for production.

## Local offline

No `VITE_NEON_URL` and no `VITE_SUPABASE_*` → `awb-store-v1` / `localApi` unchanged.

## Add Member / invite (Neon)

Supabase Edge `invite-members` does **not** exist on Neon Auth (`client.functions` is undefined).  
Production Add Member now uses Better Auth `admin.createUser` + `profiles` insert, password `DEFAULT_PASSWORD` (`abcd1234`).

Prerequisites (already applied on the shared Neon project when this fix landed; re-run `neon/fix-add-member.sql` if needed):

1. RLS: app Admins may insert/update/delete other `profiles` rows.
2. Neon Auth role: each `profiles.is_admin` user must have `neon_auth.user.role = 'admin'` (or Neon Console → Auth → Users → **Make admin**).

## Albert checklist

1. [x] Neon Auth + Data API (test login works).
2. [x] Same Neon host as production cutover target.
3. [x] Pages workflow bakes in the working public `VITE_NEON_URL` (secret set failed; default URL is enough).
4. [ ] **Rotate Neon DB password** if the postgres URL was pasted in chat (Data API URL has no password).
5. [ ] After merge to `main`: confirm production Pages deploy + smoke login on `/ks-sw-dashboard/`.
6. [ ] Do **not** deploy the deprecated `api/` Worker.
7. [ ] Smoke **+ ADD MEMBER** as Admin → new member logs in with `abcd1234`.

## Merge readiness

PR #47 is code-ready to cut over once Albert wants production switched. Prefer: merge → wait for Pages → smoke login → then clear Supabase secrets. Ask before merge if you want a final go-ahead.
