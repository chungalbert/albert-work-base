alter table public.tasks
  add column if not exists analyzed_by uuid references public.profiles(id) on delete set null,
  add column if not exists analyzed_at timestamptz;
