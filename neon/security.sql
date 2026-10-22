-- KSSW Security Update (BIOS Security Updates) — apply in Neon SQL editor after Auth + Data API.
-- Then Console → Data API → Refresh schema cache.
-- TODO: until this is applied, the app persists Security data in localStorage (awb-security-v1).

create extension if not exists pgcrypto;

create table if not exists public.security_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cycle_type text not null default 'Quarter',
  quarter text not null,
  wave1_date text not null default '',
  wave2_date text not null default '',
  external_release_date text not null default '',
  project_ids jsonb not null default '[]'::jsonb,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.security_roster (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.security_cycles(id) on delete cascade,
  project_id text not null default '',
  project_name text not null,
  wave text not null default 'Not set',
  owner_id text references public.profiles(id) on delete set null,
  reviewer_id text references public.profiles(id) on delete set null,
  status text not null default 'Not Started',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists security_roster_cycle_idx on public.security_roster (cycle_id);

create table if not exists public.security_issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  oem_request_id text not null default '',
  detail text not null default '',
  cycle_ids jsonb not null default '[]'::jsonb,
  project_ids jsonb not null default '[]'::jsonb,
  project_names text not null default '',
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.security_cycles enable row level security;
alter table public.security_roster enable row level security;
alter table public.security_issues enable row level security;

drop policy if exists security_cycles_all on public.security_cycles;
create policy security_cycles_all on public.security_cycles
  for all to authenticated using (true) with check (true);

drop policy if exists security_roster_all on public.security_roster;
create policy security_roster_all on public.security_roster
  for all to authenticated using (true) with check (true);

drop policy if exists security_issues_all on public.security_issues;
create policy security_issues_all on public.security_issues
  for all to authenticated using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on table public.security_cycles to authenticated;
    grant select, insert, update, delete on table public.security_roster to authenticated;
    grant select, insert, update, delete on table public.security_issues to authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
