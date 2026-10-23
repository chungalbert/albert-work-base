-- SA / PM / DQA Owner as free-text names on security_roster (UI after Reviewer, before Status).
-- Replaces earlier *_owner_id FK columns if present. Safe to re-run.
-- Apply after neon/security.sql. Then Data API → Refresh schema cache.

alter table public.security_roster drop constraint if exists security_roster_sa_owner_id_fkey;
alter table public.security_roster drop constraint if exists security_roster_pm_owner_id_fkey;
alter table public.security_roster drop constraint if exists security_roster_dqa_owner_id_fkey;

alter table public.security_roster
  add column if not exists sa_owner text not null default '',
  add column if not exists pm_owner text not null default '',
  add column if not exists dqa_owner text not null default '';

-- If legacy FK id columns exist, copy display names then drop them.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'security_roster' and column_name = 'sa_owner_id'
  ) then
    update public.security_roster r
    set sa_owner = coalesce(nullif(trim(p.display_name), ''), r.sa_owner)
    from public.profiles p
    where r.sa_owner_id is not null
      and r.sa_owner_id = p.id
      and coalesce(trim(r.sa_owner), '') = '';

    update public.security_roster r
    set pm_owner = coalesce(nullif(trim(p.display_name), ''), r.pm_owner)
    from public.profiles p
    where r.pm_owner_id is not null
      and r.pm_owner_id = p.id
      and coalesce(trim(r.pm_owner), '') = '';

    update public.security_roster r
    set dqa_owner = coalesce(nullif(trim(p.display_name), ''), r.dqa_owner)
    from public.profiles p
    where r.dqa_owner_id is not null
      and r.dqa_owner_id = p.id
      and coalesce(trim(r.dqa_owner), '') = '';

    alter table public.security_roster drop column sa_owner_id;
    alter table public.security_roster drop column pm_owner_id;
    alter table public.security_roster drop column dqa_owner_id;
  end if;
end $$;

notify pgrst, 'reload schema';
