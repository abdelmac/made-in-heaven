\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAILED: %',message; end if;
  raise notice 'PASS: %',message;
end $$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,email_confirmed_at) values
('44444444-4444-4444-8444-444444444444','billing-owner@example.test',now()),
('55555555-5555-4555-8555-555555555555','billing-other@example.test',now());
select set_config('test.billing_workspace',public.folia_onboard('44444444-4444-4444-8444-444444444444')::text,true);
select set_config('test.other_workspace',public.folia_onboard('55555555-5555-4555-8555-555555555555')::text,true);

do $$ declare wid uuid:=current_setting('test.billing_workspace')::uuid; ent jsonb; begin
  ent:=public.workspace_entitlements(wid);
  perform pg_temp.assert_true(ent->>'tier'='free','Unsubscribed workspace is Free');
  perform pg_temp.assert_true((ent->'limits'->>'subjects')::int=10,'Limits come from canonical billing policy');
  insert into public.workspace_subscriptions(workspace_id,tier,paid_tier,status,current_period_end)
    values(wid,'pro','pro','active',now()+interval '30 days');
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Active status without verified paid coverage grants nothing');
  update public.workspace_subscriptions set paid_through=now()+interval '30 days' where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Paid invoice coverage grants scoped Pro access');
  update public.workspace_subscriptions set status='past_due' where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Failed payment preserves existing paid period');
  update public.workspace_subscriptions set status='canceled',cancel_at_period_end=true where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Cancellation preserves existing paid period');
  update public.workspace_subscriptions set paid_through=now() where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Paid access expires at the exact paid-through boundary');
  update public.workspace_subscriptions set status='past_due',paid_through=now()-interval '1 day' where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Payment failure has no implicit grace period');
  update public.billing_policy set config=jsonb_set(config,'{paymentGraceDays}','3');
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Explicit configured grace covers a failed renewal');
  update public.workspace_subscriptions set status='canceled' where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Grace does not extend a canceled subscription');
  update public.workspace_subscriptions set status='trialing',paid_through=null,trial_end=now()+interval '7 days' where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Trials are disabled by default');
  update public.billing_policy set config=jsonb_set(config,'{allowTrials}','true');
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Explicit trial policy grants access only until trusted trial end');
  update public.workspace_subscriptions set trial_end=now() where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Trial access expires at the exact trial boundary');
  update public.workspace_subscriptions set tier='team',paid_tier='team',paid_through=now()+interval '30 days',status='active' where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Team subscription cannot escalate a separate personal workspace');
  update public.billing_policy set config=jsonb_set(jsonb_set(config,'{allowTrials}','false'),'{paymentGraceDays}','0');
  insert into public.tasks(workspace_id,id,payload) values(wid,'66666666-6666-4666-8666-666666666666','{"title":"Preserve this work"}');
  update public.workspace_subscriptions set tier='free',paid_tier='free',status='canceled',paid_through=null where workspace_id=wid;
  perform pg_temp.assert_true((select count(*)=1 from public.tasks where workspace_id=wid),'Downgrade preserves productivity data');
end $$;

-- Actual roles/RLS: the browser cannot change policy, subscriptions, receipts,
-- or acquire trusted billing locks, even when it owns the workspace.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ declare wid uuid:=current_setting('test.billing_workspace')::uuid; denied boolean; begin
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Member can read effective entitlements through checked RPC');
  denied:=false; begin update public.workspace_subscriptions set paid_tier='pro',paid_through=now()+interval '1 year' where workspace_id=wid; exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.assert_true(denied,'Direct authenticated paid-state escalation denied');
  denied:=false; begin update public.billing_policy set config='{}'; exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.assert_true(denied,'Direct authenticated billing policy edit denied');
  denied:=false; begin insert into public.billing_events(event_id,event_type,status) values('evt_forged','invoice.paid','processed'); exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.assert_true(denied,'Client cannot forge a processed payment receipt');
  denied:=false; begin perform public.claim_billing_workspace(wid,gen_random_uuid()); exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.assert_true(denied,'Authenticated owner cannot execute service-only billing lock RPC');
  denied:=false; begin perform public.workspace_entitlements(current_setting('test.other_workspace')::uuid); exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.assert_true(denied,'Entitlement RPC rejects cross-workspace reads');
end $$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);

do $$ declare
  wid uuid:=current_setting('test.billing_workspace')::uuid;
  token_a uuid:=gen_random_uuid(); token_b uuid:=gen_random_uuid(); denied boolean;
begin
  insert into public.billing_events(event_id,event_type) values('evt_durable','invoice.paid');
  perform pg_temp.assert_true(public.claim_billing_workspace(wid,token_a),'First processor acquires durable workspace lease');
  perform pg_temp.assert_true(not public.claim_billing_workspace(wid,token_b),'Concurrent processor cannot acquire a held workspace lease');
  denied:=false; begin perform public.commit_billing_state(wid,token_b,'{"tier":"team"}','evt_durable'); exception when raise_exception then denied:=true; end;
  perform pg_temp.assert_true(denied,'A processor with the wrong fence cannot write subscription state');
  perform public.release_billing_workspace(wid,token_b);
  perform pg_temp.assert_true((select token=token_a from public.billing_workspace_locks where workspace_id=wid),'Wrong worker cannot release another processor lease');
  perform public.commit_billing_state(wid,token_a,jsonb_build_object('tier','pro','paid_tier','pro','status','active','paid_through',now()+interval '30 days'),'evt_durable');
  perform pg_temp.assert_true((select status='processed' from public.billing_events where event_id='evt_durable'),'Successful reconciliation durably processes its event');
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Atomic event reconciliation applies paid entitlement');
  insert into public.billing_events(event_id,event_type,status) values('evt_durable','invoice.paid','pending') on conflict(event_id) do nothing;
  perform pg_temp.assert_true((select count(*)=1 and bool_and(status='processed') from public.billing_events where event_id='evt_durable'),'Duplicate receipt cannot reset a processed event');
  denied:=false; begin perform public.commit_billing_state(wid,token_a,'{"status":"paused"}','evt_not_received'); exception when raise_exception then denied:=true; end;
  perform pg_temp.assert_true(denied,'Unreceived event cannot be acknowledged as processed');
  perform pg_temp.assert_true((select status='active' from public.workspace_subscriptions where workspace_id=wid),'Missing durable event rolls back subscription changes atomically');
  update public.billing_workspace_locks set expires_at=clock_timestamp()-interval '1 second' where workspace_id=wid;
  denied:=false; begin perform public.commit_billing_state(wid,token_a,'{"status":"paused"}',null); exception when raise_exception then denied:=true; end;
  perform pg_temp.assert_true(denied,'Expired processor cannot commit state');
  perform pg_temp.assert_true(public.claim_billing_workspace(wid,token_b),'Retry processor can reclaim expired lease');
  denied:=false; begin perform public.commit_billing_state(wid,token_a,'{"status":"paused"}',null); exception when raise_exception then denied:=true; end;
  perform pg_temp.assert_true(denied,'Stale worker cannot overwrite a replacement processor');
  perform public.release_billing_workspace(wid,token_a);
  perform pg_temp.assert_true((select token=token_b from public.billing_workspace_locks where workspace_id=wid),'Stale worker cannot release the replacement processor lease');
  perform public.commit_billing_state(wid,token_b,'{"status":"canceled","deletion_pending":true,"stripe_customer_id":"cus_test_owned"}',null);
  perform pg_temp.assert_true((select deletion_pending from public.workspace_subscriptions where workspace_id=wid),'Deletion fence persists through the trusted billing commit');
  perform public.release_billing_workspace(wid,token_b);
end $$;

do $$ declare wid uuid:=current_setting('test.billing_workspace')::uuid; denied boolean; begin
  update public.workspace_subscriptions set checkout_session_id='cs_pending',deletion_pending=true where workspace_id=wid;
  denied:=false; begin delete from auth.users where id='44444444-4444-4444-8444-444444444444'; exception when check_violation then denied:=true; end;
  perform pg_temp.assert_true(denied,'Account deletion cannot leave an open checkout with a billable customer');
  update public.workspace_subscriptions set checkout_session_id=null,deletion_pending=false where workspace_id=wid;
  denied:=false; begin delete from auth.users where id='44444444-4444-4444-8444-444444444444'; exception when check_violation then denied:=true; end;
  perform pg_temp.assert_true(denied,'Account deletion requires trusted billing verification');
  update public.workspace_subscriptions set deletion_pending=true,status='canceled',stripe_subscription_id='sub_ended' where workspace_id=wid;
  delete from auth.users where id='44444444-4444-4444-8444-444444444444';
  perform pg_temp.assert_true(not exists(select 1 from auth.users where id='44444444-4444-4444-8444-444444444444'),'Verified ended billing allows deliberate account deletion');
end $$;
rollback;
