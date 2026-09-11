-- Workspace billing: trusted server writes, fenced processing, atomic receipts.
create table public.billing_policy (
  id boolean primary key default true check (id),
  config jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.billing_policy(config) values ('{
  "paymentGraceDays": 0,
  "allowTrials": false,
  "plans": {
    "free": {"subjects":10,"tasks":100,"projects":5,"members":1},
    "pro": {"subjects":null,"tasks":null,"projects":null,"members":1},
    "team": {"subjects":null,"tasks":null,"projects":null,"members":25}
  }
}'::jsonb);

create table public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  tier text not null default 'free' check (tier in ('free','pro','team')),
  paid_tier text not null default 'free' check (paid_tier in ('free','pro','team')),
  status text not null default 'none',
  price_id text,
  current_period_end timestamptz,
  paid_through timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  checkout_session_id text,
  checkout_attempt_id uuid,
  checkout_price_id text,
  deletion_pending boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.billing_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index billing_events_pending on public.billing_events(created_at) where status <> 'processed';

create table public.billing_workspace_locks (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  token uuid not null,
  expires_at timestamptz not null
);

alter table public.billing_policy enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_workspace_locks enable row level security;
-- Clients can see entitlements only through the checked RPC, never mutate billing.
revoke all on public.billing_policy, public.workspace_subscriptions, public.billing_events, public.billing_workspace_locks from anon, authenticated;
grant all on public.billing_policy, public.workspace_subscriptions, public.billing_events, public.billing_workspace_locks to service_role;

create function public.workspace_entitlements(p_workspace_id uuid)
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
  select * into v_sub from public.workspace_subscriptions where workspace_id = p_workspace_id;
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
revoke all on function public.workspace_entitlements(uuid) from public, anon;
grant execute on function public.workspace_entitlements(uuid) to authenticated, service_role;

create function public.claim_billing_workspace(p_workspace_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  insert into public.billing_workspace_locks(workspace_id,token,expires_at)
  values(p_workspace_id,p_token,clock_timestamp()+interval '3 minutes')
  on conflict(workspace_id) do update set token=excluded.token,expires_at=excluded.expires_at
  where public.billing_workspace_locks.expires_at < clock_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

create function public.release_billing_workspace(p_workspace_id uuid,p_token uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.billing_workspace_locks where workspace_id=p_workspace_id and token=p_token;
$$;

create function public.commit_billing_state(p_workspace_id uuid,p_token uuid,p_patch jsonb,p_event_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sub public.workspace_subscriptions;
begin
  -- Hold the lock row through commit. Expired workers cannot overwrite a new worker.
  perform 1 from public.billing_workspace_locks where workspace_id=p_workspace_id and token=p_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Billing lease expired; retry reconciliation'; end if;
  insert into public.workspace_subscriptions(workspace_id) values(p_workspace_id) on conflict do nothing;
  select * into strict v_sub from public.workspace_subscriptions where workspace_id=p_workspace_id for update;
  v_sub := jsonb_populate_record(v_sub,p_patch - 'workspace_id');
  update public.workspace_subscriptions set
    stripe_customer_id=v_sub.stripe_customer_id,stripe_subscription_id=v_sub.stripe_subscription_id,
    tier=v_sub.tier,paid_tier=v_sub.paid_tier,status=v_sub.status,price_id=v_sub.price_id,
    current_period_end=v_sub.current_period_end,paid_through=v_sub.paid_through,trial_end=v_sub.trial_end,
    cancel_at_period_end=v_sub.cancel_at_period_end,cancel_at=v_sub.cancel_at,
    checkout_session_id=v_sub.checkout_session_id,checkout_attempt_id=v_sub.checkout_attempt_id,checkout_price_id=v_sub.checkout_price_id,
    deletion_pending=v_sub.deletion_pending,
    updated_at=now()
  where workspace_id=p_workspace_id;
  if p_event_id is not null then
    update public.billing_events set status='processed',processed_at=now(),error=null where event_id=p_event_id;
    if not found then raise exception 'Billing event was not durably received'; end if;
  end if;
end $$;

revoke all on function public.claim_billing_workspace(uuid,uuid), public.release_billing_workspace(uuid,uuid), public.commit_billing_state(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_billing_workspace(uuid,uuid), public.release_billing_workspace(uuid,uuid), public.commit_billing_state(uuid,uuid,jsonb,text) to service_role;
