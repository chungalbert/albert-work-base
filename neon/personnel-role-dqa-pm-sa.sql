-- Expand profiles.personnel_role check to include DQA / PM / SA.
-- Safe to re-run. Apply after neon/personnel-role.sql (or alone if column exists).

alter table public.profiles
  drop constraint if exists profiles_personnel_role_check;

alter table public.profiles
  add constraint profiles_personnel_role_check
  check (personnel_role in ('Admin', 'DM', 'DL', 'DE', 'DQA', 'PM', 'SA'));

notify pgrst, 'reload schema';
