-- Split Owner vs TPE OWNER after #85.
-- - PROJECT LEADER remains `projects.owner` (d9)
-- - Owner → new `projects.project_owner` (db)
-- - TPE OWNER → `projects.tpe_owner` (da) — restore label (was briefly "Owner")
-- Data in tpe_owner stays on TPE OWNER (pre-#85 values + any cells filled while
-- the column was mislabeled Owner). New Owner column starts empty unless already set.
-- Safe to re-run.

alter table public.projects
  add column if not exists project_owner text not null default '',
  add column if not exists tpe_owner text not null default '';

-- Promote known legacy custom-column cell values into tpe_owner when still empty.
update public.projects p
set tpe_owner = coalesce(nullif(trim(p.custom->>'713a0362-9c56-4be0-bd1c-4c3e912e334a'), ''), p.tpe_owner)
where coalesce(trim(p.custom->>'713a0362-9c56-4be0-bd1c-4c3e912e334a'), '') <> ''
  and coalesce(trim(p.tpe_owner), '') = '';

-- Rewrite meta column defs:
--   d9 PROJECT LEADER → db Owner → da TPE OWNER
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
    if defs is null and (select custom ? '__kssw_column_defs' from public.projects where id = meta_id) then
      begin
        defs := (select (custom->>'__kssw_column_defs')::jsonb from public.projects where id = meta_id);
      exception when others then
        defs := '[]'::jsonb;
      end;
    else
      begin
        defs := (select (custom->>'__kssw_column_defs')::jsonb from public.projects where id = meta_id);
      exception when others then
        defs := '[]'::jsonb;
      end;
    end if;
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

    -- TPE OWNER (da) first: #85 stored label "Owner" on da — id wins over bare OWNER.
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

    -- Owner (project_owner / db): bare OWNER only (not TPE OWNER)
    if col_id = '00000000-0000-4000-8000-0000000000db'
       or label_u = 'OWNER' then
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

    -- After PROJECT LEADER, insert Owner then TPE OWNER if not already present
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

-- Best-effort mirror into project_columns (may be empty / cache-stale on Neon).
-- Keep labels aligned so a table merge cannot re-label da as "Owner".
do $$
begin
  if to_regclass('public.project_columns') is null then
    return;
  end if;

  -- Drop legacy custom TPE OWNER row (values already promoted to projects.tpe_owner).
  delete from public.project_columns
  where id = '713a0362-9c56-4be0-bd1c-4c3e912e334a'::uuid
     or upper(trim(label)) in ('TPE OWNER', 'TPE_OWNER', 'TPEOWNER');

  update public.project_columns
  set label = 'TPE OWNER'
  where id = '00000000-0000-4000-8000-0000000000da'::uuid;

  update public.project_columns
  set label = 'Owner'
  where id = '00000000-0000-4000-8000-0000000000db'::uuid
     or (upper(trim(label)) = 'OWNER'
         and id <> '00000000-0000-4000-8000-0000000000da'::uuid);

  insert into public.project_columns (id, label, sort_order)
  values
    ('00000000-0000-4000-8000-0000000000db'::uuid, 'Owner', 7),
    ('00000000-0000-4000-8000-0000000000da'::uuid, 'TPE OWNER', 8)
  on conflict (id) do update
  set label = excluded.label,
      sort_order = excluded.sort_order;
end $$;

notify pgrst, 'reload schema';
