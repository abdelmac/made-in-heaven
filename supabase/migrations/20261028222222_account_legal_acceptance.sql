-- Server-owned snapshots of self-declared online eligibility and legal acceptance.
-- A coarse age band is a declaration, not verified age or parental consent.
create table public.account_legal_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  age_group text not null check (age_group in ('16-17','18+')),
  terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  privacy_version text not null check (privacy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  legal_accepted boolean not null default true check (legal_accepted),
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('signup','account'))
);
alter table public.account_legal_acceptances enable row level security;
revoke all on public.account_legal_acceptances from public,anon,authenticated,service_role,supabase_auth_admin;
grant select,insert,update on public.account_legal_acceptances to service_role;

-- Never accept a client-supplied acceptance timestamp, including on reacceptance.
create function private.stamp_account_legal_acceptance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.accepted_at := clock_timestamp();
  return new;
end $$;
create trigger stamp_account_legal_acceptance before insert or update on public.account_legal_acceptances
for each row execute function private.stamp_account_legal_acceptance();
revoke all on function private.stamp_account_legal_acceptance() from public,anon,authenticated,service_role,supabase_auth_admin;

-- Private trigger privileges are necessary to snapshot Auth INSERTs without
-- granting the Auth provider or clients direct writes to the service-only table.
-- There is no callable client endpoint; NEW is the actual inserted Auth row.
create function private.capture_account_legal_acceptance() returns trigger
language plpgsql security definer set search_path='' as $$
declare declaration jsonb := to_jsonb(new)->'raw_user_meta_data';
begin
  if declaration->>'age_group' in ('16-17','18+')
    and declaration->'terms_version' = '"2026-10-28"'::jsonb
    and declaration->'privacy_version' = '"2026-10-28"'::jsonb
    and declaration->'legal_accepted' = 'true'::jsonb then
    insert into public.account_legal_acceptances(user_id,age_group,terms_version,privacy_version,legal_accepted,source)
      values(new.id,declaration->>'age_group','2026-10-28','2026-10-28',true,'signup')
      on conflict(user_id) do nothing;
  end if;
  -- Legacy/admin-created users with no complete declaration remain ineligible.
  -- They can explicitly accept through the authenticated service API later.
  return new;
end $$;
create trigger capture_account_legal_acceptance after insert on auth.users
for each row execute function private.capture_account_legal_acceptance();
revoke all on function private.capture_account_legal_acceptance() from public,anon,authenticated,service_role,supabase_auth_admin;

create function public.folia_account_legal_eligible(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.account_legal_acceptances
    where user_id=p_user and age_group in ('16-17','18+') and legal_accepted
      and terms_version='2026-10-28' and privacy_version='2026-10-28')
$$;
revoke all on function public.folia_account_legal_eligible(uuid) from public,anon,authenticated,supabase_auth_admin;
grant execute on function public.folia_account_legal_eligible(uuid) to service_role;

-- This is an Auth Hook, not an Auth-row trigger. Deploy the matching clients
-- before enabling pg-functions://postgres/public/folia_before_user_created.
-- The documented hook event uses user.user_metadata, not raw_user_meta_data.
create function public.folia_before_user_created(event jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare declaration jsonb := event#>'{user,user_metadata}';
begin
  if declaration->>'age_group' in ('16-17','18+')
    and declaration->'terms_version' = '"2026-10-28"'::jsonb
    and declaration->'privacy_version' = '"2026-10-28"'::jsonb
    and declaration->'legal_accepted' = 'true'::jsonb then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error',jsonb_build_object('http_code',403,
    'message','Online accounts require an age declaration of 16 or older and acceptance of the current terms and privacy notice.'));
end $$;
revoke all on function public.folia_before_user_created(jsonb) from public,anon,authenticated,service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.folia_before_user_created(jsonb) to supabase_auth_admin;
