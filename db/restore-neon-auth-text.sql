-- Restore app tables to ks-sw-dashboard_test Neon Auth shape (text profile ids).
-- Run before neon/schema.sql if a Worker-oriented uuid repair was applied.

alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.project_members drop constraint if exists project_members_user_id_fkey;
alter table public.projects drop constraint if exists projects_created_by_fkey;
alter table public.tasks drop constraint if exists tasks_assignee_id_fkey;
alter table public.tasks drop constraint if exists tasks_analyzed_by_fkey;
alter table public.shared_notes drop constraint if exists shared_notes_created_by_fkey;
alter table public.otp_vault_entries drop constraint if exists otp_vault_entries_created_by_fkey;

alter table public.profiles
  alter column id type text using id::text;
alter table public.projects
  alter column created_by type text using created_by::text;
alter table public.project_members
  alter column user_id type text using user_id::text;
alter table public.tasks
  alter column assignee_id type text using assignee_id::text,
  alter column analyzed_by type text using analyzed_by::text;
alter table public.shared_notes
  alter column created_by type text using created_by::text;
alter table public.otp_vault_entries
  alter column created_by type text using created_by::text;

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

-- Optional Worker tables are unused by Neon Auth; leave in place empty or drop manually later.
