\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAILED: %',message; end if;
  raise notice 'PASS: %',message;
end $$;
create function pg_temp.deletion_document(wid uuid) returns jsonb language sql as $$
  select jsonb_build_object('schemaVersion',1,'workspaceId',wid,'revision',0,'updatedAt',now(),
    'subjects','[]'::jsonb,'projects','[]'::jsonb,'tasks','[]'::jsonb,
    'plannedSessions','[]'::jsonb,'focusSessions','[]'::jsonb,'journal','[]'::jsonb,
    'events','[]'::jsonb,'noteSheets','[]'::jsonb,'flashcardDecks','[]'::jsonb,'flashcards','[]'::jsonb,
    'preferences','{"customTheme":null,"savedLayouts":[],"accentColor":null,"background":{"kind":"none","preset":"aurora","image":null,"overlay":70,"blur":0},"moodEntries":[]}'::jsonb,
    'timer','{"status":"idle","phase":"focus","cycleCount":0}'::jsonb)
$$;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  carol uuid:='33333333-3333-4333-8333-333333333333';
  personal uuid; org uuid; legacy_org uuid; untouched uuid; owned uuid;
  task_id uuid:=gen_random_uuid(); bob_task uuid:=gen_random_uuid();
  subject_id uuid:=gen_random_uuid(); invitation uuid:=gen_random_uuid();
  a_focus jsonb; b_focus jsonb; a_note jsonb; b_note jsonb;
  a_journal jsonb; b_journal jsonb; a_plan jsonb; a_event jsonb; b_event jsonb;
  a_deck jsonb; b_deck jsonb; a_card jsonb; b_card jsonb;
  doc jsonb; alice_doc jsonb; bob_doc jsonb; saved jsonb; cleaned jsonb; result jsonb; patch jsonb;
  old_version bigint; legacy_version bigint; bob_operation uuid:=gen_random_uuid(); bob_patch uuid:=gen_random_uuid();
  collection text; record jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (alice,'alice-deletion@example.test',now()),(bob,'bob-deletion@example.test',now()),
    (carol,'carol-deletion@example.test',now());
  personal:=public.folia_onboard(alice);
  perform public.folia_onboard(bob); perform public.folia_onboard(carol);
  org:=(public.folia_manage_workspace(bob,'create',null,'{"name":"Retained organization"}')->>'workspaceId')::uuid;
  legacy_org:=(public.folia_manage_workspace(carol,'create',null,'{"name":"Former member legacy"}')->>'workspaceId')::uuid;
  untouched:=(public.folia_manage_workspace(bob,'create',null,'{"name":"Unrelated organization"}')->>'workspaceId')::uuid;
  owned:=(public.folia_manage_workspace(alice,'create',null,'{"name":"Transfer first"}')->>'workspaceId')::uuid;
  insert into public.workspace_memberships(workspace_id,user_id,role) values
    (org,alice,'member'),(org,carol,'member'),(legacy_org,alice,'member'),(owned,bob,'member');
  insert into public.workspace_subscriptions(workspace_id,tier,paid_tier,status,paid_through)
    values(org,'team','team','active',now()+interval '30 days');

  a_focus:=jsonb_build_object('id',gen_random_uuid(),'workspaceId',org,'userId',alice,
    'phase','focus','status','completed','startedAt','2026-10-01T08:00:00Z','endedAt','2026-10-01T08:25:00Z',
    'durationMinutes',25,'actualSeconds',1500,'context',jsonb_build_object('workspaceId',org,'userId',alice,'taskId',task_id));
  b_focus:=jsonb_set(jsonb_set(a_focus,'{id}',to_jsonb(gen_random_uuid())),'{userId}',to_jsonb(bob));
  b_focus:=jsonb_set(b_focus,'{context,userId}',to_jsonb(bob));
  a_note:=jsonb_build_object('id',gen_random_uuid(),'workspaceId',org,'userId',alice,
    'title','Private authored note','content','Erase this note and revisions','kind','session_reflection',
    'sessionId',a_focus->>'id','createdAt',now(),'updatedAt',now(),'revisions',
    jsonb_build_array(jsonb_build_object('title','Old name','content','Old private text','editedAt',now())));
  b_note:=(a_note-'sessionId')||jsonb_build_object('id',gen_random_uuid(),'userId',bob,'kind','note',
    'title','Other member note','content','Keep this exact text','revisions','[]'::jsonb);
  a_journal:=jsonb_build_object('id',gen_random_uuid(),'workspaceId',org,'userId',alice,
    'taskId',task_id,'sessionId',a_focus->>'id','kind','reflection','content','Alice private journal',
    'createdAt',now(),'updatedAt',now(),'revisions','[]'::jsonb);
  b_journal:=a_journal||jsonb_build_object('id',gen_random_uuid(),'userId',bob,'content','Keep Bob journal');
  a_plan:=jsonb_build_object('id',gen_random_uuid(),'workspaceId',org,'userId',alice,'taskId',task_id,
    'title','Alice plan','startsAt','2026-10-02T10:00:00Z','durationMinutes',25,'createdAt',now(),'updatedAt',now());
  a_event:=jsonb_build_object('id',gen_random_uuid(),'workspaceId',org,'userId',alice,
    'type','journal_added','timestamp',now(),'details','Alice private event');
  b_event:=a_event||jsonb_build_object('id',gen_random_uuid(),'userId',bob,'details','Keep Bob event');
  a_deck:=jsonb_build_object('id',gen_random_uuid(),'workspaceId',org,'userId',alice,
    'title','Alice deck','description','Erase deck description','createdAt',now(),'updatedAt',now());
  b_deck:=a_deck||jsonb_build_object('id',gen_random_uuid(),'userId',bob,'title','Bob deck');
  a_card:=jsonb_build_object('id',gen_random_uuid(),'workspaceId',org,'userId',alice,'deckId',a_deck->>'id',
    'front','Alice question','back','Alice answer','createdAt',now(),'updatedAt',now());
  b_card:=a_card||jsonb_build_object('id',gen_random_uuid(),'userId',bob,'deckId',b_deck->>'id','front','Bob question');
  doc:=pg_temp.deletion_document(org)||jsonb_build_object(
    'subjects',jsonb_build_array(jsonb_build_object('id',subject_id,'name','Shared subject','archived',false)),
    'tasks',jsonb_build_array(
      jsonb_build_object('id',task_id,'title','Shared task','assigneeId',alice,'checklist','[]'::jsonb),
      jsonb_build_object('id',bob_task,'title','Bob task','assigneeId',bob,'checklist','[]'::jsonb)),
    'plannedSessions',jsonb_build_array(a_plan),'focusSessions',jsonb_build_array(a_focus),
    'journal',jsonb_build_array(a_journal),'noteSheets',jsonb_build_array(a_note),
    'flashcardDecks',jsonb_build_array(a_deck),'flashcards',jsonb_build_array(a_card),
    'events',jsonb_build_array(a_event),'futureMetadata',jsonb_build_object('keep','unknown fields'));
  alice_doc:=doc;
  perform public.folia_commit_document(alice,org,doc,0,gen_random_uuid());
  bob_doc:=doc||jsonb_build_object('focusSessions',jsonb_build_array(a_focus,b_focus),
    'journal',jsonb_build_array(a_journal,b_journal),'noteSheets',jsonb_build_array(a_note,b_note),
    'flashcardDecks',jsonb_build_array(a_deck,b_deck),'flashcards',jsonb_build_array(a_card,b_card),
    'events',jsonb_build_array(a_event,b_event));
  perform public.folia_commit_document(bob,org,bob_doc,1,bob_operation);
  patch:=jsonb_build_object('metadata',jsonb_build_object('workspaceId',org,'schemaVersion',1,
    'updatedAt',now(),'preferences',doc->'preferences','timer',doc->'timer'),'collections','{}'::jsonb);
  perform public.folia_commit_patch(bob,org,patch,2,bob_patch);
  select data,version into saved,old_version from public.workspace_documents where workspace_id=org;
  begin
    perform public.folia_commit_document(bob,org,jsonb_set(bob_doc,'{journal,0,content}','"Forged"'),old_version,gen_random_uuid());
    raise exception 'Changed another journal author';
  exception when insufficient_privilege then raise notice 'PASS: SQL rejects changes to another author journal'; end;

  -- A projection-only legacy record remains discoverable after membership removal.
  update public.workspace_documents set data=pg_temp.deletion_document(legacy_org)-'noteSheets',version=4 where workspace_id=legacy_org;
  record:=(a_note-'sessionId')||jsonb_build_object('id',gen_random_uuid(),'workspaceId',legacy_org,'kind','note');
  insert into public.note_sheets(workspace_id,id,user_id,kind,created_at,updated_at,payload)
    values(legacy_org,(record->>'id')::uuid,alice,'note',now(),now(),record);
  delete from public.workspace_memberships where workspace_id=legacy_org and user_id=alice;
  legacy_version:=4;
  update public.workspace_documents set data=pg_temp.deletion_document(untouched),version=7 where workspace_id=untouched;
  insert into public.preferences(user_id,workspace_id,data) values(alice,org,'{"moodEntries":[{"note":"private mood"}]}')
    on conflict(user_id,workspace_id) do update set data=excluded.data;
  insert into public.active_timers(user_id,workspace_id,session_id,payload)
    values(alice,org,gen_random_uuid(),'{"status":"paused"}');
  insert into public.api_rate_limits(user_id,scope,window_start,count) values(alice,'test',now(),1),(bob,'test',now(),1);
  insert into private.sync_patch_receipts(workspace_id,operation_id,actor_id,payload_hash,version)
    values(org,gen_random_uuid(),alice,'private-hash',1);
  insert into public.workspace_invitations(id,workspace_id,email,role,token_hash,invited_by,expires_at)
    values(invitation,org,'ALICE-DELETION@example.test','member',repeat('a',64),bob,now()+interval '1 day'),
    (gen_random_uuid(),org,'someone-else@example.test','member',repeat('b',64),alice,now()+interval '1 day');
  insert into public.workspace_audit(workspace_id,actor_id,action,target_id) values
    (org,alice,'authored_action',null),(org,bob,'member_action',alice),
    (org,bob,'invitation_created',invitation),(org,bob,'unrelated',bob_task);

  begin delete from auth.users where id=alice; raise exception 'Organization owner deleted';
  exception when check_violation then raise notice 'PASS: Organization ownership deletion guard remains'; end;
  perform pg_temp.assert_true((select data=saved and version=old_version from public.workspace_documents where workspace_id=org),'Rejected owner deletion changes no shared data');
  perform public.folia_manage_workspace(alice,'transferOwnership',owned,jsonb_build_object('memberId',bob,'confirmation','TRANSFER'));
  insert into public.workspace_subscriptions(workspace_id,stripe_customer_id,stripe_subscription_id,status,paid_through)
    values(personal,'cus_deletion','sub_deletion','active',now()+interval '30 days');
  begin delete from auth.users where id=alice; raise exception 'Active billing deleted';
  exception when check_violation then raise notice 'PASS: Active subscription deletion guard remains'; end;
  update public.workspace_subscriptions set status='canceled' where workspace_id=personal;
  begin delete from auth.users where id=alice; raise exception 'Unverified billing deleted';
  exception when check_violation then raise notice 'PASS: Billing verification fence remains required'; end;
  update public.workspace_subscriptions set deletion_pending=true,checkout_session_id='cs_open' where workspace_id=personal;
  begin delete from auth.users where id=alice; raise exception 'Pending checkout deleted';
  exception when check_violation then raise notice 'PASS: Open checkout deletion guard remains'; end;
  update public.workspace_subscriptions set checkout_session_id=null where workspace_id=personal;

  -- A failure later in the Auth transaction must restore both JSON and projections.
  begin
    delete from auth.users where id=alice;
    raise exception 'Simulated later transaction failure' using errcode='P7777';
  exception when sqlstate 'P7777' then null; end;
  perform pg_temp.assert_true((select data=saved and version=old_version from public.workspace_documents where workspace_id=org),'Auth transaction rollback restores JSON and version');
  perform pg_temp.assert_true(exists(select 1 from auth.users where id=alice) and exists(select 1 from public.note_sheets where user_id=alice),'Auth transaction rollback restores account and shared projections');
  perform pg_temp.assert_true(exists(select 1 from public.workspace_invitations where id=invitation) and exists(select 1 from public.api_rate_limits where user_id=alice),'Auth transaction rollback restores invitations and rate limits');

  delete from auth.users where id=alice;
  set constraints all immediate;
  set constraints all deferred;
  select data into cleaned from public.workspace_documents where workspace_id=org;
  perform pg_temp.assert_true(not exists(select 1 from auth.users where id=alice) and not exists(select 1 from public.profiles where id=alice),'Account and profile are deleted');
  perform pg_temp.assert_true(not exists(select 1 from public.workspaces where id=personal),'Personal workspace cascades away');
  perform pg_temp.assert_true(exists(select 1 from auth.users where id=bob) and exists(select 1 from auth.users where id=carol),'Other accounts remain');
  perform pg_temp.assert_true((select version=old_version+1 and (data->>'revision')::bigint=version from public.workspace_documents where workspace_id=org),'Shared document and JSON revision advance together');
  perform pg_temp.assert_true((select version=legacy_version+1 and not data ? 'noteSheets' from public.workspace_documents where workspace_id=legacy_org),'Projection-only legacy scrub advances CAS without inventing collections');
  perform pg_temp.assert_true((select version=7 from public.workspace_documents where workspace_id=untouched),'Unrelated workspace version remains unchanged');
  perform pg_temp.assert_true(cleaned->'futureMetadata'=saved->'futureMetadata' and cleaned->'subjects'=saved->'subjects','Unowned shared resources and unknown metadata remain');
  foreach collection in array array['plannedSessions','focusSessions','journal','noteSheets','flashcardDecks','flashcards','events'] loop
    perform pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(cleaned->collection) x where x->>'userId'=alice::text),'Shared JSON removes authored '||collection);
  end loop;
  perform pg_temp.assert_true(not exists(select 1 from public.note_sheets where user_id=alice) and not exists(select 1 from public.development_notes where user_id=alice),'Authored notes and journals are deleted in projections');
  perform pg_temp.assert_true(not exists(select 1 from public.flashcards where user_id=alice) and not exists(select 1 from public.flashcard_decks where user_id=alice),'Authored decks and cards are deleted in projections');
  perform pg_temp.assert_true(not exists(select 1 from public.planned_sessions where user_id=alice) and not exists(select 1 from public.focus_sessions where user_id=alice) and not exists(select 1 from public.activity_events where user_id=alice),'Authored plans, focus and activity are deleted in projections');
  perform pg_temp.assert_true(cleaned->'noteSheets'=jsonb_build_array(b_note) and cleaned->'flashcardDecks'=jsonb_build_array(b_deck) and cleaned->'flashcards'=jsonb_build_array(b_card),'Other author learning content stays byte-for-byte equal');
  perform pg_temp.assert_true(cleaned->'focusSessions'=jsonb_build_array(b_focus) and cleaned->'events'=jsonb_build_array(b_event),'Other author session and activity snapshots remain equal');
  perform pg_temp.assert_true(cleaned->'journal'=jsonb_build_array(b_journal-'sessionId') and (select payload=b_journal-'sessionId' from public.development_notes where id=(b_journal->>'id')::uuid),'Other author journal text remains with erased-session reference detached');
  perform pg_temp.assert_true(not (cleaned->'tasks'->0 ? 'assigneeId') and (select assignee_id is null and not payload ? 'assigneeId' from public.tasks where id=task_id),'Deleted account is unassigned in JSON and task projection');
  perform pg_temp.assert_true(cleaned->'tasks'->1=saved->'tasks'->1,'Other member task assignment stays unchanged');
  perform pg_temp.assert_true(not exists(select 1 from public.preferences where user_id=alice) and not exists(select 1 from public.active_timers where user_id=alice) and not exists(select 1 from public.workspace_memberships where user_id=alice),'Private moods/preferences, timers and memberships cascade away');
  perform pg_temp.assert_true(not exists(select 1 from public.api_rate_limits where user_id=alice) and exists(select 1 from public.api_rate_limits where user_id=bob),'Only deleted user rate-limit rows are removed');
  perform pg_temp.assert_true(not exists(select 1 from private.sync_patch_receipts where actor_id=alice) and not exists(select 1 from public.sync_operations where actor_id=alice),'Deleted user sync receipts are removed');
  perform pg_temp.assert_true(not exists(select 1 from public.workspace_invitations where lower(email)='alice-deletion@example.test') and exists(select 1 from public.workspace_invitations where email='someone-else@example.test' and invited_by is null),'Incoming email invitations removed while unrelated invitations lose only deleted inviter link');
  perform pg_temp.assert_true(not exists(select 1 from public.workspace_audit where actor_id=alice or target_id in (alice,invitation)) and exists(select 1 from public.workspace_audit where action='unrelated' and actor_id=bob),'Related audit attribution is erased while unrelated audit remains');

  result:=public.folia_commit_document(bob,org,bob_doc,1,bob_operation);
  perform pg_temp.assert_true((result->>'replayed')::boolean and not result ? 'data','Other author receipt replay returns metadata without pre-delete content');
  perform pg_temp.assert_true((select data=cleaned and version=old_version+1 from public.workspace_documents where workspace_id=org),'Valid old receipt replay cannot resurrect deleted content');
  result:=public.folia_commit_patch(bob,org,patch,2,bob_patch);
  perform pg_temp.assert_true((result->>'replayed')::boolean and not result ? 'data'
    and (select data=cleaned and version=old_version+1 from public.workspace_documents where workspace_id=org),'Old incremental receipt replay returns only current metadata without resurrection');
  result:=public.folia_commit_document(bob,org,bob_doc,old_version,gen_random_uuid());
  perform pg_temp.assert_true((result->>'conflict')::boolean,'Old full-document version conflicts after deletion');
  doc:=pg_temp.deletion_document(org)||cleaned;
  foreach collection in array array['journal','noteSheets','flashcardDecks','flashcards','plannedSessions','focusSessions','events'] loop
    record:=alice_doc->collection->0;
    begin
      perform public.folia_commit_document(bob,org,jsonb_set(doc,array[collection],(doc->collection)||jsonb_build_array(record)),old_version+1,gen_random_uuid());
      raise exception 'Resurrected deleted authored collection %',collection;
    exception when insufficient_privilege then raise notice 'PASS: Fresh merged version cannot resurrect authored %',collection; end;
  end loop;
  begin
    perform public.folia_commit_patch(bob,org,jsonb_set(patch,'{collections}',
      jsonb_build_object('journal',jsonb_build_object('remove','[]'::jsonb,'replace','[]'::jsonb,
        'insert',jsonb_build_array(jsonb_build_object('at',0,'value',a_journal))))),old_version+1,gen_random_uuid());
    raise exception 'Incremental patch restored deleted journal';
  exception when insufficient_privilege then raise notice 'PASS: Fresh incremental patch cannot resurrect erased journal'; end;
  result:=public.folia_commit_document(bob,org,doc,old_version+1,gen_random_uuid());
  perform pg_temp.assert_true(not coalesce((result->>'conflict')::boolean,false),'Remaining member can save clean content after deletion');
  perform pg_temp.assert_true((select count(*)=1 from public.note_sheets where workspace_id=org),'Ordinary sync does not restore deleted note projection');
  record:=private.scrub_account_document(jsonb_build_object('focusSessions','[]'::jsonb,
    'journal',jsonb_build_array(b_journal),'noteSheets',jsonb_build_array(b_note||
      jsonb_build_object('sessionId',a_focus->>'id','kind','session_reflection'))),alice,
    array[(a_focus->>'id')::uuid]);
  perform pg_temp.assert_true(record->'journal'=jsonb_build_array(b_journal-'sessionId')
    and record->'noteSheets'=jsonb_build_array(b_note),'Projection-only erased sessions detach other-author links without dropping their text');
end $$;

select pg_temp.assert_true(not has_function_privilege('anon','public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid)','EXECUTE'),'Document writer remains service-only');
select pg_temp.assert_true(not has_function_privilege('service_role','private.scrub_account_document(jsonb,uuid,uuid[])','EXECUTE')
  and not has_function_privilege('authenticated','private.protect_account_deletion()','EXECUTE'),'Deletion helper and trigger are not exposed to callers');
select pg_temp.assert_true(public.folia_account_deletion_version()=1,'Deletion capability RPC advertises the installed scrub version');
select pg_temp.assert_true(not has_function_privilege('anon','public.folia_account_deletion_version()','EXECUTE')
  and not has_function_privilege('authenticated','public.folia_account_deletion_version()','EXECUTE')
  and has_function_privilege('service_role','public.folia_account_deletion_version()','EXECUTE'),'Deletion capability RPC is service-only');
select pg_temp.assert_true((select provolatile='i' and not prosecdef from pg_proc
  where oid='public.folia_account_deletion_version()'::regprocedure),'Deletion capability RPC is immutable and does not elevate privileges');
select pg_temp.assert_true(private.scrub_account_document(
  '{"journal":[{"userId":"ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF","content":"Erase legacy author"}],"tasks":[{"assigneeId":"ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF","title":"Retain task"}]}'::jsonb,
  'abcdefab-cdef-4abc-8def-abcdefabcdef')='{"journal":[],"tasks":[{"title":"Retain task"}]}'::jsonb,
  'Legacy uppercase UUID spellings cannot retain deleted author content or assignment');
rollback;
