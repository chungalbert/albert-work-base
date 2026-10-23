-- Distinct Owner field (UI label "Owner") beside PROJECT LEADER.
-- Neon `projects.owner` remains Project Leader; this column is `tpe_owner`
-- (legacy UI label was "TPE OWNER").
-- Safe to re-run.

alter table public.projects
  add column if not exists tpe_owner text not null default '';

-- Promote known custom-column cell values into the dedicated column.
update public.projects p
set tpe_owner = coalesce(nullif(trim(p.custom->>'713a0362-9c56-4be0-bd1c-4c3e912e334a'), ''), p.tpe_owner)
where coalesce(trim(p.custom->>'713a0362-9c56-4be0-bd1c-4c3e912e334a'), '') <> ''
  and coalesce(trim(p.tpe_owner), '') = '';

-- Rewrite meta column defs: TPE OWNER / Owner custom → standard Owner (d10)
-- placed immediately after PROJECT LEADER (d9).
do $$
declare
  meta_id uuid;
  defs jsonb;
  col jsonb;
  next_defs jsonb := '[]'::jsonb;
  seen_owner boolean := false;
  label_u text;
  col_id text;
  sort_i integer := 0;
  owner_std jsonb := jsonb_build_object(
    'id', '00000000-0000-4000-8000-0000000000da',
    'label', 'Owner',
    'sort_order', 0
  );
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
    -- defs may be a JSON string
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

  -- custom->__kssw_column_defs is often a JSON-encoded string value
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

    if col_id = '00000000-0000-4000-8000-0000000000da'
       or label_u in ('OWNER', 'TPE OWNER', 'TPE_OWNER', 'TPEOWNER') then
      if not seen_owner then
        next_defs := next_defs || jsonb_build_array(
          jsonb_build_object(
            'id', '00000000-0000-4000-8000-0000000000da',
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

    -- After PROJECT LEADER, insert Owner if not already present later/earlier
    if col_id = '00000000-0000-4000-8000-0000000000d9' and not seen_owner then
      next_defs := next_defs || jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-0000000000da',
          'label', 'Owner',
          'sort_order', sort_i
        )
      );
      sort_i := sort_i + 1;
      seen_owner := true;
    end if;
  end loop;

  if not seen_owner then
    next_defs := next_defs || jsonb_build_array(
      jsonb_set(owner_std, '{sort_order}', to_jsonb(sort_i))
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
