-- Native store verification is separate from Stripe and inaccessible to clients.
create table public.native_billing_environment (
  id boolean primary key default true check (id),
  environment text not null check(environment in ('sandbox','production'))
);
insert into public.native_billing_environment values(true,'sandbox');

create table public.native_billing_accounts (
  account_token uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- A non-reassignable hash prevents a restored receipt claiming a deleted account.
-- No email, auth user ID, raw token or transaction payload survives in this row.
create table public.native_purchase_bindings (
  provider text not null check(provider in ('apple','google')),
  environment text not null check(environment in ('sandbox','production')),
  purchase_key text not null check(purchase_key ~ '^[a-f0-9]{64}$'),
  account_token uuid not null references public.native_billing_accounts(account_token),
  retired boolean not null default false,
  primary key(provider,environment,purchase_key)
);
create index native_bindings_account on public.native_purchase_bindings(account_token);
create table public.native_purchase_intents (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check(environment in ('sandbox','production')),
  intent_id uuid not null unique default gen_random_uuid(),
  account_token uuid not null references public.native_billing_accounts(account_token),
  provider text not null check(provider in ('apple','google')),
  product_id text not null check(length(product_id) between 1 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '15 minutes',
  primary key(workspace_id,environment)
);
create index native_intents_account on public.native_purchase_intents(account_token);
create table public.native_subscriptions (
  provider text not null,
  environment text not null,
  purchase_key text not null,
  account_token uuid not null references public.native_billing_accounts(account_token),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchase_reference text not null check(length(purchase_reference) between 1 and 8192),
  product_id text not null check(length(product_id) between 1 and 200),
  base_plan_id text,
  transaction_id text not null,
  revoked_transaction_id text,
  status text not null check(status in ('active','grace','canceled','expired','revoked','pending','on_hold','paused')),
  current_period_end timestamptz not null,
  acknowledged boolean not null,
  verified_at timestamptz not null default now(),
  primary key(provider,environment,purchase_key),
  foreign key(provider,environment,purchase_key) references public.native_purchase_bindings(provider,environment,purchase_key)
);
create index native_subscriptions_workspace on public.native_subscriptions(workspace_id);
create index native_subscriptions_reconcile on public.native_subscriptions(verified_at);
alter table public.native_billing_environment enable row level security;
alter table public.native_billing_accounts enable row level security;
alter table public.native_purchase_bindings enable row level security;
alter table public.native_subscriptions enable row level security;
alter table public.native_purchase_intents enable row level security;
revoke all on public.native_billing_environment,public.native_billing_accounts,public.native_purchase_bindings,public.native_subscriptions,public.native_purchase_intents from public,anon,authenticated,service_role;
grant select on public.native_billing_environment,public.native_billing_accounts,public.native_purchase_bindings,public.native_subscriptions,public.native_purchase_intents to service_role;

create function public.folia_native_billing_version() returns integer
language sql immutable set search_path='' as $$ select 1 $$;
create function public.assert_native_billing_environment(p_environment text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.native_billing_environment where id and environment=p_environment) then
    raise exception 'Native store environment does not match this deployment.' using errcode='23514';
  end if;
end $$;
-- Operator-only: an application service credential cannot select its own mode.
create function public.configure_native_billing_environment(p_environment text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_environment not in ('sandbox','production') or p_environment is null then
    raise exception 'Invalid native store environment.' using errcode='22023';
  end if;
  update public.native_billing_environment set environment=p_environment where id;
end $$;

create function public.prepare_native_billing(p_user_id uuid,p_workspace_id uuid,p_environment text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform public.assert_native_billing_environment(p_environment);
  -- Account deletion cannot race this transaction and leave a fresh association.
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then raise exception 'Account no longer exists.' using errcode='42501'; end if;
  if not exists(select 1 from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
    where w.id=p_workspace_id and w.kind='personal' and w.created_by=p_user_id and m.user_id=p_user_id and m.role='owner') then
    raise exception 'Native subscriptions require your personal workspace.' using errcode='42501';
  end if;
  if exists(select 1 from public.workspace_subscriptions where workspace_id=p_workspace_id and deletion_pending) then
    raise exception 'Account deletion is pending.' using errcode='23514';
  end if;
  insert into public.native_billing_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select account_token into strict result from public.native_billing_accounts where user_id=p_user_id;
  return result;
end $$;

create function public.commit_native_billing_state(p_user_id uuid,p_workspace_id uuid,p_lock_token uuid,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  expected_account uuid;
  actor uuid := (p_state->>'account_token')::uuid;
  provider_name text := p_state->>'provider';
  mode_name text := p_state->>'environment';
  receipt_key text := p_state->>'purchase_key';
  linked_key text := p_state->>'linked_purchase_key';
  stored_account uuid;
  stored_workspace uuid;
  revoked_order text;
  effective_status text := p_state->>'status';
  effective_end timestamptz := (p_state->>'current_period_end')::timestamptz;
begin
  if p_state is null or jsonb_typeof(p_state)<>'object' then raise exception 'Invalid native state.' using errcode='22023'; end if;
  expected_account := public.prepare_native_billing(p_user_id,p_workspace_id,mode_name);
  if actor is distinct from expected_account then raise exception 'Store account ownership mismatch.' using errcode='23514'; end if;
  perform 1 from public.billing_workspace_locks where workspace_id=p_workspace_id and token=p_lock_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Native billing processing lease expired.' using errcode='40001'; end if;
  -- Serialize competing initial claims, even if they target different workspaces.
  perform pg_advisory_xact_lock(hashtextextended(provider_name||':'||mode_name||':'||receipt_key,0));
  select account_token into stored_account from public.native_purchase_bindings
    where provider=provider_name and environment=mode_name and purchase_key=receipt_key;
  if found and stored_account is distinct from actor then
    raise exception 'Purchase already belongs to another account.' using errcode='23514';
  end if;
  select workspace_id,revoked_transaction_id into stored_workspace,revoked_order from public.native_subscriptions
    where provider=provider_name and environment=mode_name and purchase_key=receipt_key;
  if found and stored_workspace is distinct from p_workspace_id then
    raise exception 'Purchase already belongs to another workspace.' using errcode='23514';
  end if;
  -- A delayed full refund applies to its order, not every later renewal using
  -- the same Google token. Replaying that refunded order cannot restore access.
  if provider_name='apple' and p_state->>'clear_revoked_transaction_id'=p_state->>'transaction_id'
    and effective_status in ('active','grace','canceled') and effective_end>now() then
    revoked_order := null;
  end if;
  if coalesce(p_state->>'transaction_id','')<>'' and
    (p_state->>'revoked_transaction_id'=p_state->>'transaction_id' or revoked_order=p_state->>'transaction_id') then
    revoked_order := p_state->>'transaction_id';
    effective_status := 'revoked';
    effective_end := least(effective_end,now());
  else revoked_order := null; end if;
  if linked_key is not null then
    if linked_key=receipt_key then raise exception 'Invalid replacement purchase.' using errcode='22023'; end if;
    select account_token into stored_account from public.native_purchase_bindings
      where provider=provider_name and environment=mode_name and purchase_key=linked_key;
    if found and stored_account is distinct from actor then
      raise exception 'Replacement purchase ownership mismatch.' using errcode='23514';
    end if;
    -- Retain a binding even if the old token arrived before its first verification.
    insert into public.native_purchase_bindings(provider,environment,purchase_key,account_token)
      values(provider_name,mode_name,linked_key,actor) on conflict do nothing;
    select account_token into strict stored_account from public.native_purchase_bindings
      where provider=provider_name and environment=mode_name and purchase_key=linked_key for update;
    if stored_account is distinct from actor then raise exception 'Replacement purchase ownership mismatch.' using errcode='23514'; end if;
    update public.native_purchase_bindings set retired=true
      where provider=provider_name and environment=mode_name and purchase_key=linked_key;
    update public.native_subscriptions set status='revoked',current_period_end=least(current_period_end,now()),verified_at=now()
      where provider=provider_name and environment=mode_name and purchase_key=linked_key and account_token=actor;
  end if;
  -- Retired replacement receipts can never be replayed into an active grant.
  if exists(select 1 from public.native_purchase_bindings where provider=provider_name and environment=mode_name
    and purchase_key=receipt_key and retired) then
    raise exception 'This purchase has been replaced.' using errcode='23514';
  end if;
  insert into public.native_purchase_bindings(provider,environment,purchase_key,account_token)
    values(provider_name,mode_name,receipt_key,actor) on conflict do nothing;
  insert into public.native_subscriptions(provider,environment,purchase_key,account_token,workspace_id,purchase_reference,
    product_id,base_plan_id,transaction_id,revoked_transaction_id,status,current_period_end,acknowledged,verified_at)
  values(provider_name,mode_name,receipt_key,actor,p_workspace_id,p_state->>'purchase_reference',
    p_state->>'product_id',p_state->>'base_plan_id',coalesce(p_state->>'transaction_id',''),revoked_order,effective_status,
    effective_end,(p_state->>'acknowledged')::boolean,clock_timestamp())
  on conflict(provider,environment,purchase_key) do update set
    purchase_reference=excluded.purchase_reference,product_id=excluded.product_id,base_plan_id=excluded.base_plan_id,
    transaction_id=excluded.transaction_id,revoked_transaction_id=excluded.revoked_transaction_id,status=excluded.status,current_period_end=excluded.current_period_end,
    acknowledged=excluded.acknowledged,verified_at=excluded.verified_at;
  -- Only a durable grant/pending purchase that itself blocks web checkout takes
  -- over the intent fence. Restoring an old expired receipt must not unlock it.
  if effective_status='pending' or (effective_status in ('active','grace','canceled') and effective_end>now()) then
    delete from public.native_purchase_intents where workspace_id=p_workspace_id and environment=mode_name
      and account_token=actor and provider=provider_name and product_id=p_state->>'product_id';
  end if;
  return jsonb_build_object('status',effective_status,'currentPeriodEnd',effective_end,'acknowledged',(p_state->>'acknowledged')::boolean);
end $$;

create function public.has_native_subscription(p_workspace_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.native_purchase_intents i join public.native_billing_environment e on e.id and e.environment=i.environment
    where i.workspace_id=p_workspace_id)
  or exists(select 1 from public.native_subscriptions s join public.native_billing_environment e on e.id and e.environment=s.environment
    where s.workspace_id=p_workspace_id and (s.status='pending' or (s.status in ('active','grace','canceled') and s.current_period_end>now())))
$$;

create function public.reserve_native_purchase_intent(p_user_id uuid,p_workspace_id uuid,p_lock_token uuid,p_provider text,p_environment text,p_product_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account uuid; result public.native_purchase_intents;
begin
  account := public.prepare_native_billing(p_user_id,p_workspace_id,p_environment);
  perform 1 from public.billing_workspace_locks where workspace_id=p_workspace_id and token=p_lock_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Native purchase reservation lease expired.' using errcode='40001'; end if;
  if public.has_native_subscription(p_workspace_id) or public.workspace_entitlements(p_workspace_id)->>'tier'<>'free'
    or exists(select 1 from public.workspace_subscriptions s where s.workspace_id=p_workspace_id and
      (s.deletion_pending or s.checkout_session_id is not null or s.checkout_attempt_id is not null or
       (s.stripe_subscription_id is not null and s.status not in ('canceled','incomplete_expired')))) then
    raise exception 'Another purchase or subscription must be resolved first. Restore purchases or contact support.' using errcode='23514';
  end if;
  insert into public.native_purchase_intents(workspace_id,environment,account_token,provider,product_id)
    values(p_workspace_id,p_environment,account,p_provider,p_product_id) returning * into result;
  return jsonb_build_object('intentId',result.intent_id,'expiresAt',result.expires_at);
end $$;

create function public.release_native_purchase_intent(p_user_id uuid,p_workspace_id uuid,p_lock_token uuid,p_environment text,p_intent_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
  account := public.prepare_native_billing(p_user_id,p_workspace_id,p_environment);
  perform 1 from public.billing_workspace_locks where workspace_id=p_workspace_id and token=p_lock_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Native purchase release lease expired.' using errcode='40001'; end if;
  delete from public.native_purchase_intents where workspace_id=p_workspace_id and environment=p_environment
    and account_token=account and intent_id=p_intent_id;
end $$;

-- Strip live raw tokens/references immediately, retaining only replay-prevention hashes.
create function private.detach_native_billing_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.user_id is not null and new.user_id is null then
    delete from public.native_subscriptions where account_token=new.account_token;
    delete from public.native_purchase_intents where account_token=new.account_token;
  elsif old.user_id is distinct from new.user_id then
    raise exception 'Native billing account ownership is immutable.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger native_account_detached before update on public.native_billing_accounts
  for each row execute function private.detach_native_billing_account();

-- Preserve Stripe's membership/environment/paid-period calculation, then add a
-- verified native Pro grant only to the personal workspace that owns the receipt.
create or replace function public.workspace_entitlements(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ent jsonb; paid boolean; policy jsonb;
begin
  ent := private.workspace_entitlements_v1(p_workspace_id);
  if ent->>'tier'='free' and exists(select 1 from public.native_subscriptions s
    join public.native_billing_environment e on e.id and e.environment=s.environment
    join public.native_billing_accounts a on a.account_token=s.account_token
    join public.workspaces w on w.id=s.workspace_id and w.created_by=a.user_id and w.kind='personal'
    where s.workspace_id=p_workspace_id and s.status in ('active','grace','canceled')
      and s.current_period_end>now() and s.verified_at>now()-interval '24 hours') then
    select config into strict policy from public.billing_policy where id;
    ent := jsonb_set(jsonb_set(ent,'{tier}','"pro"'),'{limits}',policy->'plans'->'pro');
    ent := jsonb_set(ent,'{features}',ent->'features'||jsonb_build_object(
      'advancedAnalytics',true,'customThemes',true,'savedLayouts',true,'advancedTemplates',true,'teamWorkspaces',false));
  end if;
  paid := ent->>'tier'<>'free';
  return jsonb_set(ent,'{features}',ent->'features'||jsonb_build_object('backgrounds',paid,'flashcards',paid,'music',paid));
end $$;

revoke all on function public.folia_native_billing_version(),public.assert_native_billing_environment(text),public.prepare_native_billing(uuid,uuid,text),
  public.commit_native_billing_state(uuid,uuid,uuid,jsonb),public.has_native_subscription(uuid),public.configure_native_billing_environment(text)
  from public,anon,authenticated,service_role;
grant execute on function public.folia_native_billing_version(),public.assert_native_billing_environment(text),public.prepare_native_billing(uuid,uuid,text),
  public.commit_native_billing_state(uuid,uuid,uuid,jsonb),public.has_native_subscription(uuid) to service_role;
revoke all on function public.reserve_native_purchase_intent(uuid,uuid,uuid,text,text,text),public.release_native_purchase_intent(uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.reserve_native_purchase_intent(uuid,uuid,uuid,text,text,text),public.release_native_purchase_intent(uuid,uuid,uuid,text,uuid) to service_role;
revoke all on function private.detach_native_billing_account() from public,anon,authenticated,service_role;
revoke all on function public.workspace_entitlements(uuid) from public,anon;
grant execute on function public.workspace_entitlements(uuid) to authenticated,service_role;
