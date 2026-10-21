-- KSSW Neon schema (no Supabase auth.*). Apply with: psql "$DATABASE_URL" -f db/schema.sql
-- Password hashes / session tokens are owned by the Worker API, not the browser.

create extension if not exists pgcrypto;

-- Auth
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_expires_at_idx on public.sessions(expires_at);

-- App profiles (1:1 with users)
create table if not exists public.profiles (
  id uuid primary key references public.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  unit text not null default '',
  email text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('leader', 'member')),
  primary key (project_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  start_date date not null,
  due_date date not null,
  status text not null default 'opening'
    check (status in ('opening', 'working', 'closing', 'verify')),
  note text not null default '',
  analyzed text not null default '',
  analyzed_by uuid references public.profiles(id) on delete set null,
  analyzed_at timestamptz,
  analyzed_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

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

-- Auto-add creator as project leader
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.created_by, 'leader')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- Authorization is enforced in the Worker API (Neon has no PostgREST/RLS for the SPA).
-- Optional: enable RLS and deny all direct access if using a restricted DB role later.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.shared_notes enable row level security;
alter table public.otp_vault_entries enable row level security;

-- No policies for anon/authenticated browser roles — only the API connection role should bypass RLS
-- (table owner / BYPASSRLS). Do not expose DATABASE_URL to the Vite SPA.
