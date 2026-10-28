\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAILED: %',message; end if;
  raise notice 'PASS: %',message;
end $$;
create function pg_temp.assert_rejected(statement text,expected_code text,message text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin execute statement; exception when others then
    if sqlstate<>expected_code then raise; end if; rejected:=true;
  end;
  perform pg_temp.assert_true(rejected,message);
end $$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,raw_user_meta_data) values
  ('c1111111-1111-4111-8111-111111111111','adult-legal@example.test','{"age_group":"18+","terms_version":"2026-10-28","privacy_version":"2026-10-28","legal_accepted":true,"accepted_at":"1900-01-01"}'),
  ('c2222222-2222-4222-8222-222222222222','teen-legal@example.test','{"age_group":"16-17","terms_version":"2026-10-28","privacy_version":"2026-10-28","legal_accepted":true}'),
  ('c3333333-3333-4333-8333-333333333333','legacy-legal@example.test','{}'),
  ('c4444444-4444-4444-8444-444444444444','child-local@example.test','{"age_group":"under16","terms_version":"2026-10-28","privacy_version":"2026-10-28","legal_accepted":true}'),
  ('c5555555-5555-4555-8555-555555555555','old-legal@example.test','{"age_group":"18+","terms_version":"2025-01-01","privacy_version":"2026-10-28","legal_accepted":true}');

select pg_temp.assert_true((select count(*)=2 from public.account_legal_acceptances),'Only complete current eligible signup declarations are snapshotted');
select pg_temp.assert_true(public.folia_account_legal_eligible('c1111111-1111-4111-8111-111111111111'),'Adult declaration supplies online legal eligibility');
select pg_temp.assert_true(public.folia_account_legal_eligible('c2222222-2222-4222-8222-222222222222'),'16-17 declaration supplies online legal eligibility');
select pg_temp.assert_true(not public.folia_account_legal_eligible('c3333333-3333-4333-8333-333333333333'),'Legacy users remain unknown until explicit acceptance');
select pg_temp.assert_true(not public.folia_account_legal_eligible('c4444444-4444-4444-8444-444444444444'),'Under-16 declaration supplies no online legal eligibility');
select pg_temp.assert_true(not public.folia_account_legal_eligible('c5555555-5555-4555-8555-555555555555'),'Old signup legal versions supply no eligibility');
select pg_temp.assert_true(not public.folia_account_legal_eligible(null),'Missing user supplies no eligibility');
select pg_temp.assert_true((select source='signup' and accepted_at>=transaction_timestamp() and accepted_at<=clock_timestamp() from public.account_legal_acceptances where user_id='c1111111-1111-4111-8111-111111111111'),'Signup acceptance is stamped by the server and ignores client timestamps');
select set_config('test.original_legal_time',(select accepted_at::text from public.account_legal_acceptances where user_id='c1111111-1111-4111-8111-111111111111'),true);
update auth.users set raw_user_meta_data='{"age_group":"under16","legal_accepted":false}' where id='c1111111-1111-4111-8111-111111111111';
update auth.users set raw_user_meta_data='{"age_group":"18+","terms_version":"2026-10-28","privacy_version":"2026-10-28","legal_accepted":true}' where id='c3333333-3333-4333-8333-333333333333';
select pg_temp.assert_true(public.folia_account_legal_eligible('c1111111-1111-4111-8111-111111111111') and (select age_group='18+' and accepted_at=current_setting('test.original_legal_time')::timestamptz from public.account_legal_acceptances where user_id='c1111111-1111-4111-8111-111111111111'),'Later user_metadata edits cannot rewrite an existing server snapshot');
select pg_temp.assert_true(not public.folia_account_legal_eligible('c3333333-3333-4333-8333-333333333333'),'Later user_metadata edits cannot manufacture legacy acceptance');

do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated','supabase_auth_admin'] loop
    perform pg_temp.assert_true(not has_table_privilege(role_name,'public.account_legal_acceptances','SELECT,INSERT,UPDATE,DELETE'),'Legal records are inaccessible directly to '||role_name);
    perform pg_temp.assert_true(not has_function_privilege(role_name,'public.folia_account_legal_eligible(uuid)','EXECUTE'),'Eligibility RPC is inaccessible to '||role_name);
  end loop;
  perform pg_temp.assert_true(has_table_privilege('service_role','public.account_legal_acceptances','SELECT') and has_table_privilege('service_role','public.account_legal_acceptances','INSERT') and has_table_privilege('service_role','public.account_legal_acceptances','UPDATE'),'Service API can read and record acceptance');
  perform pg_temp.assert_true(not has_table_privilege('service_role','public.account_legal_acceptances','DELETE'),'Service credential has no direct acceptance-delete privilege');
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.account_legal_acceptances'::regclass),'Acceptance table has row-level security enabled');
  foreach role_name in array array['anon','authenticated','service_role'] loop
    perform pg_temp.assert_true(not has_function_privilege(role_name,'public.folia_before_user_created(jsonb)','EXECUTE'),'Auth hook is inaccessible to '||role_name);
  end loop;
  perform pg_temp.assert_true(has_function_privilege('supabase_auth_admin','public.folia_before_user_created(jsonb)','EXECUTE'),'Only Auth provider can invoke the signup hook');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1111111-1111-4111-8111-111111111111',true);
select pg_temp.assert_rejected($q$select * from public.account_legal_acceptances$q$,'42501','Authenticated actor cannot read any private acceptance row');
select pg_temp.assert_rejected($q$update public.account_legal_acceptances set age_group='18+' where user_id='c2222222-2222-4222-8222-222222222222'$q$,'42501','Authenticated actor cannot alter another account acceptance');
select pg_temp.assert_rejected($q$insert into public.account_legal_acceptances(user_id,age_group,terms_version,privacy_version,source) values('c3333333-3333-4333-8333-333333333333','18+','2026-10-28','2026-10-28','account')$q$,'42501','Authenticated actor cannot create a legal record directly');
select pg_temp.assert_rejected($q$select public.folia_account_legal_eligible('c2222222-2222-4222-8222-222222222222')$q$,'42501','User cannot probe another account eligibility through the service RPC');
select pg_temp.assert_rejected($q$select public.folia_before_user_created('{}')$q$,'42501','User cannot invoke the Auth-only signup hook');
reset role;
set local role anon;
select pg_temp.assert_rejected($q$select * from public.account_legal_acceptances$q$,'42501','Anonymous actor cannot read legal records');
select pg_temp.assert_rejected($q$select public.folia_account_legal_eligible('c1111111-1111-4111-8111-111111111111')$q$,'42501','Spoofing service JWT text does not grant SQL RPC permission');
reset role;

set local role service_role;
insert into public.account_legal_acceptances(user_id,age_group,terms_version,privacy_version,accepted_at,source)
values('c3333333-3333-4333-8333-333333333333','18+','2026-10-28','2026-10-28','1900-01-01','account');
select pg_temp.assert_true(public.folia_account_legal_eligible('c3333333-3333-4333-8333-333333333333'),'Explicit service acceptance enables the legacy account');
select pg_temp.assert_true((select accepted_at>=transaction_timestamp() from public.account_legal_acceptances where user_id='c3333333-3333-4333-8333-333333333333'),'Explicit acceptance ignores a caller-provided timestamp');
update public.account_legal_acceptances set terms_version='2025-01-01',accepted_at='1900-01-01' where user_id='c3333333-3333-4333-8333-333333333333';
select pg_temp.assert_true(not public.folia_account_legal_eligible('c3333333-3333-4333-8333-333333333333'),'An older terms version requires reacceptance');
select pg_temp.assert_true((select accepted_at>=transaction_timestamp() from public.account_legal_acceptances where user_id='c3333333-3333-4333-8333-333333333333'),'Reacceptance timestamp is stamped by the server');
update public.account_legal_acceptances set terms_version='2026-10-28',privacy_version='2025-01-01' where user_id='c3333333-3333-4333-8333-333333333333';
select pg_temp.assert_true(not public.folia_account_legal_eligible('c3333333-3333-4333-8333-333333333333'),'An older privacy version requires reacceptance');
select pg_temp.assert_rejected($q$update public.account_legal_acceptances set age_group='under16' where user_id='c3333333-3333-4333-8333-333333333333'$q$,'23514','The table rejects under-16 online acceptance');
select pg_temp.assert_rejected($q$update public.account_legal_acceptances set legal_accepted=false where user_id='c3333333-3333-4333-8333-333333333333'$q$,'23514','The table cannot record an unaccepted legal declaration');
select pg_temp.assert_rejected($q$select public.folia_before_user_created('{}')$q$,'42501','Service credential cannot impersonate the Auth hook caller');
reset role;

set local role supabase_auth_admin;
do $$ declare valid jsonb:='{"age_group":"18+","terms_version":"2026-10-28","privacy_version":"2026-10-28","legal_accepted":true}'; invalid jsonb; result jsonb; begin
  perform pg_temp.assert_true(public.folia_before_user_created(jsonb_build_object('user',jsonb_build_object('user_metadata',valid)))='{}'::jsonb,'Documented hook user.user_metadata allows a current adult declaration');
  perform pg_temp.assert_true(public.folia_before_user_created(jsonb_build_object('user',jsonb_build_object('user_metadata',jsonb_set(valid,'{age_group}','"16-17"'))))='{}'::jsonb,'Hook accepts the eligible 16-17 declaration');
  for invalid in select value from jsonb_array_elements(jsonb_build_array('{}'::jsonb,'null'::jsonb,
    jsonb_set(valid,'{age_group}','"under16"'),jsonb_set(valid,'{age_group}','"unknown"'),
    jsonb_set(valid,'{legal_accepted}','false'),jsonb_set(valid,'{legal_accepted}','"true"'),
    jsonb_set(valid,'{terms_version}','"2025-01-01"'),jsonb_set(valid,'{privacy_version}','"2025-01-01"'))) loop
    result:=public.folia_before_user_created(jsonb_build_object('user',jsonb_build_object('user_metadata',invalid)));
    perform pg_temp.assert_true(result#>>'{error,http_code}'='403' and length(result#>>'{error,message}')>0,'Hook fails closed for missing, underage, false or stale declaration: '||invalid::text);
  end loop;
  perform pg_temp.assert_true(public.folia_before_user_created(jsonb_build_object('user',jsonb_build_object('raw_user_meta_data',valid)))#>>'{error,http_code}'='403','Hook rejects the wrong event metadata field instead of treating it as verified');
end $$;
reset role;
delete from auth.users where id='c1111111-1111-4111-8111-111111111111';
select pg_temp.assert_true(not exists(select 1 from public.account_legal_acceptances where user_id='c1111111-1111-4111-8111-111111111111'),'Hard account deletion cascades the legal record');
select pg_temp.assert_true((select count(*)=2 from public.account_legal_acceptances),'Deleting one account preserves other legal records');
rollback;
