\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if condition is distinct from true then raise exception 'FAILED: %',message; end if; raise notice 'PASS: %',message; end $$;
create function pg_temp.document(wid uuid) returns jsonb language sql as $$ select jsonb_build_object('schemaVersion',1,'workspaceId',wid,'revision',0,'updatedAt',now(),'subjects','[]'::jsonb,'projects','[]'::jsonb,'tasks','[]'::jsonb,'plannedSessions','[]'::jsonb,'focusSessions','[]'::jsonb,'journal','[]'::jsonb,'events','[]'::jsonb,'preferences','{"customTheme":null,"savedLayouts":[]}'::jsonb,'timer','{"status":"idle","phase":"shortBreak","cycleCount":1}'::jsonb) $$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','alice@example.test',now()),
('22222222-2222-4222-8222-222222222222','bob@example.test',now()),
('33333333-3333-4333-8333-333333333333','viewer@example.test',now());
select set_config('test.alice',public.folia_onboard('11111111-1111-4111-8111-111111111111')::text,true);
select set_config('test.bob',public.folia_onboard('22222222-2222-4222-8222-222222222222')::text,true);
select pg_temp.assert_true(public.folia_onboard('11111111-1111-4111-8111-111111111111')=current_setting('test.alice')::uuid,'Onboarding is idempotent');
select set_config('test.org',(public.folia_manage_workspace('11111111-1111-4111-8111-111111111111','create',null,'{"name":"Test organization"}')->>'workspaceId'),true);

do $$ declare wid uuid:=current_setting('test.alice')::uuid; org uuid:=current_setting('test.org')::uuid; alice uuid:='11111111-1111-4111-8111-111111111111'; bob uuid:='22222222-2222-4222-8222-222222222222'; doc jsonb; op uuid:=gen_random_uuid(); result jsonb; token text:=repeat('a',64); inv jsonb;
begin
  doc:=pg_temp.document(wid);
  result:=public.folia_commit_document(alice,wid,doc,0,op);
  perform pg_temp.assert_true((result->>'version')::int=1,'Initial document commits with version');
  result:=public.folia_commit_document(alice,wid,doc,0,op);
  perform pg_temp.assert_true((result->>'replayed')::boolean,'Duplicate operation replays idempotently');
  result:=public.folia_commit_document(alice,wid,doc,0,gen_random_uuid());
  perform pg_temp.assert_true((result->>'conflict')::boolean,'Stale device version produces conflict');
  perform pg_temp.assert_true((select timer_state->>'phase'='shortBreak' from public.preferences where user_id=alice and workspace_id=wid),'Prepared break phase survives cloud persistence');
  begin perform public.folia_commit_document(bob,wid,doc,1,gen_random_uuid()); raise exception 'Tenant mutation succeeded'; exception when insufficient_privilege then raise notice 'PASS: Non-member document write denied'; end;
  begin perform public.folia_commit_document(alice,wid,jsonb_set(doc,'{revision}','99'),1,op); raise exception 'Operation ID reused'; exception when unique_violation then raise notice 'PASS: Operation identity cannot be reused with changed payload'; end;
  begin perform public.folia_manage_workspace(alice,'invite',wid,jsonb_build_object('email','bob@example.test','role','member','tokenHash',token)); raise exception 'Personal invitation succeeded'; exception when insufficient_privilege then raise notice 'PASS: Personal workspace remains private'; end;
  begin perform public.folia_manage_workspace(alice,'invite',org,jsonb_build_object('email','bob@example.test','role','member','tokenHash',token)); raise exception 'Free org invite succeeded'; exception when insufficient_privilege then raise notice 'PASS: Team entitlement enforced for invitations'; end;
  begin perform public.folia_commit_document(alice,org,jsonb_set(pg_temp.document(org),'{subjects}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Shared topic','archived',false))),0,gen_random_uuid()); raise exception 'Free shared content created'; exception when insufficient_privilege then raise notice 'PASS: Creating new shared content requires Team entitlement'; end;
  insert into public.workspace_subscriptions(workspace_id,tier,paid_tier,status,paid_through) values(org,'team','team','active',now()+interval '30 days');
  inv:=public.folia_manage_workspace(alice,'invite',org,jsonb_build_object('email','bob@example.test','role','member','tokenHash',token));
  perform public.folia_manage_workspace(bob,'acceptInvite',null,jsonb_build_object('tokenHash',token));
  perform pg_temp.assert_true((select role='member' from public.workspace_memberships where workspace_id=org and user_id=bob),'Valid invitation grants only invited role');
  begin perform public.folia_manage_workspace(bob,'acceptInvite',null,jsonb_build_object('tokenHash',token)); raise exception 'Invitation accepted twice'; exception when invalid_parameter_value then raise notice 'PASS: Accepted invitation cannot be replayed'; end;
  begin perform public.folia_manage_workspace(alice,'removeMember',org,jsonb_build_object('memberId',alice)); raise exception 'Owner removed'; exception when insufficient_privilege then raise notice 'PASS: Last owner cannot be removed'; end;
  insert into public.workspace_memberships(workspace_id,user_id,role) values(org,'33333333-3333-4333-8333-333333333333','viewer');
  begin perform public.folia_commit_document('33333333-3333-4333-8333-333333333333',org,pg_temp.document(org),0,gen_random_uuid()); raise exception 'Viewer wrote'; exception when insufficient_privilege then raise notice 'PASS: Viewer write denied in transaction'; end;
  perform public.folia_manage_workspace(alice,'transferOwnership',org,jsonb_build_object('memberId',bob,'confirmation','TRANSFER'));
  perform pg_temp.assert_true((select created_by=bob from public.workspaces where id=org),'Ownership transfer moves lifecycle ownership');
  perform pg_temp.assert_true((select role='admin' from public.workspace_memberships where workspace_id=org and user_id=alice),'Former owner is deliberately demoted');
  begin delete from auth.users where id=bob; raise exception 'Owner deletion succeeded'; exception when check_violation then raise notice 'PASS: Account deletion cannot orphan organization'; end;
end $$;

do $$ declare alice uuid:='11111111-1111-4111-8111-111111111111'; wid uuid:=current_setting('test.alice')::uuid; org uuid:=current_setting('test.org')::uuid; doc jsonb; plan jsonb; focus jsonb; timer jsonb;
begin
  doc:=pg_temp.document(wid);
  plan:=jsonb_build_object('id',gen_random_uuid(),'workspaceId',wid,'userId',alice,'startsAt','2026-09-14T09:00:00Z','durationMinutes',30);
  doc:=jsonb_set(doc,'{plannedSessions}',jsonb_build_array(plan));
  perform public.folia_commit_document(alice,wid,doc,1,gen_random_uuid());
  begin
    perform public.folia_commit_document(alice,org,jsonb_set(pg_temp.document(org),'{plannedSessions}',jsonb_build_array(plan||jsonb_build_object('workspaceId',org,'startsAt','2026-09-14T09:15:00Z'))),0,gen_random_uuid());
    raise exception 'Cross-workspace overlap accepted';
  exception when exclusion_violation then raise notice 'PASS: Overlap across workspace boundaries rejected'; end;
  perform public.folia_commit_document('22222222-2222-4222-8222-222222222222',org,jsonb_set(pg_temp.document(org),'{plannedSessions}',jsonb_build_array(plan||jsonb_build_object('workspaceId',org,'userId','22222222-2222-4222-8222-222222222222'))),0,gen_random_uuid());
  perform pg_temp.assert_true((select count(*)=2 from public.planned_sessions),'Different people may plan the same time');
  timer:=jsonb_build_object('status','running','sessionId',gen_random_uuid(),'phase','focus','startedAt','2026-09-14T09:00:00Z','durationMs',1500000,'context',jsonb_build_object('workspaceId',wid,'userId',alice));
  doc:=jsonb_set(doc,'{timer}',timer);
  perform public.folia_commit_document(alice,wid,doc,2,gen_random_uuid());
  begin perform public.folia_commit_document(alice,org,jsonb_set(pg_temp.document(org)||(select data from public.workspace_documents where workspace_id=org),'{timer}',jsonb_set(timer,'{context,workspaceId}',to_jsonb(org))),1,gen_random_uuid()); raise exception 'Second active timer accepted'; exception when unique_violation then raise notice 'PASS: One active timer per account across workspaces'; end;
  begin perform public.folia_commit_document(alice,wid,jsonb_set(doc,'{timer,durationMs}','60000'),3,gen_random_uuid()); raise exception 'Timer duration changed'; exception when check_violation then raise notice 'PASS: Active timer frozen duration enforced'; end;
  focus:=jsonb_build_object('id',timer->>'sessionId','workspaceId',wid,'userId',alice,'phase','focus','status','completed','startedAt','2026-09-14T09:00:00Z','endedAt','2026-09-14T09:25:00Z','durationMinutes',25,'actualSeconds',1500,'context',timer->'context');
  doc:=jsonb_set(jsonb_set(doc,'{timer}','{"status":"idle","phase":"shortBreak","cycleCount":1}'),'{focusSessions}',jsonb_build_array(focus));
  perform public.folia_commit_document(alice,wid,doc,3,gen_random_uuid());
  perform pg_temp.assert_true((select count(*)=1 from public.focus_sessions),'Completion written once with stable identity');
  begin perform public.folia_commit_document(alice,wid,jsonb_set(doc,'{focusSessions}','[]'),4,gen_random_uuid()); raise exception 'Focus history removed'; exception when check_violation then raise notice 'PASS: Completed history cannot be deleted'; end;
  begin perform public.folia_commit_document(alice,wid,jsonb_set(doc,'{focusSessions,0,context,subjectName}','"Changed"'),4,gen_random_uuid()); raise exception 'Snapshot changed'; exception when check_violation then raise notice 'PASS: Historical context cannot be rewritten'; end;
  begin perform public.folia_commit_document(alice,wid,jsonb_set(doc,'{preferences,customTheme}','{"accent":"#000000"}'),4,gen_random_uuid()); raise exception 'Free custom theme accepted'; exception when insufficient_privilege then raise notice 'PASS: Client theme cannot bypass paid entitlements'; end;
  perform pg_temp.assert_true(public.folia_rate_limit(alice,'test',1,60),'First sensitive request allowed');
  perform pg_temp.assert_true(not public.folia_rate_limit(alice,'test',1,60),'Durable rate limit rejects excess request');
end $$;

do $$ declare alice uuid:='11111111-1111-4111-8111-111111111111'; bob uuid:='22222222-2222-4222-8222-222222222222'; newcomer uuid:='44444444-4444-4444-8444-444444444444'; org uuid:=current_setting('test.org')::uuid; wid uuid:=current_setting('test.alice')::uuid; inv jsonb; doc jsonb; session jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at) values(newcomer,'new@example.test',now());
  inv:=public.folia_manage_workspace(bob,'invite',org,jsonb_build_object('email','new@example.test','role','member','tokenHash',repeat('b',64)));
  update public.workspace_invitations set expires_at=now()-interval '1 minute' where id=(inv->'invitation'->>'id')::uuid;
  begin perform public.folia_manage_workspace(newcomer,'acceptInvite',null,jsonb_build_object('tokenHash',repeat('b',64))); raise exception 'Expired invite accepted'; exception when invalid_parameter_value then raise notice 'PASS: Expired invitation is rejected'; end;
  inv:=public.folia_manage_workspace(bob,'invite',org,jsonb_build_object('email','new@example.test','role','member','tokenHash',repeat('c',64)));
  perform public.folia_manage_workspace(bob,'revokeInvite',org,jsonb_build_object('invitationId',inv->'invitation'->>'id'));
  begin perform public.folia_manage_workspace(newcomer,'acceptInvite',null,jsonb_build_object('tokenHash',repeat('c',64))); raise exception 'Revoked invite accepted'; exception when invalid_parameter_value then raise notice 'PASS: Revoked invitation is rejected'; end;
  inv:=public.folia_manage_workspace(bob,'invite',org,jsonb_build_object('email','new@example.test','role','member','tokenHash',repeat('d',64)));
  begin perform public.folia_manage_workspace(alice,'acceptInvite',null,jsonb_build_object('tokenHash',repeat('d',64))); raise exception 'Wrong email invite accepted'; exception when insufficient_privilege then raise notice 'PASS: Invitation is bound to verified invited email'; end;
  doc:=pg_temp.document(wid)||(select data from public.workspace_documents where workspace_id=wid);
  session:=doc->'focusSessions'->0;
  begin perform public.folia_commit_document(alice,wid,jsonb_set(doc,'{focusSessions}',jsonb_build_array(session,session||jsonb_build_object('id',gen_random_uuid()))),4,gen_random_uuid()); raise exception 'Overlapping offline completion accepted'; exception when exclusion_violation then raise notice 'PASS: Conflicting offline completions with distinct IDs rejected'; end;
  perform pg_temp.assert_true(not (select data ? 'preferences' from public.workspace_documents where workspace_id=wid),'Shared document never exposes personal preferences');
  perform pg_temp.assert_true((select data->'timer'->>'status'='idle' and data->'timer'->'context'='null'::jsonb from public.workspace_documents where workspace_id=wid),'Shared document never exposes private timer context');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select pg_temp.assert_true((select count(*)=1 from public.workspaces),'Direct database RLS hides separate personal workspaces');
select pg_temp.assert_true((select count(*)=0 from public.focus_sessions),'Team viewer cannot read personal activity');
do $$ begin
  begin insert into public.workspace_memberships(workspace_id,user_id,role) values(current_setting('test.alice')::uuid,auth.uid(),'owner'); raise exception 'Direct membership escalation succeeded'; exception when insufficient_privilege then raise notice 'PASS: Direct membership escalation denied'; end;
  begin update public.workspace_documents set version=999; raise exception 'Direct document write succeeded'; exception when insufficient_privilege then raise notice 'PASS: Direct table writes denied'; end;
  begin perform public.folia_onboard(auth.uid()); raise exception 'Service RPC exposed'; exception when insufficient_privilege then raise notice 'PASS: Service-only RPC cannot be called by authenticated client'; end;
  begin select tier from public.workspace_subscriptions; raise exception 'Billing table exposed'; exception when insufficient_privilege then raise notice 'PASS: Trusted billing state is not client writable/readable'; end;
  begin perform public.workspace_entitlements(current_setting('test.alice')::uuid); raise exception 'Other entitlement readable'; exception when insufficient_privilege then raise notice 'PASS: Entitlement RPC checks membership'; end;
end $$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.folia_manage_workspace('22222222-2222-4222-8222-222222222222','removeMember',current_setting('test.org')::uuid,'{"memberId":"33333333-3333-4333-8333-333333333333"}');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true((select count(*)=0 from public.workspaces),'Revoked member immediately loses direct database access');
reset role;
rollback;
