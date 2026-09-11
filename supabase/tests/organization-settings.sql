\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is distinct from true then raise exception 'FAILED: %',message; end if; raise notice 'PASS: %',message; end $$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','owner@example.test',now()),
('22222222-2222-4222-8222-222222222222','member@example.test',now()),
('33333333-3333-4333-8333-333333333333','admin@example.test',now());
do $$ declare owner_id uuid:='11111111-1111-4111-8111-111111111111'; member_id uuid:='22222222-2222-4222-8222-222222222222'; admin_id uuid:='33333333-3333-4333-8333-333333333333'; org uuid; personal uuid; defaults jsonb:='{"focusMinutes":45,"shortBreakMinutes":10,"longBreakMinutes":20,"cycleLength":3,"visibleStartHour":7,"visibleEndHour":22,"weekStartsOn":0}'; initial jsonb; result jsonb;
begin
  personal:=public.folia_onboard(member_id);
  org:=(public.folia_manage_workspace(owner_id,'create',null,'{"name":"Defaults test"}')->>'workspaceId')::uuid;
  insert into public.workspace_memberships(workspace_id,user_id,role) values(org,member_id,'member'),(org,admin_id,'admin');
  begin perform public.folia_set_organization_settings(owner_id,org,'book',defaults); raise exception 'Unpaid defaults accepted'; exception when insufficient_privilege then raise notice 'PASS: Organization settings enforce Team entitlement'; end;
  insert into public.workspace_subscriptions(workspace_id,tier,paid_tier,status,paid_through) values(org,'team','team','active',now()+interval '30 days');
  perform public.folia_set_organization_settings(owner_id,org,'book',defaults);
  perform pg_temp.assert_true((select icon='book' and settings->'defaultPreferences'=defaults from public.workspaces where id=org),'Owner can save supported icon and organization defaults');
  perform public.folia_set_organization_settings(admin_id,org,'sprout',defaults);
  perform pg_temp.assert_true((select icon='sprout' from public.workspaces where id=org),'Admin can manage organization settings');
  begin perform public.folia_set_organization_settings(member_id,org,'code',defaults); raise exception 'Member settings edit accepted'; exception when insufficient_privilege then raise notice 'PASS: Member cannot edit organization defaults'; end;
  begin perform public.folia_set_organization_settings(owner_id,org,'script',defaults); raise exception 'Unsafe icon accepted'; exception when invalid_parameter_value then raise notice 'PASS: Unsupported icon is rejected'; end;
  begin perform public.folia_set_organization_settings(owner_id,org,'leaf',defaults||'{"appearance":"light"}'); raise exception 'Forced appearance accepted'; exception when invalid_parameter_value then raise notice 'PASS: Organization cannot force personal appearance'; end;
  begin perform public.folia_set_organization_settings(owner_id,org,'leaf',jsonb_set(defaults,'{visibleEndHour}','5')); raise exception 'Invalid hours accepted'; exception when invalid_parameter_value then raise notice 'PASS: Invalid planner defaults are rejected'; end;
  begin perform public.folia_set_organization_settings(member_id,personal,'leaf',defaults); raise exception 'Personal org settings accepted'; exception when invalid_parameter_value then raise notice 'PASS: Organization settings cannot target personal workspace'; end;
  insert into public.preferences(user_id,workspace_id,data) values(member_id,personal,'{"appearance":"dark","fontSize":"large","motion":"reduced","timeZone":"America/New_York","customTheme":{"accent":"#ffffff"}}');
  initial:=public.folia_initialize_preferences(member_id,org,'{"appearance":"system","fontSize":"medium","motion":"standard","focusMinutes":25,"timeZone":"Europe/Paris","customTheme":null}');
  perform pg_temp.assert_true(initial->>'focusMinutes'='45' and initial->>'visibleStartHour'='7','First member preferences inherit organization timer and calendar defaults');
  perform pg_temp.assert_true(initial->>'appearance'='dark' and initial->>'fontSize'='large' and initial->>'motion'='reduced','First member preferences preserve personal accessibility overrides');
  perform pg_temp.assert_true(initial->>'timeZone'='America/New_York','Personal time zone remains intact');
  perform pg_temp.assert_true(initial->'customTheme'='null'::jsonb,'Paid personal custom theme does not leak entitlement across scopes');
  perform public.folia_set_organization_settings(owner_id,org,'code',jsonb_set(defaults,'{focusMinutes}','60'));
  result:=public.folia_initialize_preferences(member_id,org,'{"focusMinutes":25}');
  perform pg_temp.assert_true(result=initial,'Later defaults changes never overwrite initialized member preferences');
  perform pg_temp.assert_true((select count(*)=3 from public.workspace_audit where workspace_id=org and action='organization_settings_updated'),'Settings updates produce an audit trail');
  begin perform public.folia_initialize_preferences('44444444-4444-4444-8444-444444444444',org,'{}'); raise exception 'Outsider initialized prefs'; exception when insufficient_privilege then raise notice 'PASS: Outsider cannot initialize workspace preferences'; end;
end $$;
set local role authenticated;
do $$ begin
  begin perform public.folia_set_organization_settings('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'leaf','{}'); raise exception 'Client invoked settings RPC'; exception when insufficient_privilege then raise notice 'PASS: Organization settings RPC is server-only'; end;
  begin perform public.folia_initialize_preferences('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'{}'); raise exception 'Client invoked preference initializer'; exception when insufficient_privilege then raise notice 'PASS: Preference initialization RPC is server-only'; end;
end $$;
reset role;
rollback;
