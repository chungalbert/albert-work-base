alter table public.tasks
  add column if not exists note text not null default '';
