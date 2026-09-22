\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAILED: %',message; end if;
  raise notice 'PASS: %',message;
end $$;
create function pg_temp.assert_rejected(statement text,expected_state text,message text) returns void language plpgsql as $$
declare actual_state text;
begin
  begin execute statement; exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  perform pg_temp.assert_true(actual_state is not distinct from expected_state,message);
end $$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,email_confirmed_at) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','binding-owner@example.test',now());
select set_config('test.binding_workspace',public.folia_onboard('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')::text,true);

select pg_temp.assert_true((select mode='test' and stripe_account_id is null from public.billing_environment where id=true),'Migration preserves the legacy unbound test environment');
select public.assert_billing_environment('test',null);
select pg_temp.assert_rejected($q$select public.assert_billing_environment('live','acct_example')$q$,'23514','A test database rejects live application configuration');
select pg_temp.assert_rejected($q$select public.assert_billing_environment('test','acct_example')$q$,'23514','An unbound test database does not silently bind an account');
select pg_temp.assert_rejected($q$select public.configure_billing_environment('live',null)$q$,'22023','Live requires a Stripe account ID');
select pg_temp.assert_rejected($q$select public.configure_billing_environment('live','acct_')$q$,'22023','Malformed account IDs are rejected');
select pg_temp.assert_rejected($q$select public.configure_billing_environment('production','acct_example')$q$,'22023','Only explicit test and live modes are accepted');
select pg_temp.assert_rejected($q$select public.configure_billing_environment(null,null)$q$,'22023','A null mode cannot bypass validation');

-- Exercise privileges as actual database roles, not only JWT claims.
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_rejected($q$select public.assert_billing_environment('test',null)$q$,'42501','Anonymous callers cannot assert trusted configuration');
select pg_temp.assert_rejected($q$select public.configure_billing_environment('live','acct_example')$q$,'42501','Anonymous callers cannot configure billing');
select pg_temp.assert_rejected($q$select * from public.billing_environment$q$,'42501','Anonymous callers cannot read the binding table');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_rejected($q$select public.assert_billing_environment('test',null)$q$,'42501','Authenticated callers cannot assert trusted configuration');
select pg_temp.assert_rejected($q$select public.configure_billing_environment('live','acct_example')$q$,'42501','Authenticated callers cannot configure billing');
select pg_temp.assert_rejected($q$update public.billing_environment set mode='live',stripe_account_id='acct_example'$q$,'42501','Authenticated callers cannot directly rebind billing');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.assert_billing_environment('test',null);
select pg_temp.assert_rejected($q$update public.billing_environment set mode='live',stripe_account_id='acct_example'$q$,'42501','Application service credentials must use the checked configuration RPC');
select pg_temp.assert_rejected($q$delete from public.billing_environment$q$,'42501','Application service credentials cannot delete the binding');
insert into public.workspace_subscriptions(workspace_id) values(current_setting('test.binding_workspace')::uuid);
select public.configure_billing_environment('live','acct_example');
select public.assert_billing_environment('live','acct_example');
select pg_temp.assert_true((select billing_mode='live' from public.workspace_subscriptions where workspace_id=current_setting('test.binding_workspace')::uuid),'Empty Free placeholders follow the operator binding before any billing history');
select public.configure_billing_environment('live','acct_other');
select public.assert_billing_environment('live','acct_other');
select pg_temp.assert_rejected($q$select public.assert_billing_environment('live','acct_example')$q$,'23514','A different Stripe account is rejected even in the same mode');
select public.configure_billing_environment('test',null);
reset role;

-- Every durable billing artifact independently prevents rebinding.
do $$ declare
  wid uuid:=current_setting('test.binding_workspace')::uuid;
  assignment text;
begin
  foreach assignment in array array[
    'stripe_customer_id=''cus_binding''',
    'stripe_subscription_id=''sub_binding''',
    'paid_through=now()-interval ''1 day''',
    'trial_end=now()-interval ''1 day''',
    'checkout_session_id=''cs_binding''',
    'checkout_attempt_id=''cccccccc-cccc-4ccc-8ccc-cccccccccccc''',
    'checkout_price_id=''price_binding''',
    'current_period_end=now()',
    'tier=''pro''',
    'paid_tier=''pro''',
    'status=''canceled''',
    'deletion_pending=true'
  ] loop
    execute format('update public.workspace_subscriptions set %s where workspace_id=%L',assignment,wid);
    perform pg_temp.assert_rejected($q$select public.configure_billing_environment('live','acct_example')$q$,'23514','Billing history prevents changing mode: '||assignment);
    perform pg_temp.assert_rejected($q$select public.configure_billing_environment('test','acct_other')$q$,'23514','Billing history prevents changing account: '||assignment);
    perform pg_temp.assert_rejected($q$update public.billing_environment set mode='live',stripe_account_id='acct_example'$q$,'23514','Privileged direct SQL cannot bypass history: '||assignment);
    perform public.configure_billing_environment('test',null);
    delete from public.workspace_subscriptions where workspace_id=wid;
    insert into public.workspace_subscriptions(workspace_id) values(wid);
  end loop;
end $$;
insert into public.billing_events(event_id,event_type) values('evt_binding_history','invoice.paid');
select pg_temp.assert_rejected($q$select public.configure_billing_environment('live','acct_example')$q$,'23514','A received event alone prevents switching modes');
select pg_temp.assert_rejected($q$select public.configure_billing_environment('test','acct_other')$q$,'23514','A received event alone prevents switching accounts');
select pg_temp.assert_rejected($q$update public.billing_environment set stripe_account_id='acct_other'$q$,'23514','Direct privileged account rebinding also checks receipt history');
select public.configure_billing_environment('test',null);
select pg_temp.assert_rejected($q$delete from public.billing_environment$q$,'23514','The binding cannot be removed by direct SQL');
select pg_temp.assert_rejected($q$truncate public.billing_environment$q$,'23514','The binding cannot be truncated');
delete from public.billing_events where event_id='evt_binding_history';
delete from public.workspace_subscriptions where workspace_id=current_setting('test.binding_workspace')::uuid;

-- Fresh live storage requires explicitly tagged receipts and compatible patches.
select public.configure_billing_environment('live','acct_example');
select pg_temp.assert_rejected($q$insert into public.billing_events(event_id,event_type) values('evt_wrong_default','invoice.paid')$q$,'23514','Legacy receipt defaults cannot enter live storage');
select pg_temp.assert_rejected($q$insert into public.workspace_subscriptions(workspace_id) values(current_setting('test.binding_workspace')::uuid)$q$,'23514','Legacy subscription defaults cannot enter live storage');
insert into public.billing_events(event_id,event_type,billing_mode) values('evt_live_binding','invoice.paid','live');
select set_config('test.binding_token',gen_random_uuid()::text,true);
select pg_temp.assert_true(public.claim_billing_workspace(current_setting('test.binding_workspace')::uuid,current_setting('test.binding_token')::uuid),'A live processor can acquire the existing fenced lease');
select pg_temp.assert_rejected($q$select public.commit_billing_state(current_setting('test.binding_workspace')::uuid,current_setting('test.binding_token')::uuid,'{"billing_mode":"test","tier":"pro"}','evt_live_binding')$q$,'23514','A patch cannot grant test state inside a live database');
select pg_temp.assert_rejected($q$select public.commit_billing_state(current_setting('test.binding_workspace')::uuid,current_setting('test.binding_token')::uuid,'{"billing_mode":null}','evt_live_binding')$q$,'23514','A null patch mode cannot bypass isolation');
select pg_temp.assert_true(not exists(select 1 from public.workspace_subscriptions where workspace_id=current_setting('test.binding_workspace')::uuid),'Rejected mode patches leave no subscription behind');
select pg_temp.assert_true((select status='pending' from public.billing_events where event_id='evt_live_binding'),'Rejected mode patches do not acknowledge receipts');
select public.commit_billing_state(current_setting('test.binding_workspace')::uuid,current_setting('test.binding_token')::uuid,
  jsonb_build_object('billing_mode','live','tier','pro','paid_tier','pro','status','active','paid_through',now()+interval '1 month','deletion_pending',true),'evt_live_binding');
select pg_temp.assert_true((select billing_mode='live' and deletion_pending from public.workspace_subscriptions where workspace_id=current_setting('test.binding_workspace')::uuid),'Live commit persists its mode and the account deletion fence');
select pg_temp.assert_true((select status='processed' from public.billing_events where event_id='evt_live_binding'),'Live state and its durable receipt commit together');
select pg_temp.assert_true(public.workspace_entitlements(current_setting('test.binding_workspace')::uuid)->>'tier'='pro','A paid subscription in the active mode grants Pro');
select pg_temp.assert_true((public.workspace_entitlements(current_setting('test.binding_workspace')::uuid)->'features') @> '{"backgrounds":true,"flashcards":true,"music":true}','Paid wrapper capabilities survive the migration');
select pg_temp.assert_rejected($q$update public.workspace_subscriptions set billing_mode='test' where workspace_id=current_setting('test.binding_workspace')::uuid$q$,'23514','Direct subscription writes cannot cross environments');
select pg_temp.assert_rejected($q$update public.billing_events set billing_mode='test' where event_id='evt_live_binding'$q$,'23514','Direct event writes cannot cross environments');
select pg_temp.assert_rejected($q$select public.commit_billing_state(current_setting('test.binding_workspace')::uuid,gen_random_uuid(),'{}','evt_live_binding')$q$,'P0001','Live mode retains rejection of a wrong lease token');
select pg_temp.assert_rejected($q$select public.commit_billing_state(current_setting('test.binding_workspace')::uuid,current_setting('test.binding_token')::uuid,'{"status":"paused"}','evt_absent')$q$,'P0001','An absent receipt still rolls back the full live commit');
select pg_temp.assert_true((select status='active' from public.workspace_subscriptions where workspace_id=current_setting('test.binding_workspace')::uuid),'Missing-receipt rollback preserves prior subscription state');

-- Simulate a corrupt restore using owner-only DDL: reads must still fail closed.
alter table public.workspace_subscriptions disable trigger check_subscription_billing_environment;
update public.workspace_subscriptions set billing_mode='test' where workspace_id=current_setting('test.binding_workspace')::uuid;
alter table public.workspace_subscriptions enable trigger check_subscription_billing_environment;
select pg_temp.assert_true(public.workspace_entitlements(current_setting('test.binding_workspace')::uuid)->>'tier'='free','Test coverage in a live database never grants paid rights');
select pg_temp.assert_true((public.workspace_entitlements(current_setting('test.binding_workspace')::uuid)->'features') @> '{"backgrounds":false,"flashcards":false,"music":false}','Mismatched coverage disables all paid wrapper capabilities');
select pg_temp.assert_rejected($q$select public.commit_billing_state(current_setting('test.binding_workspace')::uuid,current_setting('test.binding_token')::uuid,'{"billing_mode":"live"}',null)$q$,'23514','Commit cannot relabel a restored subscription as live');
select pg_temp.assert_rejected($q$update public.workspace_subscriptions set billing_mode='live' where workspace_id=current_setting('test.binding_workspace')::uuid$q$,'23514','Direct SQL cannot relabel existing paid history as live');
select public.configure_billing_environment('live','acct_example');
select pg_temp.assert_true((select billing_mode='test' from public.workspace_subscriptions where workspace_id=current_setting('test.binding_workspace')::uuid),'An identical configure call is a no-op even with incompatible restored history');
alter table public.workspace_subscriptions disable trigger check_subscription_billing_environment;
update public.workspace_subscriptions set billing_mode='live' where workspace_id=current_setting('test.binding_workspace')::uuid;
alter table public.workspace_subscriptions enable trigger check_subscription_billing_environment;
alter table public.billing_events disable trigger check_event_billing_environment;
update public.billing_events set billing_mode='test',status='pending' where event_id='evt_live_binding';
alter table public.billing_events enable trigger check_event_billing_environment;
select pg_temp.assert_rejected($q$select public.commit_billing_state(current_setting('test.binding_workspace')::uuid,current_setting('test.binding_token')::uuid,'{"status":"paused"}','evt_live_binding')$q$,'P0001','A receipt from the wrong mode cannot be processed by a live commit');
select pg_temp.assert_true((select status='active' from public.workspace_subscriptions where workspace_id=current_setting('test.binding_workspace')::uuid),'Wrong-mode receipt rejection rolls back subscription changes');
select pg_temp.assert_true((select status='pending' from public.billing_events where event_id='evt_live_binding'),'Wrong-mode receipt remains unprocessed');
update public.billing_workspace_locks set expires_at=clock_timestamp()-interval '1 second' where workspace_id=current_setting('test.binding_workspace')::uuid;
select pg_temp.assert_rejected($q$select public.commit_billing_state(current_setting('test.binding_workspace')::uuid,current_setting('test.binding_token')::uuid,'{}',null)$q$,'P0001','Live mode retains rejection of an expired lease');
rollback;
