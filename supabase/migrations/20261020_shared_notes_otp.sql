-- Shared sticky notes + OTP vault for all authenticated members (no owner-only list filter).
-- Apply this migration on the live Supabase project after deploying #33+ Note/OTP cloud paths.
-- Until applied, the app falls back to org localStorage (`awb-store-v1`) for Note/OTP.

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
