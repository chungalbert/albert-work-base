-- Per-cycle security item matrix + project release tracking.
-- Apply after neon/security.sql (+ security-waves.sql). Then Data API → Refresh schema cache.

create table if not exists public.security_cycle_details (
  cycle_id uuid primary key references public.security_cycles(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  release jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.security_cycle_details enable row level security;

drop policy if exists security_cycle_details_all on public.security_cycle_details;
create policy security_cycle_details_all on public.security_cycle_details
  for all to authenticated using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on table public.security_cycle_details to authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
