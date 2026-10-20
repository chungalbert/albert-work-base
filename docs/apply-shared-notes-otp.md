# Apply shared Note + OTP tables (Supabase)

Production KSSW (GitHub Pages) uses `VITE_SUPABASE_*`. Projects already sync across users via Supabase. Note and OTP must use the same backend — tables `shared_notes` and `otp_vault_entries`.

If these tables are missing, Admin and Lay_Zhang each fall into **per-browser** leftovers and cannot see each other’s OTP/Notes.

## Steps (Supabase Dashboard)

1. Open your project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** → **New query**.
3. Paste the full contents of  
   `supabase/migrations/20261020_shared_notes_otp.sql`  
   (also pasted below) and click **Run**.
4. Confirm under **Table Editor** that `shared_notes` and `otp_vault_entries` exist.
5. Reload KSSW while logged in as Admin.
6. If Admin still has OTP/Notes only on that browser (from the old local fallback), open **Tool › OTP Vault** or **Note** and click **Upload local to shared vault**. Lay_Zhang should then see the same list after refresh.

## CLI (optional)

```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db query --file supabase/migrations/20261020_shared_notes_otp.sql
# or: npx supabase db push
```

## SQL (same as migration file)

```sql
-- Shared sticky notes + OTP vault for all authenticated members (no owner-only list filter).

create table if not exists public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  color text not null default 'blue',
  pinned boolean not null default false,
  url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.otp_vault_entries (
  id text primary key,
  label text not null default '',
  issuer text not null default '',
  account text not null default '',
  secret text not null,
  qr_text text,
  thumb text,
  access_password text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at bigint not null
);

alter table public.shared_notes enable row level security;
alter table public.otp_vault_entries enable row level security;

drop policy if exists shared_notes_select on public.shared_notes;
create policy shared_notes_select on public.shared_notes
  for select to authenticated using (true);

drop policy if exists shared_notes_insert on public.shared_notes;
create policy shared_notes_insert on public.shared_notes
  for insert to authenticated with check (true);

drop policy if exists shared_notes_update on public.shared_notes;
create policy shared_notes_update on public.shared_notes
  for update to authenticated using (true);

drop policy if exists shared_notes_delete on public.shared_notes;
create policy shared_notes_delete on public.shared_notes
  for delete to authenticated using (true);

drop policy if exists otp_vault_select on public.otp_vault_entries;
create policy otp_vault_select on public.otp_vault_entries
  for select to authenticated using (true);

drop policy if exists otp_vault_insert on public.otp_vault_entries;
create policy otp_vault_insert on public.otp_vault_entries
  for insert to authenticated with check (true);

drop policy if exists otp_vault_update on public.otp_vault_entries;
create policy otp_vault_update on public.otp_vault_entries
  for update to authenticated using (true);

drop policy if exists otp_vault_delete on public.otp_vault_entries;
create policy otp_vault_delete on public.otp_vault_entries
  for delete to authenticated using (true);

grant select, insert, update, delete on table public.shared_notes to authenticated;
grant select, insert, update, delete on table public.otp_vault_entries to authenticated;
```

## RLS check

Policies use `using (true)` / `with check (true)` for role `authenticated` — **no owner-only filter** on list. Any logged-in member can SELECT/INSERT/UPDATE/DELETE shared rows (same trust model as an org vault).
