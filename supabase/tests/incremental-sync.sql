\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAILED: %', message; end if;
  raise notice 'PASS: %', message;
end $$;
create function pg_temp.sync_document(wid uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'schemaVersion',1,'workspaceId',wid,'revision',0,'updatedAt',now(),
    'subjects','[]'::jsonb,'projects','[]'::jsonb,'tasks','[]'::jsonb,
    'plannedSessions','[]'::jsonb,'focusSessions','[]'::jsonb,'journal','[]'::jsonb,
    'noteSheets','[]'::jsonb,'flashcardDecks','[]'::jsonb,'flashcards','[]'::jsonb,'events','[]'::jsonb,
    'preferences','{"customTheme":null,"savedLayouts":[]}'::jsonb,
    'timer','{"status":"idle","phase":"focus","cycleCount":0}'::jsonb
  )
$$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','alice@example.test',now()),
('22222222-2222-4222-8222-222222222222','bob@example.test',now());
select set_config('test.alice',public.folia_onboard('11111111-1111-4111-8111-111111111111')::text,true);

do $$
declare
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  wid uuid:=current_setting('test.alice')::uuid;
  a jsonb:=jsonb_build_object('id',gen_random_uuid(),'name','A','archived',false);
  b jsonb:=jsonb_build_object('id',gen_random_uuid(),'name','B','archived',false);
  c jsonb:=jsonb_build_object('id',gen_random_uuid(),'name','C','archived',false);
  d jsonb:=jsonb_build_object('id',gen_random_uuid(),'name','D','archived',false);
  untouched jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Untouched project','archived',false));
  doc jsonb; patch jsonb; later jsonb; bad jsonb; result jsonb; snapshot jsonb;
  operation uuid:=gen_random_uuid();
begin
  doc:=jsonb_set(pg_temp.sync_document(wid),'{subjects}',jsonb_build_array(a,b,c));
  doc:=jsonb_set(doc,'{projects}',untouched);
  perform public.folia_commit_document(alice,wid,doc,0,gen_random_uuid());
  a:=a||'{"name":"A updated"}'::jsonb;
  patch:=jsonb_build_object('metadata',doc-array['subjects','projects','tasks','plannedSessions','focusSessions','journal','noteSheets','flashcardDecks','flashcards','events'],
    'collections',jsonb_build_object('subjects',jsonb_build_object(
      'remove',jsonb_build_array(b->>'id'),'replace',jsonb_build_array(a),
      'insert',jsonb_build_array(jsonb_build_object('at',1,'value',d)),
      'order',jsonb_build_array(c->>'id',d->>'id',a->>'id')
    )));
  patch:=jsonb_set(patch,'{metadata,updatedAt}','"2026-09-16T12:00:00Z"');
  result:=public.folia_commit_patch(alice,wid,patch,1,operation);
  perform pg_temp.assert_true(result->>'version'='2' and result->>'committedVersion'='2','Patch returns its own committed version');
  perform pg_temp.assert_true((select data->'subjects'=jsonb_build_array(c,d,a) from public.workspace_documents where workspace_id=wid),'SQL patch preserves exact remove, replace, insert and order semantics: '||(select (data->'subjects')::text from public.workspace_documents where workspace_id=wid));
  perform pg_temp.assert_true((select count(*)=3 from public.subjects where workspace_id=wid),'Patch updates relational projections atomically');
  perform pg_temp.assert_true((select data->'projects'=untouched from public.workspace_documents where workspace_id=wid),'A collection omitted from the patch remains byte-equivalent');
  perform pg_temp.assert_true((select data->>'updatedAt'='2026-09-16T12:00:00Z' and data->>'workspaceId'=wid::text and data->>'revision'='2' from public.workspace_documents where workspace_id=wid),'Metadata merges with existing collections and commit normalizes the revision');
  perform pg_temp.assert_true((select not (data ? 'preferences') from public.workspace_documents where workspace_id=wid),'Compact writes keep private preferences outside shared documents');
  result:=public.folia_commit_patch(alice,wid,patch,1,operation);
  perform pg_temp.assert_true((result->>'replayed')::boolean and result->>'committedVersion'='2','Exact patch replay is idempotent');

  later:=jsonb_set(patch,'{collections}',jsonb_build_object('subjects',jsonb_build_object('remove','[]'::jsonb,'insert','[]'::jsonb,'replace',jsonb_build_array(c||'{"name":"C updated"}'::jsonb))));
  perform public.folia_commit_patch(alice,wid,later,2,gen_random_uuid());
  result:=public.folia_commit_patch(alice,wid,patch,1,operation);
  perform pg_temp.assert_true(result->>'version'='3' and result->>'committedVersion'='2' and (result->>'replayed')::boolean,'Replay distinguishes current version from the original committed version');
  select data into snapshot from public.workspace_documents where workspace_id=wid;
  result:=public.folia_commit_patch(alice,wid,patch,1,gen_random_uuid());
  perform pg_temp.assert_true((result->>'conflict')::boolean and result->>'version'='3','Stale new operation reports a compare-and-swap conflict');
  begin
    perform public.folia_commit_patch(alice,wid,jsonb_set(patch,'{metadata,revision}','99'),1,operation);
    raise exception 'Changed payload reused an operation identifier';
  exception when unique_violation then raise notice 'PASS: Immutable patch receipt rejects changed payload'; end;
  begin
    perform public.folia_commit_patch(alice,wid,patch,2,operation);
    raise exception 'Changed expected version reused an operation identifier';
  exception when unique_violation then raise notice 'PASS: Receipt also binds the expected version'; end;
  begin
    perform public.folia_commit_patch(bob,wid,patch,3,gen_random_uuid());
    raise exception 'A non-member saved a patch';
  exception when insufficient_privilege then raise notice 'PASS: Non-member patch denied'; end;
  begin
    perform public.folia_commit_patch(alice,wid,jsonb_set(patch,'{metadata,workspaceId}',to_jsonb(gen_random_uuid())),3,gen_random_uuid());
    raise exception 'Foreign workspace metadata accepted';
  exception when invalid_parameter_value then raise notice 'PASS: Foreign workspace metadata denied'; end;

  bad:=jsonb_set(later,'{collections,subjects,replace}',jsonb_build_array(a,a||'{"name":"Divergent duplicate"}'::jsonb));
  begin
    perform public.folia_commit_patch(alice,wid,bad,3,gen_random_uuid());
    raise exception 'Duplicate replacement identity accepted';
  exception when invalid_parameter_value then raise notice 'PASS: Duplicate replacements cannot diverge from JS validation'; end;
  bad:=jsonb_set(later,'{collections,subjects,insert}',jsonb_build_array(jsonb_build_object('at',0,'value',b),jsonb_build_object('at',0,'value',b||jsonb_build_object('id',gen_random_uuid()))));
  begin
    perform public.folia_commit_patch(alice,wid,bad,3,gen_random_uuid());
    raise exception 'Duplicate insertion position accepted';
  exception when invalid_parameter_value then raise notice 'PASS: Ambiguous insertion positions rejected'; end;
  bad:=jsonb_set(later,'{collections,subjects,insert}',jsonb_build_array(jsonb_build_object('at',0,'value',b),jsonb_build_object('at',1,'value',b)));
  begin
    perform public.folia_commit_patch(alice,wid,bad,3,gen_random_uuid());
    raise exception 'Duplicate insertion identity accepted';
  exception when invalid_parameter_value then raise notice 'PASS: Duplicate inserted identities rejected'; end;
  bad:=jsonb_set(later,'{collections,subjects,insert}',jsonb_build_array(jsonb_build_object('at',500001,'value',b)));
  begin
    perform public.folia_commit_patch(alice,wid,bad,3,gen_random_uuid());
    raise exception 'Unbounded insertion position accepted';
  exception when invalid_parameter_value then raise notice 'PASS: Insertion positions bounded before integer conversion'; end;
  perform pg_temp.assert_true((select data=snapshot and version=3 from public.workspace_documents where workspace_id=wid),'Rejected patches leave the entire saved document and version unchanged');
  perform pg_temp.assert_true((select count(*)=2 from private.sync_patch_receipts where workspace_id=wid),'Only committed patches create replay receipts');
end $$;

set local role authenticated;
do $$ begin
  begin
    perform public.folia_commit_patch('11111111-1111-4111-8111-111111111111',current_setting('test.alice')::uuid,'{}',3,gen_random_uuid());
    raise exception 'Authenticated client directly invoked service-only patch RPC';
  exception when insufficient_privilege then raise notice 'PASS: Patch RPC remains service-role-only'; end;
end $$;
reset role;
rollback;
