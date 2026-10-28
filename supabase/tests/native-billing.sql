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
insert into auth.users(id,email,email_confirmed_at) values
  ('a1111111-1111-4111-8111-111111111111','native-a@example.test',now()),
  ('b2222222-2222-4222-8222-222222222222','native-b@example.test',now());
select set_config('test.native_workspace',public.folia_onboard('a1111111-1111-4111-8111-111111111111')::text,true);
select set_config('test.native_other_workspace',public.folia_onboard('b2222222-2222-4222-8222-222222222222')::text,true);
select set_config('test.native_org',(public.folia_manage_workspace('a1111111-1111-4111-8111-111111111111','create',null,'{"name":"Native organization"}')->>'workspaceId'),true);
select set_config('test.native_account',public.prepare_native_billing('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,'sandbox')::text,true);
select set_config('test.native_other_account',public.prepare_native_billing('b2222222-2222-4222-8222-222222222222',current_setting('test.native_other_workspace')::uuid,'sandbox')::text,true);
select set_config('test.native_lock',gen_random_uuid()::text,true);
select pg_temp.assert_true(public.claim_billing_workspace(current_setting('test.native_workspace')::uuid,current_setting('test.native_lock')::uuid),'Native verification obtains existing cross-provider billing fence');

create function pg_temp.native_state(receipt text default repeat('a',64),provider text default 'apple') returns jsonb language sql as $$
  select jsonb_build_object('provider',provider,'environment','sandbox','account_token',current_setting('test.native_account'),
    'purchase_key',receipt,'purchase_reference','opaque-store-reference','product_id','solace.pro.monthly',
    'base_plan_id',null,'transaction_id','verified-transaction','status','active','current_period_end',now()+interval '1 month','acknowledged',true)
$$;
create function pg_temp.commit_native(state jsonb) returns void language sql as $$
  select public.commit_native_billing_state('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,current_setting('test.native_lock')::uuid,state)
$$;

do $$ declare wid uuid:=current_setting('test.native_workspace')::uuid; reservation jsonb; begin
  reservation := public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',wid,current_setting('test.native_lock')::uuid,'apple','sandbox','solace.pro.monthly');
  perform pg_temp.assert_true((reservation->>'intentId')::uuid is not null and (reservation->>'expiresAt')::timestamptz>now(),'Native SDK receives a durable bounded launch reservation');
  perform pg_temp.assert_true(public.has_native_subscription(wid),'Native intent blocks web Checkout before a store payment exists');
  perform pg_temp.assert_rejected($q$select public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,current_setting('test.native_lock')::uuid,'google','sandbox','solace.pro.monthly')$q$,'23514','A second storefront cannot reserve concurrently');
  update public.native_purchase_intents set expires_at=now()-interval '1 minute' where workspace_id=wid;
  perform pg_temp.assert_true(public.has_native_subscription(wid),'Expired unknown store outcome does not silently unlock web Checkout');
  perform pg_temp.assert_rejected($q$select public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,current_setting('test.native_lock')::uuid,'apple','sandbox','solace.pro.monthly')$q$,'23514','Expired unknown outcome cannot automatically start a second charge');
  perform public.release_native_purchase_intent('a1111111-1111-4111-8111-111111111111',wid,current_setting('test.native_lock')::uuid,'sandbox',gen_random_uuid());
  perform pg_temp.assert_true(public.has_native_subscription(wid),'Wrong intent ID cannot release the durable fence');
  perform public.release_native_purchase_intent('a1111111-1111-4111-8111-111111111111',wid,current_setting('test.native_lock')::uuid,'sandbox',(reservation->>'intentId')::uuid);
  perform pg_temp.assert_true(not public.has_native_subscription(wid),'Explicit owner SDK cancellation releases the matching intent');
  perform public.release_native_purchase_intent('a1111111-1111-4111-8111-111111111111',wid,current_setting('test.native_lock')::uuid,'sandbox',(reservation->>'intentId')::uuid);
  perform pg_temp.assert_true(not public.has_native_subscription(wid),'Repeated cancellation is idempotent');
  insert into public.workspace_subscriptions(workspace_id,checkout_attempt_id) values(wid,gen_random_uuid());
  perform pg_temp.assert_rejected($q$select public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,current_setting('test.native_lock')::uuid,'apple','sandbox','solace.pro.monthly')$q$,'23514','An existing web checkout attempt prevents store dialog launch');
  update public.workspace_subscriptions set checkout_attempt_id=null,stripe_subscription_id='sub-existing',status='active' where workspace_id=wid;
  perform pg_temp.assert_rejected($q$select public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,current_setting('test.native_lock')::uuid,'apple','sandbox','solace.pro.monthly')$q$,'23514','An active Stripe subscription prevents a new store purchase');
  delete from public.workspace_subscriptions where workspace_id=wid;
  reservation := public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',wid,current_setting('test.native_lock')::uuid,'apple','sandbox','solace.pro.monthly');
  perform pg_temp.commit_native(pg_temp.native_state()||jsonb_build_object('status','expired','current_period_end',now()));
  perform pg_temp.assert_true(exists(select 1 from public.native_purchase_intents where workspace_id=wid),'Restoring an old expired receipt does not erase a pending purchase intent');
  perform public.release_native_purchase_intent('a1111111-1111-4111-8111-111111111111',wid,current_setting('test.native_lock')::uuid,'sandbox',(reservation->>'intentId')::uuid);
  perform public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',wid,current_setting('test.native_lock')::uuid,'apple','sandbox','solace.pro.monthly');
end $$;

do $$ declare wid uuid:=current_setting('test.native_workspace')::uuid; state jsonb; name text; begin
  perform pg_temp.assert_true(public.prepare_native_billing('a1111111-1111-4111-8111-111111111111',wid,'sandbox')::text=current_setting('test.native_account'),'Store account token is stable across preparations');
  perform pg_temp.assert_true(current_setting('test.native_account')<>'a1111111-1111-4111-8111-111111111111','Store account token is not an auth user identifier');
  perform pg_temp.assert_rejected($q$select public.prepare_native_billing('a1111111-1111-4111-8111-111111111111',current_setting('test.native_other_workspace')::uuid,'sandbox')$q$,'42501','Personal ownership is checked inside service RPC');
  perform pg_temp.assert_rejected($q$select public.prepare_native_billing('a1111111-1111-4111-8111-111111111111',current_setting('test.native_org')::uuid,'sandbox')$q$,'42501','Native Pro cannot grant an organization Team');
  perform pg_temp.assert_rejected($q$select public.prepare_native_billing('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,'production')$q$,'23514','Native deployment environment must match operator binding');
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Account token alone grants no Pro');
  perform pg_temp.assert_rejected($q$select pg_temp.commit_native(jsonb_set(pg_temp.native_state(),'{account_token}',to_jsonb(current_setting('test.native_other_account'))))$q$,'23514','Another account token cannot acquire a personal grant');
  perform pg_temp.assert_rejected($q$select public.commit_native_billing_state('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,gen_random_uuid(),pg_temp.native_state())$q$,'40001','Unfenced native writes are rejected');
  update public.billing_workspace_locks set expires_at=now()-interval '1 second' where workspace_id=wid;
  perform pg_temp.assert_rejected($q$select pg_temp.commit_native(pg_temp.native_state())$q$,'40001','Expired billing lease cannot persist a store response');
  update public.billing_workspace_locks set expires_at=now()+interval '3 minutes' where workspace_id=wid;
  perform pg_temp.commit_native(pg_temp.native_state());
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Verified active native grant supplies personal Pro');
  perform pg_temp.assert_true(not exists(select 1 from public.native_purchase_intents where workspace_id=wid),'Durable paid receipt atomically takes over the pending intent fence');
  perform pg_temp.assert_true((public.workspace_entitlements(wid)->'features') @> '{"backgrounds":true,"flashcards":true,"music":true,"teamWorkspaces":false}'::jsonb,'Native Pro uses canonical capabilities and no Team escalation');
  perform pg_temp.assert_true((public.workspace_entitlements(wid)->'limits'->>'subjects') is null,'Native Pro uses canonical paid limits');
  perform pg_temp.assert_true(public.has_native_subscription(wid),'Web checkout guard detects a store subscription');
  perform pg_temp.assert_rejected($q$select public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,current_setting('test.native_lock')::uuid,'apple','sandbox','solace.pro.monthly')$q$,'23514','An existing native subscription prevents another purchase reservation');
  perform pg_temp.commit_native(pg_temp.native_state());
  perform pg_temp.assert_true((select count(*)=1 from public.native_purchase_bindings),'Repeated verified purchase is idempotent');
  perform pg_temp.assert_true((select count(*)=1 from public.native_subscriptions),'Receipt replay creates no duplicate grant');
  perform pg_temp.assert_true(public.workspace_entitlements(current_setting('test.native_other_workspace')::uuid)->>'tier'='free','Native grant cannot leak to another workspace');
  perform pg_temp.assert_true(public.workspace_entitlements(current_setting('test.native_org')::uuid)->>'tier'='free','Native grant cannot escalate owner organization');
  foreach name in array array['canceled','grace'] loop
    perform pg_temp.commit_native(jsonb_set(pg_temp.native_state(),'{status}',to_jsonb(name)));
    perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Verified paid/grace period remains usable: '||name);
  end loop;
  foreach name in array array['expired','revoked','on_hold','paused','pending'] loop
    perform pg_temp.commit_native(jsonb_set(pg_temp.native_state(),'{status}',to_jsonb(name)));
    perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Unpaid/inactive state grants no Pro despite future timestamp: '||name);
  end loop;
  perform pg_temp.assert_true(public.has_native_subscription(wid),'Pending purchase still prevents duplicate web checkout');
  perform pg_temp.commit_native(jsonb_set(pg_temp.native_state(),'{current_period_end}',to_jsonb(now())));
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Native access expires exactly at paid-through boundary');
  perform pg_temp.assert_true(not public.has_native_subscription(wid),'Expired coverage does not block a new web subscription');
  perform pg_temp.commit_native(pg_temp.native_state());
  update public.native_subscriptions set verified_at=now()-interval '24 hours' where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Store verification must be newer than 24 hours');
  perform pg_temp.assert_true(public.has_native_subscription(wid),'Stale verification does not allow duplicate paid sales');
  perform pg_temp.commit_native(pg_temp.native_state());
  perform public.configure_native_billing_environment('production');
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='free','Sandbox receipt cannot supply production Pro');
  perform pg_temp.assert_rejected($q$select pg_temp.commit_native(pg_temp.native_state())$q$,'23514','Sandbox writes are rejected after production binding');
  perform public.configure_native_billing_environment('sandbox');
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Environment isolation preserves original sandbox record');
  perform pg_temp.assert_rejected($q$select public.commit_native_billing_state('b2222222-2222-4222-8222-222222222222',current_setting('test.native_other_workspace')::uuid,current_setting('test.native_lock')::uuid,jsonb_set(pg_temp.native_state(),'{account_token}',to_jsonb(current_setting('test.native_other_account'))))$q$,'40001','Cross-workspace caller needs its own billing fence');
end $$;

-- Ownership races are resolved in the durable unique binding, never by client flags.
select set_config('test.native_other_lock',gen_random_uuid()::text,true);
select pg_temp.assert_true(public.claim_billing_workspace(current_setting('test.native_other_workspace')::uuid,current_setting('test.native_other_lock')::uuid),'Other workspace obtains its own lease');
select pg_temp.assert_rejected($q$select public.commit_native_billing_state('b2222222-2222-4222-8222-222222222222',current_setting('test.native_other_workspace')::uuid,current_setting('test.native_other_lock')::uuid,jsonb_set(pg_temp.native_state(),'{account_token}',to_jsonb(current_setting('test.native_other_account'))))$q$,'23514','Already bound purchase cannot be transferred across accounts');

do $$ declare wid uuid:=current_setting('test.native_workspace')::uuid; begin
  perform pg_temp.commit_native(pg_temp.native_state(repeat('b',64),'google'));
  perform pg_temp.commit_native(pg_temp.native_state(repeat('c',64),'google')||jsonb_build_object('linked_purchase_key',repeat('b',64)));
  perform pg_temp.assert_true((select retired from public.native_purchase_bindings where provider='google' and purchase_key=repeat('b',64)),'Google replacement permanently retires old receipt');
  perform pg_temp.assert_true((select status='revoked' and current_period_end<=now() from public.native_subscriptions where provider='google' and purchase_key=repeat('b',64)),'Replacement removes old entitlement');
  perform pg_temp.assert_rejected($q$select pg_temp.commit_native(pg_temp.native_state(repeat('b',64),'google'))$q$,'23514','Old replacement token cannot replay into new paid grant');
  perform pg_temp.commit_native(pg_temp.native_state(repeat('d',64),'google')||jsonb_build_object('linked_purchase_key',repeat('e',64)));
  perform pg_temp.assert_rejected($q$select pg_temp.commit_native(pg_temp.native_state(repeat('e',64),'google'))$q$,'23514','Unseen previous token is also retired before it can be claimed');
  perform pg_temp.commit_native(pg_temp.native_state(repeat('f',64),'google')||'{"revoked_transaction_id":"verified-transaction"}'::jsonb);
  perform pg_temp.assert_true((select status='revoked' from public.native_subscriptions where provider='google' and purchase_key=repeat('f',64)),'Full refund durably revokes its matching Google order');
  perform pg_temp.commit_native(pg_temp.native_state(repeat('f',64),'google'));
  perform pg_temp.assert_true((select status='revoked' from public.native_subscriptions where provider='google' and purchase_key=repeat('f',64)),'Restoring a refunded order cannot regrant its period');
  perform pg_temp.commit_native(pg_temp.native_state(repeat('f',64),'google')||'{"transaction_id":"new-paid-renewal"}'::jsonb);
  perform pg_temp.assert_true((select status='active' and revoked_transaction_id is null from public.native_subscriptions where provider='google' and purchase_key=repeat('f',64)),'A later paid renewal is independent of a historical refunded order');
  perform pg_temp.commit_native(pg_temp.native_state(repeat('1',64),'apple')||'{"revoked_transaction_id":"verified-transaction"}'::jsonb);
  perform pg_temp.commit_native(pg_temp.native_state(repeat('1',64),'apple'));
  perform pg_temp.assert_true((select status='revoked' from public.native_subscriptions where provider='apple' and purchase_key=repeat('1',64)),'Apple refund evidence remains sticky when current-status API lags');
  perform pg_temp.commit_native(pg_temp.native_state(repeat('1',64),'apple')||'{"clear_revoked_transaction_id":"different-order"}'::jsonb);
  perform pg_temp.assert_true((select status='revoked' from public.native_subscriptions where provider='apple' and purchase_key=repeat('1',64)),'An unrelated refund reversal cannot regrant a revoked period');
  perform pg_temp.commit_native(pg_temp.native_state(repeat('1',64),'apple')||'{"clear_revoked_transaction_id":"verified-transaction"}'::jsonb);
  perform pg_temp.assert_true((select status='active' and revoked_transaction_id is null from public.native_subscriptions where provider='apple' and purchase_key=repeat('1',64)),'Matching verified Apple refund reversal restores the current paid period');
  insert into public.workspace_subscriptions(workspace_id,tier,paid_tier,status,paid_through)
    values(wid,'pro','pro','active',now()+interval '1 month');
  update public.native_subscriptions set status='revoked',current_period_end=now() where workspace_id=wid;
  perform pg_temp.assert_true(public.workspace_entitlements(wid)->>'tier'='pro','Native refund cannot remove independent Stripe paid coverage');
  update public.workspace_subscriptions set paid_through=null,tier='free',paid_tier='free',status='none' where workspace_id=wid;
  perform pg_temp.commit_native(pg_temp.native_state());
  update public.workspace_subscriptions set deletion_pending=true where workspace_id=wid;
  perform pg_temp.assert_rejected($q$select pg_temp.commit_native(pg_temp.native_state())$q$,'23514','Pending deletion prevents store write resurrection');
  update public.workspace_subscriptions set deletion_pending=false where workspace_id=wid;
end $$;

-- Actual SQL roles cannot create paid flags or read raw store tokens.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
select pg_temp.assert_true(public.workspace_entitlements(current_setting('test.native_workspace')::uuid)->>'tier'='pro','Owner reads effective native entitlement through guarded RPC');
select pg_temp.assert_rejected($q$select * from public.native_subscriptions$q$,'42501','Authenticated owner cannot read provider token rows');
select pg_temp.assert_rejected($q$select * from public.native_purchase_intents$q$,'42501','Authenticated owner cannot inspect or mutate raw purchase reservations');
select pg_temp.assert_rejected($q$select public.reserve_native_purchase_intent('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,current_setting('test.native_lock')::uuid,'apple','sandbox','solace.pro.monthly')$q$,'42501','Only trusted backend can reserve a store purchase');
select pg_temp.assert_rejected($q$update public.native_billing_accounts set user_id=null$q$,'42501','Authenticated user cannot alter account binding');
select pg_temp.assert_rejected($q$select public.prepare_native_billing('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,'sandbox')$q$,'42501','Authenticated user cannot mint account mappings via service RPC');
select pg_temp.assert_rejected($q$select pg_temp.commit_native(pg_temp.native_state())$q$,'42501','Authenticated user cannot commit a native entitlement');
select pg_temp.assert_rejected($q$select public.workspace_entitlements(current_setting('test.native_other_workspace')::uuid)$q$,'42501','Membership guard remains intact after native wrapper');
reset role;
set local role service_role;
select pg_temp.assert_true(public.folia_native_billing_version()=1,'Service can check staged native schema capability');
select pg_temp.assert_rejected($q$select public.configure_native_billing_environment('production')$q$,'42501','Application service cannot select its own billing environment');
select pg_temp.assert_rejected($q$update public.native_billing_environment set environment='production'$q$,'42501','Application service cannot bypass operator-only environment RPC');
select pg_temp.assert_rejected($q$insert into public.native_subscriptions select * from public.native_subscriptions$q$,'42501','Application service must use fenced native commit RPC');
reset role;
select set_config('request.jwt.claim.role','service_role',true);

-- Native subscriptions never block immediate account erasure. Store cancellation
-- is independent, and raw references disappear while opaque hash tombstones stay.
delete from public.workspace_memberships where workspace_id=current_setting('test.native_org')::uuid;
delete from auth.users where id='a1111111-1111-4111-8111-111111111111';
select pg_temp.assert_true(not exists(select 1 from public.native_subscriptions where account_token=current_setting('test.native_account')::uuid),'Account deletion removes raw native purchase references immediately');
select pg_temp.assert_true((select user_id is null from public.native_billing_accounts where account_token=current_setting('test.native_account')::uuid),'Deleted account UUID is detached from store mapping');
select pg_temp.assert_true(exists(select 1 from public.native_purchase_bindings where account_token=current_setting('test.native_account')::uuid),'Opaque receipt hash remains for replay prevention');
select pg_temp.assert_true(not exists(select 1 from public.workspaces where id=current_setting('test.native_workspace')::uuid),'Native paid status permits personal workspace cascade deletion');
select pg_temp.assert_rejected($q$select public.prepare_native_billing('a1111111-1111-4111-8111-111111111111',current_setting('test.native_workspace')::uuid,'sandbox')$q$,'42501','Deleted user cannot remint a store mapping');
select pg_temp.assert_rejected($q$update public.native_billing_accounts set user_id='b2222222-2222-4222-8222-222222222222' where account_token=current_setting('test.native_account')::uuid$q$,'23514','Detached store mapping cannot be reassigned to another user');
select pg_temp.assert_rejected($q$select public.commit_native_billing_state('b2222222-2222-4222-8222-222222222222',current_setting('test.native_other_workspace')::uuid,current_setting('test.native_other_lock')::uuid,jsonb_set(pg_temp.native_state(),'{account_token}',to_jsonb(current_setting('test.native_other_account'))))$q$,'23514','Deleted account receipt cannot be restored into another account');
rollback;
