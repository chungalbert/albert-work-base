-- Align pre-existing Neon app tables (text profile ids + Supabase-style RLS)
-- with Worker auth tables (users/sessions uuid). Safe to re-run.

-- Drop browser/PostgREST policies that reference auth.* (API uses table-owner connection).
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop trigger if exists profiles_first_admin on public.profiles;
drop function if exists public.set_first_admin();
-- Keep is_admin() if present; Drop helpers that depend on auth.uid if any.
drop function if exists public.is_project_member(uuid);
drop function if exists public.is_project_leader(uuid);

-- Convert profile-linked text columns to uuid (ids already look like UUIDs).
alter table public.project_members drop constraint if exists project_members_user_id_fkey;
alter table public.projects drop constraint if exists projects_created_by_fkey;
alter table public.tasks drop constraint if exists tasks_assignee_id_fkey;
alter table public.tasks drop constraint if exists tasks_analyzed_by_fkey;
alter table public.shared_notes drop constraint if exists shared_notes_created_by_fkey;
alter table public.otp_vault_entries drop constraint if exists otp_vault_entries_created_by_fkey;

alter table public.profiles
  alter column id type uuid using id::uuid;
alter table public.projects
  alter column created_by type uuid using created_by::uuid;
alter table public.project_members
  alter column user_id type uuid using user_id::uuid;
alter table public.tasks
  alter column assignee_id type uuid using nullif(assignee_id, '')::uuid,
  alter column analyzed_by type uuid using nullif(analyzed_by, '')::uuid;
alter table public.shared_notes
  alter column created_by type uuid using nullif(created_by, '')::uuid;
alter table public.otp_vault_entries
  alter column created_by type uuid using nullif(created_by, '')::uuid;

-- Ensure every profile has a users row (password must be set by app/seed; placeholder rejected by verify).
insert into public.users (id, email, username, password_hash)
select p.id, p.email, p.username, 'pbkdf2$0$00$00'
from public.profiles p
left join public.users u on u.id = p.id
where u.id is null
on conflict (id) do nothing;

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references public.users(id) on delete cascade;

alter table public.projects
  add constraint projects_created_by_fkey foreign key (created_by) references public.profiles(id);
alter table public.project_members
  add constraint project_members_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.tasks
  add constraint tasks_assignee_id_fkey foreign key (assignee_id) references public.profiles(id) on delete set null,
  add constraint tasks_analyzed_by_fkey foreign key (analyzed_by) references public.profiles(id) on delete set null;
alter table public.shared_notes
  add constraint shared_notes_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.otp_vault_entries
  add constraint otp_vault_entries_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

-- Recreate project-leader trigger if missing
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
