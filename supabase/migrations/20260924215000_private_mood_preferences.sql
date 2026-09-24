-- Extend the existing private preference guard; no new tables or grants.
-- Both document and preference RPCs call this helper after locking the workspace.
create or replace function private.learning_preferences(p_preferences jsonb,p_prior jsonb,p_ent jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare prefs jsonb:=p_preferences; background jsonb; moods jsonb; entry jsonb; entry_day date; local_today date; note_units integer;
begin
  if jsonb_typeof(prefs) is distinct from 'object' then raise exception 'Invalid preferences.' using errcode='22023'; end if;
  -- Preserve a newer accent when an old tab simply sends back its closest legacy
  -- fallback; a different legacy color is still an explicit color change.
  if not (prefs ? 'accentColor') and not (prefs ? 'background') and p_prior->>'accent' in ('blurple','rose','cyan')
    and prefs->>'accent'=(case p_prior->>'accent' when 'rose' then 'plum' else 'blue' end) then
    prefs:=jsonb_set(prefs,'{accent}',p_prior->'accent');
  end if;
  if not (prefs ? 'accentColor') then prefs:=prefs||jsonb_build_object('accentColor',coalesce(p_prior->'accentColor','null'::jsonb)); end if;
  if not (prefs ? 'background') then prefs:=prefs||jsonb_build_object('background',coalesce(p_prior->'background','{"kind":"none","preset":"aurora","image":null,"overlay":70,"blur":0}'::jsonb)); end if;
  if prefs->'accentColor'<>'null'::jsonb and (jsonb_typeof(prefs->'accentColor')<>'string' or prefs->>'accentColor' !~ '^#[0-9a-fA-F]{6}$') then raise exception 'Invalid accent color.' using errcode='22023'; end if;
  background:=prefs->'background';
  if jsonb_typeof(background) is distinct from 'object' or not (background ?& array['kind','preset','image','overlay','blur'])
    or jsonb_typeof(background->'kind') is distinct from 'string' or jsonb_typeof(background->'preset') is distinct from 'string'
    or background->>'kind' not in ('none','preset','image') or background->>'preset' not in ('aurora','dusk','ocean','forest')
    or jsonb_typeof(background->'overlay') is distinct from 'number' or jsonb_typeof(background->'blur') is distinct from 'number'
    or (background->>'overlay')::numeric not between 40 and 95 or (background->>'blur')::numeric not between 0 and 16
    or trunc((background->>'overlay')::numeric)<>(background->>'overlay')::numeric or trunc((background->>'blur')::numeric)<>(background->>'blur')::numeric
    or (background->'image'<>'null'::jsonb and (jsonb_typeof(background->'image')<>'string' or length(background->>'image')>350000 or background->>'image' !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'))
    or (background->>'kind'='image' and background->'image'='null'::jsonb)
  then raise exception 'Invalid background settings.' using errcode='22023'; end if;
  if not coalesce((p_ent->'features'->>'backgrounds')::boolean,false) and background->>'kind'<>'none' and background is distinct from p_prior->'background' then
    raise exception 'Personalized backgrounds require a paid plan for this workspace.' using errcode='42501';
  end if;
  -- These records belong only to the existing (actor, workspace) preference row.
  -- Preserve omissions before replacing JSONB; explicit [] remains an intentional clear.
  if not (prefs ? 'moodEntries') then
    prefs:=prefs||jsonb_build_object('moodEntries',coalesce(p_prior->'moodEntries','[]'::jsonb));
  end if;
  moods:=prefs->'moodEntries';
  if jsonb_typeof(moods) is distinct from 'array' then
    raise exception 'Mood entries must be an array.' using errcode='22023';
  end if;
  if jsonb_array_length(moods)>730 then
    raise exception 'Keep at most 730 mood entries.' using errcode='22023';
  end if;
  local_today:=(current_timestamp at time zone coalesce(prefs->>'timeZone',p_prior->>'timeZone','UTC'))::date;
  for entry in select value from jsonb_array_elements(moods) loop
    if jsonb_typeof(entry) is distinct from 'object' then
      raise exception 'Invalid mood entry.' using errcode='22023';
    end if;
    if not (entry ?& array['date','mood','energy','note','updatedAt'])
      or (select count(*) from jsonb_object_keys(entry))<>5
      or jsonb_typeof(entry->'date') is distinct from 'string'
      or entry->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(entry->'mood') is distinct from 'number'
      or jsonb_typeof(entry->'note') is distinct from 'string'
      or length(entry->>'note')>280
      or jsonb_typeof(entry->'updatedAt') is distinct from 'string'
      or entry->>'updatedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
    then raise exception 'Invalid mood entry.' using errcode='22023'; end if;
    if (entry->>'mood')::numeric not between 1 and 5
      or trunc((entry->>'mood')::numeric)<>(entry->>'mood')::numeric then
      raise exception 'Mood must be an integer from 1 to 5.' using errcode='22023';
    end if;
    if entry->'energy'<>'null'::jsonb then
      if jsonb_typeof(entry->'energy') is distinct from 'number' then
        raise exception 'Energy must be null or an integer from 1 to 5.' using errcode='22023';
      end if;
      if (entry->>'energy')::numeric not between 1 and 5
        or trunc((entry->>'energy')::numeric)<>(entry->>'energy')::numeric then
        raise exception 'Energy must be null or an integer from 1 to 5.' using errcode='22023';
      end if;
    end if;
    -- JavaScript string lengths count supplementary Unicode characters twice.
    select coalesce(sum(case when ascii(character)>65535 then 2 else 1 end),0)
      into note_units from regexp_split_to_table(entry->>'note','') character;
    if note_units>280 then raise exception 'Mood notes are limited to 280 characters.' using errcode='22023'; end if;
    begin
      entry_day:=(entry->>'date')::date;
      perform (entry->>'updatedAt')::timestamptz;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'Mood entries require valid calendar dates and timestamps.' using errcode='22023';
    end;
    if to_char(entry_day,'YYYY-MM-DD')<>entry->>'date' then
      raise exception 'Invalid mood calendar date.' using errcode='22023';
    end if;
    if entry_day>local_today and not exists(
      select 1 from jsonb_array_elements(coalesce(p_prior->'moodEntries','[]'::jsonb)) prior_entry
      where prior_entry=entry
    ) then raise exception 'Mood entries cannot be added or changed for future days.' using errcode='22023'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(moods) item group by item->>'date' having count(*)>1) then
    raise exception 'Only one mood entry is allowed per day.' using errcode='22023';
  end if;
  return prefs;
end $$;
revoke all on function private.learning_preferences(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
