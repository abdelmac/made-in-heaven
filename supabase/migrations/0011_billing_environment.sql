-- Bind each database to one Stripe environment. Existing databases remain test.
create table public.billing_environment (
  id boolean primary key default true check (id),
  mode text not null default 'test' check (mode in ('test','live')),
  stripe_account_id text check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  check (mode <> 'live' or stripe_account_id is not null)
);
insert into public.billing_environment(id) values(true);

alter table public.workspace_subscriptions add column billing_mode text not null default 'test' check (billing_mode in ('test','live'));
alter table public.billing_events add column billing_mode text not null default 'test' check (billing_mode in ('test','live'));
alter table public.billing_environment enable row level security;
revoke all on public.billing_environment from public,anon,authenticated,service_role;
grant select on public.billing_environment to service_role;
revoke all on public.workspace_subscriptions,public.billing_events from public,anon,authenticated;

-- This predicate deliberately includes ended subscriptions and expired grants.
-- Clearing a status alone must never turn a used database into a fresh one.
create function private.has_billing_history() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.billing_events) or exists(
    select 1 from public.workspace_subscriptions where
      stripe_customer_id is not null or stripe_subscription_id is not null
      or paid_through is not null or trial_end is not null or current_period_end is not null
      or checkout_session_id is not null or checkout_attempt_id is not null or checkout_price_id is not null
      or price_id is not null or tier <> 'free' or paid_tier <> 'free' or status <> 'none'
      or cancel_at_period_end or cancel_at is not null or deletion_pending
  );
$$;

create function private.protect_billing_environment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('DELETE','TRUNCATE') then
    raise exception 'The billing environment binding cannot be removed.' using errcode='23514';
  end if;
  if new.mode is distinct from old.mode or new.stripe_account_id is distinct from old.stripe_account_id then
    if private.has_billing_history() then
      raise exception 'Billing history prevents changing the environment or Stripe account; use a separate database.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger protect_billing_environment before update or delete on public.billing_environment
  for each row execute function private.protect_billing_environment();
create trigger protect_billing_environment_truncate before truncate on public.billing_environment
  for each statement execute function private.protect_billing_environment();

create function public.assert_billing_environment(p_mode text,p_stripe_account_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare binding public.billing_environment;
begin
  if p_mode is null or p_mode not in ('test','live')
    or (p_stripe_account_id is not null and p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$')
    or (p_mode='live' and p_stripe_account_id is null) then
    raise exception 'Invalid billing environment configuration.' using errcode='22023';
  end if;
  select * into strict binding from public.billing_environment where id=true for share;
  if binding.mode is distinct from p_mode or binding.stripe_account_id is distinct from p_stripe_account_id then
    raise exception 'Billing environment does not match the database binding.' using errcode='23514';
  end if;
end $$;

-- Operator-only setup: the application asserts the binding; it never sets it.
create function public.configure_billing_environment(p_mode text,p_stripe_account_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare binding public.billing_environment;
begin
  if p_mode is null or p_mode not in ('test','live')
    or (p_stripe_account_id is not null and p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$')
    or (p_mode='live' and p_stripe_account_id is null) then
    raise exception 'Invalid billing environment configuration.' using errcode='22023';
  end if;
  select * into binding from public.billing_environment where id=true for update;
  if not found then raise exception 'Billing environment binding is missing.' using errcode='23514'; end if;
  if binding.mode is not distinct from p_mode and binding.stripe_account_id is not distinct from p_stripe_account_id then return; end if;
  update public.billing_environment set mode=p_mode,stripe_account_id=p_stripe_account_id where id=true;
  -- Only empty Free placeholders can exist when a binding change is allowed.
  update public.workspace_subscriptions set billing_mode=p_mode where billing_mode<>p_mode;
end $$;

-- Shared row locks serialize every billing write with an operator rebind while
-- allowing unrelated workspace transactions to proceed concurrently.
create function private.check_billing_write_environment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare active_mode text;
begin
  select mode into strict active_mode from public.billing_environment where id=true for share;
  if new.billing_mode is distinct from active_mode then
    raise exception 'Billing record does not match the database environment.' using errcode='23514';
  end if;
  if tg_op='UPDATE' and old.billing_mode is distinct from new.billing_mode
    and (tg_table_name='billing_events' or private.has_billing_history()) then
    raise exception 'Existing billing history cannot be relabeled.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger check_subscription_billing_environment before insert or update on public.workspace_subscriptions
  for each row execute function private.check_billing_write_environment();
create trigger check_event_billing_environment before insert or update on public.billing_events
  for each row execute function private.check_billing_write_environment();

create or replace function public.commit_billing_state(p_workspace_id uuid,p_token uuid,p_patch jsonb,p_event_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sub public.workspace_subscriptions; active_mode text;
begin
  select mode into strict active_mode from public.billing_environment where id=true for share;
  if p_patch ? 'billing_mode' and p_patch->>'billing_mode' is distinct from active_mode then
    raise exception 'Billing patch does not match the database environment.' using errcode='23514';
  end if;
  -- Preserve fencing: hold the lease row until the atomic state/event commit.
  perform 1 from public.billing_workspace_locks where workspace_id=p_workspace_id and token=p_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Billing lease expired; retry reconciliation'; end if;
  insert into public.workspace_subscriptions(workspace_id,billing_mode) values(p_workspace_id,active_mode) on conflict do nothing;
  select * into strict v_sub from public.workspace_subscriptions where workspace_id=p_workspace_id for update;
  if v_sub.billing_mode is distinct from active_mode then
    raise exception 'Stored subscription does not match the database environment.' using errcode='23514';
  end if;
  v_sub := jsonb_populate_record(v_sub,p_patch - 'workspace_id');
  update public.workspace_subscriptions set
    stripe_customer_id=v_sub.stripe_customer_id,stripe_subscription_id=v_sub.stripe_subscription_id,
    tier=v_sub.tier,paid_tier=v_sub.paid_tier,status=v_sub.status,price_id=v_sub.price_id,
    current_period_end=v_sub.current_period_end,paid_through=v_sub.paid_through,trial_end=v_sub.trial_end,
    cancel_at_period_end=v_sub.cancel_at_period_end,cancel_at=v_sub.cancel_at,
    checkout_session_id=v_sub.checkout_session_id,checkout_attempt_id=v_sub.checkout_attempt_id,checkout_price_id=v_sub.checkout_price_id,
    deletion_pending=v_sub.deletion_pending,billing_mode=active_mode,updated_at=now()
  where workspace_id=p_workspace_id;
  if p_event_id is not null then
    update public.billing_events set status='processed',processed_at=now(),error=null
      where event_id=p_event_id and billing_mode=active_mode;
    if not found then raise exception 'Billing event was not durably received in this environment'; end if;
  end if;
end $$;

-- Keep the public wrapper (backgrounds/flashcards/music) and all paid-period rules.
create or replace function private.workspace_entitlements_v1(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_kind text;
  v_allowed text;
  v_tier text := 'free';
  v_sub public.workspace_subscriptions;
  v_policy jsonb;
  v_paid boolean;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not exists (
    select 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = auth.uid()
  ) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  select kind into v_kind from public.workspaces where id = p_workspace_id;
  if v_kind is null then raise exception 'Workspace not found'; end if;
  v_allowed := case when v_kind = 'organization' then 'team' else 'pro' end;
  select config into strict v_policy from public.billing_policy where id = true;
  select s.* into v_sub from public.workspace_subscriptions s
    join public.billing_environment b on b.id=true and b.mode=s.billing_mode
    where s.workspace_id = p_workspace_id;
  if v_sub.paid_tier = v_allowed and v_sub.paid_through > now() then
    v_tier := v_sub.paid_tier;
  elsif v_sub.paid_tier = v_allowed and v_sub.status = 'past_due'
      and v_sub.paid_through + make_interval(days => greatest(0,(v_policy->>'paymentGraceDays')::integer)) > now() then
    v_tier := v_sub.paid_tier;
  elsif v_sub.tier = v_allowed and v_sub.status = 'trialing' and (v_policy->>'allowTrials')::boolean and v_sub.trial_end > now() then
    v_tier := v_sub.tier;
  end if;
  v_paid := v_tier <> 'free';
  return jsonb_build_object('tier',v_tier,'limits',v_policy->'plans'->v_tier,'features',jsonb_build_object(
    'advancedAnalytics',v_paid,'customThemes',v_paid,'savedLayouts',v_paid,'advancedTemplates',v_paid,'teamWorkspaces',v_tier='team'
  ));
end $$;

revoke all on function private.has_billing_history(),private.protect_billing_environment(),private.check_billing_write_environment(),private.workspace_entitlements_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function public.assert_billing_environment(text,text),public.configure_billing_environment(text,text),public.commit_billing_state(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.assert_billing_environment(text,text),public.configure_billing_environment(text,text),public.commit_billing_state(uuid,uuid,jsonb,text) to service_role;
