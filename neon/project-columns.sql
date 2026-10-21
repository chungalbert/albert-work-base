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
