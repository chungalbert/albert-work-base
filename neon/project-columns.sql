-- Project middle-column fields + custom column definitions (shared via Neon Data API).
-- Apply on the same Neon project as neon/schema.sql (ep-divine-meadow-azqo19a2).
-- Safe to re-run.

alter table public.projects
  add column if not exists lenovo_name text not null default '',
  add column if not exists bios_id text not null default '',
  add column if not exists platform text not null default '',
  add column if not exists dis text not null default '',
  add column if not exists ss_date text not null default '',
  add column if not exists eol_date text not null default '',
  add column if not exists security_update text not null default '',
  add column if not exists talent_policy text not null default '',
  add column if not exists owner text not null default '',
  add column if not exists custom jsonb not null default '{}'::jsonb;

create table if not exists public.project_columns (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order integer not null default 0,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists project_columns_label_upper_uidx
  on public.project_columns (upper(trim(label)));

alter table public.project_columns enable row level security;

drop policy if exists project_columns_select on public.project_columns;
create policy project_columns_select on public.project_columns
  for select to authenticated using (true);

drop policy if exists project_columns_insert on public.project_columns;
create policy project_columns_insert on public.project_columns
  for insert to authenticated with check (public.is_admin());

drop policy if exists project_columns_update on public.project_columns;
create policy project_columns_update on public.project_columns
  for update to authenticated using (public.is_admin());

drop policy if exists project_columns_delete on public.project_columns;
create policy project_columns_delete on public.project_columns
  for delete to authenticated using (public.is_admin());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on table public.project_columns to authenticated;
  end if;
end $$;

-- Neon Data API schema cache:
-- NOTIFY pgrst does NOT reliably refresh Neon Auth Data API (unlike self-hosted PostgREST).
-- After DDL, refresh via Neon Console → Data API → "Refresh schema cache", or:
--   neon data-api refresh-schema --project-id … --database neondb
--   PATCH /projects/{id}/branches/{id}/data-api/neondb with Authorization: Bearer $NEON_API_KEY and body {}
-- Optional RPC (best-effort; itself may be missing from the cache until Console refresh):
create or replace function public.reload_pgrst_schema()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'only admin can reload schema cache';
  end if;
  perform pg_notify('pgrst', 'reload schema');
  return 'ok';
end;
$$;

revoke all on function public.reload_pgrst_schema() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.reload_pgrst_schema() to authenticated;
  end if;
end $$;

-- App fallback: custom column defs live in projects.custom on a hidden meta row when
-- Data API intermittently returns PGRST205 for project_columns. All authenticated users
-- must be able to SELECT that row (projects_select normally requires membership).
drop policy if exists projects_select_column_meta on public.projects;
create policy projects_select_column_meta on public.projects
  for select to authenticated
  using (name = '__kssw_meta__');

-- Seed meta row (stable id). Prefer first admin as created_by; else any profile.
insert into public.projects (id, name, description, created_by, custom)
select
  '00000000-0000-4000-8000-0000000000c1'::uuid,
  '__kssw_meta__',
  'System: shared project column definitions',
  p.id,
  jsonb_build_object('__kssw_column_defs', '[]')
from (
  select id from public.profiles where is_admin order by created_at asc limit 1
) p
where not exists (select 1 from public.projects where name = '__kssw_meta__')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
