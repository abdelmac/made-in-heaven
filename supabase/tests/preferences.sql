\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is distinct from true then raise exception 'FAILED: %',message; end if; raise notice 'PASS: %',message; end $$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','owner@example.test',now()),('22222222-2222-4222-8222-222222222222','viewer@example.test',now());
do $$ declare owner_id uuid:='11111111-1111-4111-8111-111111111111'; viewer_id uuid:='22222222-2222-4222-8222-222222222222'; org uuid; preferences jsonb:='{"appearance":"dark","fontSize":"large","motion":"reduced","focusMinutes":45,"shortBreakMinutes":10,"longBreakMinutes":20,"customTheme":null,"savedLayouts":[]}'; result jsonb; operation uuid:=gen_random_uuid(); session uuid:=gen_random_uuid();
begin
  org:=(public.folia_manage_workspace(owner_id,'create',null,'{"name":"Private preferences test"}')->>'workspaceId')::uuid;
  insert into public.workspace_memberships(workspace_id,user_id,role) values(org,viewer_id,'viewer');
  insert into public.preferences(user_id,workspace_id,data,timer_state) values(viewer_id,org,preferences,'{"status":"running","phase":"focus","durationMs":1500000,"remainingMs":1500000}');
  insert into public.active_timers(user_id,workspace_id,session_id,payload) values(viewer_id,org,session,'{"status":"running","durationMs":1500000}');
  result:=public.folia_save_preferences(viewer_id,org,preferences,0,operation);
  perform pg_temp.assert_true(result->>'committedVersion'='1','Viewer can save their own accessibility preferences');
  perform pg_temp.assert_true((select data->>'appearance'='dark' and data->>'fontSize'='large' from public.preferences where workspace_id=org and user_id=viewer_id),'Private appearance and accessibility are stored for the caller');
  perform pg_temp.assert_true((select data is null from public.workspace_documents where workspace_id=org),'Preference endpoint never writes shared productivity content');
  perform pg_temp.assert_true((select payload->>'durationMs'='1500000' from public.active_timers where user_id=viewer_id),'Saving preferences leaves active timer duration unchanged');
  perform pg_temp.assert_true((select timer_state->>'durationMs'='1500000' from public.preferences where user_id=viewer_id and workspace_id=org),'Saving preferences preserves private active timer state');
  result:=public.folia_save_preferences(viewer_id,org,preferences,0,gen_random_uuid());
  perform pg_temp.assert_true((result->>'conflict')::boolean,'Viewer preferences detect concurrent workspace edits');
  update public.preferences set timer_state='{"status":"idle","phase":"shortBreak","durationMs":300000,"remainingMs":300000,"cycleCount":3}' where workspace_id=org and user_id=viewer_id;
  perform public.folia_save_preferences(viewer_id,org,preferences,1,gen_random_uuid());
  perform pg_temp.assert_true((select timer_state->>'durationMs'='600000' and timer_state->>'cycleCount'='3' from public.preferences where user_id=viewer_id and workspace_id=org),'Prepared duration updates without losing phase or cycle progress');
  result:=public.folia_save_preferences(viewer_id,org,preferences,0,operation);
  perform pg_temp.assert_true(result->>'committedVersion'='1' and result->>'version'='2','Preference retry retains original commit identity after intervening writes');
  begin perform public.folia_save_preferences(viewer_id,org,preferences||'{"appearance":"light"}',2,operation); raise exception 'Operation reused'; exception when unique_violation then raise notice 'PASS: Preference operation cannot be reused for different values'; end;
  begin perform public.folia_save_preferences(viewer_id,org,preferences||'{"customTheme":{"accent":"#ffffff"}}',2,gen_random_uuid()); raise exception 'Unpaid customtheme accepted'; exception when insufficient_privilege then raise notice 'PASS: Viewer preference route enforces custom theme entitlement'; end;
  begin perform public.folia_save_preferences(viewer_id,org,preferences||'{"savedLayouts":[{"id":"fake","name":"Paid layout","widgets":[]}]}',2,gen_random_uuid()); raise exception 'Unpaid layout accepted'; exception when insufficient_privilege then raise notice 'PASS: Viewer preference route enforces saved layout entitlement'; end;
  delete from public.workspace_memberships where user_id=viewer_id and workspace_id=org;
  begin perform public.folia_save_preferences(viewer_id,org,preferences,2,gen_random_uuid()); raise exception 'Revoked member prefs accepted'; exception when insufficient_privilege then raise notice 'PASS: Revoked member cannot mutate private workspace preferences'; end;
end $$;
set local role authenticated;
do $$ begin
  begin perform public.folia_save_preferences(gen_random_uuid(),gen_random_uuid(),'{}',0,gen_random_uuid()); raise exception 'Direct preferences RPC called'; exception when insufficient_privilege then raise notice 'PASS: Private preference transaction is server-only'; end;
end $$;
reset role;
rollback;
