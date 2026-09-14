alter table public.tasks
  add column if not exists analyzed_notes jsonb not null default '[]'::jsonb;

update public.tasks
set analyzed_notes = jsonb_build_array(
  jsonb_build_object(
    'id', coalesce(analyzed_at::text, gen_random_uuid()::text),
    'text', analyzed,
    'by', analyzed_by,
    'at', analyzed_at
  )
)
where coalesce(analyzed, '') <> ''
  and analyzed_notes = '[]'::jsonb;
