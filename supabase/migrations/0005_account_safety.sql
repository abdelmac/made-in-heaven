-- Keep shared contributions attributed to a pseudonymous UUID after account deletion.
alter table public.planned_sessions drop constraint planned_sessions_user_id_fkey;

create function private.protect_account_deletion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(old.id::text,2));
  if exists(select 1 from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id where m.user_id=old.id and m.role='owner' and w.kind='organization') then
    raise exception 'Transfer organization ownership before deleting this account.' using errcode='23514';
  end if;
  if exists(select 1 from public.workspaces w join public.workspace_subscriptions s on s.workspace_id=w.id where w.created_by=old.id and s.stripe_subscription_id is not null and s.status not in ('canceled','incomplete_expired')) then
    raise exception 'End active subscriptions before deleting this account.' using errcode='23514';
  end if;
  if exists(select 1 from public.workspaces w join public.workspace_subscriptions s on s.workspace_id=w.id where w.created_by=old.id
      and (s.checkout_session_id is not null or s.checkout_attempt_id is not null or (s.stripe_customer_id is not null and not s.deletion_pending))) then
    raise exception 'Verify billing and expire pending checkout before deleting this account.' using errcode='23514';
  end if;
  return old;
end $$;
create trigger protect_folia_account before delete on auth.users for each row execute function private.protect_account_deletion();
revoke all on function private.protect_account_deletion() from public,anon,authenticated;
