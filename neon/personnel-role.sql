-- Persist Personnel Role (Admin / DM / DL / DE / DQA / PM / SA) on profiles.
-- Safe to re-run. Apply in Neon SQL editor, then refresh Data API schema cache.

alter table public.profiles
  add column if not exists personnel_role text not null default 'DE';

-- Tighten allowed values (drop prior check if re-applied under a new name).
alter table public.profiles
  drop constraint if exists profiles_personnel_role_check;

alter table public.profiles
  add constraint profiles_personnel_role_check
  check (personnel_role in ('Admin', 'DM', 'DL', 'DE', 'DQA', 'PM', 'SA'));

-- Backfill from is_admin so existing Admins keep Admin; others stay DE until edited.
update public.profiles
set personnel_role = 'Admin'
where is_admin = true
  and personnel_role is distinct from 'Admin';

notify pgrst, 'reload schema';
