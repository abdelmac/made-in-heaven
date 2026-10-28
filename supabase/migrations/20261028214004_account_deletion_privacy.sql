-- Account deletion removes attributable shared content in the Auth transaction.
-- Organization resources without author metadata remain owned by their workspace.
begin;

create function private.scrub_account_document(
  p_document jsonb,p_user uuid,p_removed_sessions uuid[] default array[]::uuid[]
)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  document jsonb := p_document;
  collection text;
  entries jsonb;
  removed_sessions text[];
begin
  if document is null or jsonb_typeof(document) <> 'object' then return document; end if;
  select coalesce(array_agg(lower(x.value->>'id')), array[]::text[])
    into removed_sessions
    from jsonb_array_elements(case when jsonb_typeof(document->'focusSessions')='array'
      then document->'focusSessions' else '[]'::jsonb end) as x(value)
    where lower(x.value->>'userId')=p_user::text;
  removed_sessions:=removed_sessions||p_removed_sessions::text[];

  foreach collection in array array[
    'plannedSessions','focusSessions','journal','noteSheets',
    'flashcardDecks','flashcards','events'
  ] loop
    if jsonb_typeof(document->collection)='array' then
      select coalesce(jsonb_agg(
        case
          when collection in ('journal','noteSheets')
            and lower(x.value->>'sessionId')=any(removed_sessions) then
            (x.value-'sessionId') || case
              when collection='noteSheets' and x.value->>'kind'='session_reflection'
                then '{"kind":"note"}'::jsonb else '{}'::jsonb end
          else x.value
        end order by x.ordinality
      ), '[]'::jsonb) into entries
      from jsonb_array_elements(document->collection) with ordinality as x(value,ordinality)
      where lower(x.value->>'userId') is distinct from p_user::text;
      document:=jsonb_set(document,array[collection],entries,false);
    end if;
  end loop;

  if jsonb_typeof(document->'tasks')='array' then
    select coalesce(jsonb_agg(case when lower(x.value->>'assigneeId')=p_user::text
      then x.value-'assigneeId' else x.value end order by x.ordinality),'[]'::jsonb)
      into entries
      from jsonb_array_elements(document->'tasks') with ordinality as x(value,ordinality);
    document:=jsonb_set(document,'{tasks}',entries,false);
  end if;
  return document;
end $$;
revoke all on function private.scrub_account_document(jsonb,uuid,uuid[])
  from public,anon,authenticated,service_role;

create or replace function private.protect_account_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_workspace uuid;
  prior jsonb;
  cleaned jsonb;
  prior_version bigint;
  removed_sessions uuid[];
  touched boolean;
begin
  -- Sync takes the actor lock before a workspace lock; keep the same order.
  perform pg_advisory_xact_lock(hashtextextended(old.id::text,1));
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

  -- Membership alone is insufficient: former members can still have content.
  -- Select candidates before locking, then reread each document under its lock.
  for v_workspace in
    select w.id from public.workspaces w
    left join public.workspace_documents d on d.workspace_id=w.id
    where w.created_by is distinct from old.id and (
      private.scrub_account_document(d.data,old.id) is distinct from d.data
      or exists(select 1 from public.planned_sessions s where s.workspace_id=w.id and s.user_id=old.id)
      or exists(select 1 from public.focus_sessions s where s.workspace_id=w.id and s.user_id=old.id)
      or exists(select 1 from public.development_notes n where n.workspace_id=w.id and n.user_id=old.id)
      or exists(select 1 from public.note_sheets n where n.workspace_id=w.id and n.user_id=old.id)
      or exists(select 1 from public.flashcard_decks f where f.workspace_id=w.id and f.user_id=old.id)
      or exists(select 1 from public.flashcards f where f.workspace_id=w.id and f.user_id=old.id)
      or exists(select 1 from public.activity_events e where e.workspace_id=w.id and e.user_id=old.id)
      or exists(select 1 from public.tasks t where t.workspace_id=w.id and t.assignee_id=old.id)
    )
    order by w.id for update of w
  loop
    select d.data,d.version into prior,prior_version
      from public.workspace_documents d where d.workspace_id=v_workspace for update;
    select coalesce(array_agg(s.id),array[]::uuid[]) into removed_sessions
      from public.focus_sessions s where s.workspace_id=v_workspace and s.user_id=old.id;
    cleaned:=private.scrub_account_document(prior,old.id,removed_sessions);
    touched:=cleaned is distinct from prior;

    -- Preserve another author's text while removing links to erased sessions.
    update public.development_notes n set payload=n.payload-'sessionId'
      where n.workspace_id=v_workspace and n.user_id<>old.id
        and lower(n.payload->>'sessionId')=any(removed_sessions::text[]);
    touched:=touched or found;
    update public.note_sheets n set session_id=null,
      kind=case when n.kind='session_reflection' then 'note' else n.kind end,
      payload=(n.payload-'sessionId') || case when n.kind='session_reflection'
        then '{"kind":"note"}'::jsonb else '{}'::jsonb end
      where n.workspace_id=v_workspace and n.user_id<>old.id
        and n.session_id=any(removed_sessions);
    touched:=touched or found;
    update public.tasks t set assignee_id=null,payload=t.payload-'assigneeId'
      where t.workspace_id=v_workspace and (t.assignee_id=old.id or lower(t.payload->>'assigneeId')=old.id::text);
    touched:=touched or found;

    delete from public.flashcards f where f.workspace_id=v_workspace and f.user_id=old.id;
    touched:=touched or found;
    delete from public.flashcard_decks f where f.workspace_id=v_workspace and f.user_id=old.id;
    touched:=touched or found;
    delete from public.note_sheets n where n.workspace_id=v_workspace and n.user_id=old.id;
    touched:=touched or found;
    delete from public.development_notes n where n.workspace_id=v_workspace and n.user_id=old.id;
    touched:=touched or found;
    delete from public.planned_sessions s where s.workspace_id=v_workspace and s.user_id=old.id;
    touched:=touched or found;
    delete from public.focus_sessions s where s.workspace_id=v_workspace and s.user_id=old.id;
    touched:=touched or found;
    delete from public.activity_events e where e.workspace_id=v_workspace and e.user_id=old.id;
    touched:=touched or found;

    if touched then
      if cleaned is not null then
        cleaned:=jsonb_set(jsonb_set(cleaned,'{revision}',to_jsonb(prior_version+1)),
          '{updatedAt}',to_jsonb(now()));
      end if;
      update public.workspace_documents d set data=cleaned,version=prior_version+1,
        updated_by=null,updated_at=now() where d.workspace_id=v_workspace;
    end if;
  end loop;

  delete from public.workspace_audit a where a.actor_id=old.id or a.target_id=old.id
    or a.target_id in (select i.id from public.workspace_invitations i where lower(i.email)=lower(old.email));
  delete from public.workspace_invitations i where lower(i.email)=lower(old.email);
  delete from private.sync_patch_receipts r where r.actor_id=old.id;
  delete from public.sync_operations r where r.actor_id=old.id;
  delete from public.api_rate_limits r where r.user_id=old.id;
  -- Auth foreign keys remove profile, memberships, private preferences/timers and
  -- the personal workspace. A later failure rolls back this whole scrub as well.
  return old;
end $$;
revoke all on function private.protect_account_deletion()
  from public,anon,authenticated,service_role;

-- The original journal projection lacked a SQL authorship guard. A version bump
-- rejects an ordinary stale save; this guard also rejects a stale record merged
-- into a fresh version by a different author. Existing receipt replay stays safe.
alter function public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid) set schema private;
alter function private.folia_commit_document(uuid,uuid,jsonb,bigint,uuid)
  rename to commit_document_before_account_deletion;
revoke all on function private.commit_document_before_account_deletion(uuid,uuid,jsonb,bigint,uuid)
  from public,anon,authenticated,service_role;

create function public.folia_commit_document(
  p_actor uuid,p_workspace uuid,p_data jsonb,p_expected_version bigint,p_operation uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare prior jsonb; version_now bigint; item jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,1));
  perform 1 from public.workspaces where id=p_workspace for update;
  if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace
    and user_id=p_actor and role in ('owner','admin','member')) then
    raise exception 'Your workspace role cannot save content.' using errcode='42501';
  end if;
  select data,version into prior,version_now from public.workspace_documents
    where workspace_id=p_workspace for update;
  if not found then raise exception 'Workspace storage does not exist.' using errcode='22023'; end if;
  if version_now<>p_expected_version or exists(select 1 from public.sync_operations
    where workspace_id=p_workspace and operation_id=p_operation) then
    return private.commit_document_before_account_deletion(p_actor,p_workspace,p_data,p_expected_version,p_operation);
  end if;
  for item in select value from jsonb_array_elements(coalesce(prior->'journal','[]'::jsonb)) loop
    if item->>'userId' is distinct from p_actor::text and not exists(
      select 1 from jsonb_array_elements(coalesce(p_data->'journal','[]'::jsonb)) x where x=item
    ) then raise exception 'You cannot change another member''s journal entries.' using errcode='42501'; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_data->'journal','[]'::jsonb)) loop
    if item->>'userId' is distinct from p_actor::text and not exists(
      select 1 from jsonb_array_elements(coalesce(prior->'journal','[]'::jsonb)) x where x=item
    ) then raise exception 'Create or edit journal entries only as yourself.' using errcode='42501'; end if;
  end loop;
  return private.commit_document_before_account_deletion(p_actor,p_workspace,p_data,p_expected_version,p_operation);
end $$;
revoke all on function public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid)
  from public,anon,authenticated;
grant execute on function public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid) to service_role;

-- The API must check this version before canceling billing or revoking sessions.
-- A code deployment against the older retaining trigger therefore fails closed.
create function public.folia_account_deletion_version()
returns integer language sql immutable set search_path = '' as $$ select 1 $$;
revoke all on function public.folia_account_deletion_version() from public,anon,authenticated;
grant execute on function public.folia_account_deletion_version() to service_role;

commit;
