-- Editable / extensible waves on security_cycles (post neon/security.sql).
-- Apply via psql; then Neon Console → Data API → Refresh schema cache if needed.

alter table public.security_cycles
  add column if not exists waves jsonb not null default '[]'::jsonb;

-- Backfill from legacy Wave 1 / Wave 2 / External Release columns when waves empty.
update public.security_cycles
set waves = (
  select coalesce(jsonb_agg(w.obj order by w.ord), '[]'::jsonb)
  from (
    select 1 as ord,
      jsonb_build_object(
        'id', 'legacy-wave-1',
        'name', 'Wave 1',
        'target_date', coalesce(nullif(trim(wave1_date), ''), '')
      ) as obj
    where coalesce(trim(wave1_date), '') <> ''
       or coalesce(trim(wave2_date), '') <> ''
       or coalesce(trim(external_release_date), '') <> ''
    union all
    select 2,
      jsonb_build_object(
        'id', 'legacy-wave-2',
        'name', 'Wave 2',
        'target_date', coalesce(nullif(trim(wave2_date), ''), '')
      )
    where coalesce(trim(wave1_date), '') <> ''
       or coalesce(trim(wave2_date), '') <> ''
       or coalesce(trim(external_release_date), '') <> ''
    union all
    select 3,
      jsonb_build_object(
        'id', 'legacy-external',
        'name', 'External Release',
        'target_date', coalesce(nullif(trim(external_release_date), ''), '')
      )
    where coalesce(trim(wave1_date), '') <> ''
       or coalesce(trim(wave2_date), '') <> ''
       or coalesce(trim(external_release_date), '') <> ''
  ) w
)
where waves = '[]'::jsonb
  and (
    coalesce(trim(wave1_date), '') <> ''
    or coalesce(trim(wave2_date), '') <> ''
    or coalesce(trim(external_release_date), '') <> ''
  );

notify pgrst, 'reload schema';
