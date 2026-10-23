-- SA / PM / DQA Owner columns on security_roster (after Reviewer, before Status in UI).
-- Apply after neon/security.sql. Then Data API → Refresh schema cache.
-- Safe to re-run.

alter table public.security_roster
  add column if not exists sa_owner_id text references public.profiles(id) on delete set null,
  add column if not exists pm_owner_id text references public.profiles(id) on delete set null,
  add column if not exists dqa_owner_id text references public.profiles(id) on delete set null;

notify pgrst, 'reload schema';
