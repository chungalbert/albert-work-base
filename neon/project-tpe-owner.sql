-- Historical: introduced `projects.tpe_owner` (see project-owner-split.sql for Owner split).
-- Kept for re-run safety on older DBs that never got tpe_owner.
-- Current mapping:
--   PROJECT LEADER → projects.owner (d9)
--   Owner          → projects.project_owner (db)
--   TPE OWNER      → projects.tpe_owner (da)
-- Prefer neon/project-owner-split.sql for full restore after #85.
-- Safe to re-run.

alter table public.projects
  add column if not exists tpe_owner text not null default '',
  add column if not exists project_owner text not null default '';

-- Promote known custom-column cell values into the dedicated TPE OWNER column.
update public.projects p
set tpe_owner = coalesce(nullif(trim(p.custom->>'713a0362-9c56-4be0-bd1c-4c3e912e334a'), ''), p.tpe_owner)
where coalesce(trim(p.custom->>'713a0362-9c56-4be0-bd1c-4c3e912e334a'), '') <> ''
  and coalesce(trim(p.tpe_owner), '') = '';

-- Delegate meta rewrite to the split migration logic (inline equivalent).
-- Rewrite meta: ensure Owner (db) + TPE OWNER (da) after PROJECT LEADER (d9).
do $$
declare
  meta_id uuid;
  defs jsonb;
  col jsonb;
  next_defs jsonb := '[]'::jsonb;
  seen_owner boolean := false;
  seen_tpe boolean := false;
  label_u text;
  col_id text;
  sort_i integer := 0;
begin
  select id, custom->'__kssw_column_defs'
    into meta_id, defs
  from public.projects
  where name = '__kssw_meta__'
  limit 1;

  if meta_id is null then
    return;
  end if;

  if defs is null or jsonb_typeof(defs) <> 'array' then
    begin
      defs := (select (custom->>'__kssw_column_defs')::jsonb from public.projects where id = meta_id);
    exception when others then
      defs := '[]'::jsonb;
    end;
  end if;

  if jsonb_typeof(defs) = 'string' then
    begin
      defs := (defs #>> '{}')::jsonb;
    exception when others then
      defs := '[]'::jsonb;
    end;
  end if;

  if defs is null or jsonb_typeof(defs) <> 'array' then
    defs := '[]'::jsonb;
  end if;

  for col in select * from jsonb_array_elements(defs)
  loop
    col_id := coalesce(col->>'id', '');
    label_u := upper(trim(coalesce(col->>'label', '')));

    -- da id before bare OWNER (#85 mislabeled da as "Owner")
    if col_id = '00000000-0000-4000-8000-0000000000da'
       or label_u in ('TPE OWNER', 'TPE_OWNER', 'TPEOWNER') then
      if not seen_tpe then
        next_defs := next_defs || jsonb_build_array(
          jsonb_build_object(
            'id', '00000000-0000-4000-8000-0000000000da',
            'label', 'TPE OWNER',
            'sort_order', sort_i
          )
        );
        sort_i := sort_i + 1;
        seen_tpe := true;
      end if;
      continue;
    end if;

    if col_id = '00000000-0000-4000-8000-0000000000db' or label_u = 'OWNER' then
      if not seen_owner then
        next_defs := next_defs || jsonb_build_array(
          jsonb_build_object(
            'id', '00000000-0000-4000-8000-0000000000db',
            'label', 'Owner',
            'sort_order', sort_i
          )
        );
        sort_i := sort_i + 1;
        seen_owner := true;
      end if;
      continue;
    end if;

    next_defs := next_defs || jsonb_build_array(
      jsonb_build_object(
        'id', col_id,
        'label', coalesce(col->>'label', ''),
        'sort_order', sort_i
      )
    );
    sort_i := sort_i + 1;

    if col_id = '00000000-0000-4000-8000-0000000000d9' then
      if not seen_owner then
        next_defs := next_defs || jsonb_build_array(
          jsonb_build_object(
            'id', '00000000-0000-4000-8000-0000000000db',
            'label', 'Owner',
            'sort_order', sort_i
          )
        );
        sort_i := sort_i + 1;
        seen_owner := true;
      end if;
      if not seen_tpe then
        next_defs := next_defs || jsonb_build_array(
          jsonb_build_object(
            'id', '00000000-0000-4000-8000-0000000000da',
            'label', 'TPE OWNER',
            'sort_order', sort_i
          )
        );
        sort_i := sort_i + 1;
        seen_tpe := true;
      end if;
    end if;
  end loop;

  if not seen_owner then
    next_defs := next_defs || jsonb_build_array(
      jsonb_build_object(
        'id', '00000000-0000-4000-8000-0000000000db',
        'label', 'Owner',
        'sort_order', sort_i
      )
    );
    sort_i := sort_i + 1;
  end if;

  if not seen_tpe then
    next_defs := next_defs || jsonb_build_array(
      jsonb_build_object(
        'id', '00000000-0000-4000-8000-0000000000da',
        'label', 'TPE OWNER',
        'sort_order', sort_i
      )
    );
  end if;

  update public.projects
  set custom = jsonb_set(
    coalesce(custom, '{}'::jsonb),
    '{__kssw_column_defs}',
    to_jsonb(next_defs::text),
    true
  )
  where id = meta_id;
end $$;

notify pgrst, 'reload schema';
