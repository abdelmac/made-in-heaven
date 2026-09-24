\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAILED: %',message; end if;
  raise notice 'PASS: %',message;
end $$;
create function pg_temp.mood_entry(day text,note text default 'Private reflection') returns jsonb language sql as $$
  select jsonb_build_object('date',day,'mood',4,'energy',null,'note',note,'updatedAt','2024-02-29T10:30:00+01:00')
$$;
create function pg_temp.mood_document(wid uuid) returns jsonb language sql as $$
  select jsonb_build_object('schemaVersion',1,'workspaceId',wid,'revision',0,'updatedAt',now(),
    'subjects','[]'::jsonb,'projects','[]'::jsonb,'tasks','[]'::jsonb,
    'plannedSessions','[]'::jsonb,'focusSessions','[]'::jsonb,'journal','[]'::jsonb,
    'events','[]'::jsonb,'noteSheets','[]'::jsonb,'flashcardDecks','[]'::jsonb,'flashcards','[]'::jsonb,
    'preferences','{"timeZone":"UTC","customTheme":null,"savedLayouts":[],"focusMinutes":25,"shortBreakMinutes":5,"longBreakMinutes":15}'::jsonb,
    'timer','{"status":"idle","phase":"focus","cycleCount":0}'::jsonb)
$$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111','mood-owner@example.test',now()),
  ('22222222-2222-4222-8222-222222222222','mood-viewer@example.test',now());
select set_config('test.mood_personal',public.folia_onboard('11111111-1111-4111-8111-111111111111')::text,true);
select set_config('test.mood_org',(public.folia_manage_workspace('11111111-1111-4111-8111-111111111111','create',null,'{"name":"Private mood test"}')->>'workspaceId'),true);

do $$
declare
  actor uuid:='11111111-1111-4111-8111-111111111111';
  viewer uuid:='22222222-2222-4222-8222-222222222222';
  wid uuid:=current_setting('test.mood_personal')::uuid;
  org uuid:=current_setting('test.mood_org')::uuid;
  doc jsonb:=pg_temp.mood_document(wid);
  initial jsonb:=jsonb_build_array(pg_temp.mood_entry('2024-02-29'));
  newer jsonb:=jsonb_build_array(pg_temp.mood_entry('2024-02-29','Updated private reflection')||'{"mood":5}'::jsonb);
  legacy jsonb; patch jsonb; prefs jsonb; result jsonb; initialized jsonb;
  full_operation uuid:=gen_random_uuid(); patch_operation uuid:=gen_random_uuid(); prefs_operation uuid:=gen_random_uuid();
begin
  doc:=jsonb_set(doc,'{preferences,moodEntries}',initial);
  perform public.folia_commit_document(actor,wid,doc,0,gen_random_uuid());
  perform pg_temp.assert_true((select data->'moodEntries'=initial from public.preferences where workspace_id=wid and user_id=actor),'Full sync saves moods in the private preference row');
  legacy:=jsonb_set(doc,'{preferences}',(doc->'preferences')-'moodEntries');
  perform public.folia_commit_document(actor,wid,legacy,1,full_operation);
  perform pg_temp.assert_true((select data->'moodEntries'=initial from public.preferences where workspace_id=wid and user_id=actor),'Older full document writes preserve omitted moods');
  patch:=jsonb_build_object('metadata',legacy-array['subjects','projects','tasks','plannedSessions','focusSessions','journal','events','noteSheets','flashcardDecks','flashcards'],'collections','{}'::jsonb);
  perform public.folia_commit_patch(actor,wid,patch,2,patch_operation);
  perform pg_temp.assert_true((select data->'moodEntries'=initial from public.preferences where workspace_id=wid and user_id=actor),'Older compact patch writes preserve omitted moods');
  perform public.folia_save_preferences(actor,wid,legacy->'preferences',3,prefs_operation);
  perform pg_temp.assert_true((select data->'moodEntries'=initial from public.preferences where workspace_id=wid and user_id=actor),'Older preference writes preserve omitted moods');
  prefs:=(doc->'preferences')||jsonb_build_object('moodEntries',newer);
  perform public.folia_save_preferences(actor,wid,prefs,4,gen_random_uuid());
  result:=public.folia_commit_document(actor,wid,legacy,1,full_operation);
  perform pg_temp.assert_true((result->>'replayed')::boolean and result->>'committedVersion'='2','Legacy full document replay retains its original receipt');
  result:=public.folia_commit_patch(actor,wid,patch,2,patch_operation);
  perform pg_temp.assert_true((result->>'replayed')::boolean and result->>'committedVersion'='3','Legacy patch replay retains its original receipt');
  result:=public.folia_save_preferences(actor,wid,legacy->'preferences',3,prefs_operation);
  perform pg_temp.assert_true((result->>'replayed')::boolean and result->>'committedVersion'='4','Legacy preference replay retains its original receipt');
  perform pg_temp.assert_true((select data->'moodEntries'=newer from public.preferences where workspace_id=wid and user_id=actor) and (select version=5 from public.workspace_documents where workspace_id=wid),'Replays cannot replace a newer private mood entry or increment the version');
  perform pg_temp.assert_true((select not (data ? 'preferences') and not (data ? 'moodEntries') and data->'events'='[]'::jsonb and position('private reflection' in lower(data::text))=0 from public.workspace_documents where workspace_id=wid),'Shared document and events contain neither preferences nor private mood notes');
  perform pg_temp.assert_true(not exists(select 1 from public.activity_events where workspace_id=wid),'Mood preference changes create no shared activity events');

  initialized:=public.folia_initialize_preferences(actor,org,(pg_temp.mood_document(org)->'preferences')||'{"moodEntries":[]}'::jsonb);
  perform pg_temp.assert_true(initialized->'moodEntries'='[]'::jsonb,'New workspace initialization never copies personal mood history');
  insert into public.workspace_memberships(workspace_id,user_id,role) values(org,viewer,'viewer');
  perform public.folia_save_preferences(actor,org,(initialized||jsonb_build_object('moodEntries',initial)),0,gen_random_uuid());
  perform public.folia_save_preferences(viewer,org,(initialized||jsonb_build_object('moodEntries',jsonb_build_array(pg_temp.mood_entry('2024-02-29','Viewer private note')))),1,gen_random_uuid());
  perform pg_temp.assert_true((select data->'moodEntries'=initial from public.preferences where workspace_id=org and user_id=actor),'Viewer mood edit leaves the owner preference row unchanged');
  perform pg_temp.assert_true((select data->'moodEntries'->0->>'note'='Viewer private note' from public.preferences where workspace_id=org and user_id=viewer),'Viewer can save their own private mood without a paid plan');
  perform pg_temp.assert_true((select data is null from public.workspace_documents where workspace_id=org) and not exists(select 1 from public.activity_events where workspace_id=org),'Viewer mood edits create neither shared document content nor events');

  perform public.folia_save_preferences(actor,wid,prefs||'{"moodEntries":[]}'::jsonb,5,gen_random_uuid());
  perform public.folia_save_preferences(actor,wid,legacy->'preferences',6,gen_random_uuid());
  perform pg_temp.assert_true((select data->'moodEntries'='[]'::jsonb from public.preferences where workspace_id=wid and user_id=actor),'Explicit empty array clears moods and later omissions preserve that empty state');
end $$;

do $$
declare
  actor uuid:='11111111-1111-4111-8111-111111111111';
  wid uuid:=current_setting('test.mood_personal')::uuid;
  base jsonb:=pg_temp.mood_document(wid)->'preferences';
  entry jsonb:=pg_temp.mood_entry('2024-02-29');
  invalid jsonb; allowed jsonb; before_prefs jsonb;
  today text:=to_char(current_timestamp at time zone 'Pacific/Kiritimati','YYYY-MM-DD');
  tomorrow text:=to_char((current_timestamp at time zone 'UTC')::date+1,'YYYY-MM-DD');
begin
  select data into before_prefs from public.preferences where user_id=actor and workspace_id=wid;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    'null'::jsonb,'{}'::jsonb,jsonb_build_array(null),jsonb_build_array(entry,entry),
    jsonb_build_array(entry||'{"date":"2023-02-29"}'::jsonb),
    jsonb_build_array(entry||'{"date":"2024-02-30"}'::jsonb),
    jsonb_build_array(entry||'{"date":"0000-01-01"}'::jsonb),
    jsonb_build_array(entry||'{"mood":0}'::jsonb),
    jsonb_build_array(entry||'{"mood":6}'::jsonb),
    jsonb_build_array(entry||'{"mood":1.5}'::jsonb),
    jsonb_build_array(entry||'{"mood":"4"}'::jsonb),
    jsonb_build_array(entry||'{"mood":null}'::jsonb),
    jsonb_build_array(entry||'{"energy":0}'::jsonb),
    jsonb_build_array(entry||'{"energy":6}'::jsonb),
    jsonb_build_array(entry||'{"energy":2.5}'::jsonb),
    jsonb_build_array(entry||'{"energy":"4"}'::jsonb),
    jsonb_build_array(entry-'energy'),jsonb_build_array(entry||'{"private":true}'::jsonb),
    jsonb_build_array(entry||'{"updatedAt":"2024-02-29T12:00:00"}'::jsonb),
    jsonb_build_array(entry||'{"updatedAt":"2024-02-30T12:00:00Z"}'::jsonb),
    jsonb_build_array(entry||'{"updatedAt":"2024-02-29T24:00:00Z"}'::jsonb),
    jsonb_build_array(entry||jsonb_build_object('note',repeat('x',281))),
    jsonb_build_array(entry||jsonb_build_object('note',repeat(chr(128578),141))),
    jsonb_build_array(entry||jsonb_build_object('date',tomorrow)),
    (select jsonb_agg(entry||jsonb_build_object('date',to_char(date '2020-01-01'+n,'YYYY-MM-DD'))) from generate_series(0,730) n)
  )) loop
    begin
      perform public.folia_save_preferences(actor,wid,base||jsonb_build_object('moodEntries',invalid),7,gen_random_uuid());
      raise exception 'Invalid mood payload accepted';
    exception when invalid_parameter_value then raise notice 'PASS: Invalid mood payload rejected'; end;
  end loop;
  perform pg_temp.assert_true((select data=before_prefs from public.preferences where user_id=actor and workspace_id=wid) and (select version=7 from public.workspace_documents where workspace_id=wid),'Rejected mood writes leave preferences and version unchanged');
  allowed:=private.learning_preferences(base||jsonb_build_object('moodEntries',jsonb_build_array(entry||jsonb_build_object('note',repeat(chr(128578),140),'energy',5))),null,'{}');
  perform pg_temp.assert_true(length(allowed->'moodEntries'->0->>'note')=140,'280 UTF-16 note units, leap day and nullable or numeric energy are accepted');
  allowed:=private.learning_preferences(base||jsonb_build_object('moodEntries',jsonb_build_array(entry||'{"note":""}'::jsonb)),null,'{}');
  perform pg_temp.assert_true(allowed->'moodEntries'->0->>'note'='','Empty mood notes are valid');
  allowed:=private.learning_preferences(base||jsonb_build_object('timeZone','Pacific/Kiritimati','moodEntries',jsonb_build_array(entry||jsonb_build_object('date',today))),null,'{}');
  perform pg_temp.assert_true(allowed->'moodEntries'->0->>'date'=today,'Today is evaluated in the submitted preference timezone');
  allowed:=private.learning_preferences(base||jsonb_build_object('moodEntries',jsonb_build_array(entry||jsonb_build_object('date',tomorrow))),base||jsonb_build_object('moodEntries',jsonb_build_array(entry||jsonb_build_object('date',tomorrow))),'{}');
  perform pg_temp.assert_true(allowed->'moodEntries'->0->>'date'=tomorrow,'Identical prior entry survives a timezone boundary making its day appear future');
  begin
    perform private.learning_preferences(base||jsonb_build_object('moodEntries',jsonb_build_array(entry||jsonb_build_object('date',tomorrow,'mood',1))),allowed,'{}');
    raise exception 'Changed future mood accepted';
  exception when invalid_parameter_value then raise notice 'PASS: Existing future day cannot be changed'; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.assert_true((select count(*)=1 and bool_and(user_id=auth.uid()) from public.preferences where workspace_id=current_setting('test.mood_org')::uuid),'Owner reads only their own mood preferences in the shared workspace');
select pg_temp.assert_true(not exists(select 1 from public.preferences where workspace_id=current_setting('test.mood_org')::uuid and data::text like '%Viewer private note%'),'Workspace owner cannot read another member private mood note');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert_true((select count(*)=1 and bool_and(user_id=auth.uid()) from public.preferences where workspace_id=current_setting('test.mood_org')::uuid),'Viewer reads only their own mood preferences in the same workspace');
select pg_temp.assert_true((select data->'moodEntries'->0->>'note'='Viewer private note' from public.preferences where workspace_id=current_setting('test.mood_org')::uuid),'Viewer can read their own saved private mood note');
do $$ begin
  begin perform private.learning_preferences('{}','{}','{}'); raise exception 'Private guard callable';
  exception when insufficient_privilege then raise notice 'PASS: Private mood guard is not client callable'; end;
end $$;
reset role;
select pg_temp.assert_true(not (select prosecdef from pg_proc where oid='private.learning_preferences(jsonb,jsonb,jsonb)'::regprocedure),'Mood helper retains invoker privileges');
select pg_temp.assert_true(not has_function_privilege('service_role','private.learning_preferences(jsonb,jsonb,jsonb)','execute'),'Service role cannot bypass the guarded RPCs');
rollback;
