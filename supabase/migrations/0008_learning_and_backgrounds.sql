-- Additive upgrade: preserve the established sync transaction and wrap it with
-- author-owned learning records, paid backgrounds, and old-client compatibility.
alter table public.sync_operations add column request_hash text;
alter table public.subjects add column completed_at timestamptz;
alter table public.focus_sessions add constraint focus_sessions_workspace_identity unique(workspace_id,id);

create table public.note_sheets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null, user_id uuid not null, subject_id uuid, session_id uuid,
  kind text not null check(kind in ('note','session_reflection','subject_completion')),
  created_at timestamptz not null, updated_at timestamptz not null, payload jsonb not null,
  primary key(workspace_id,id),
  foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id) deferrable initially deferred,
  foreign key(workspace_id,session_id) references public.focus_sessions(workspace_id,id) deferrable initially deferred
);
create table public.flashcard_decks (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null, user_id uuid not null, subject_id uuid,
  created_at timestamptz not null, updated_at timestamptz not null, payload jsonb not null,
  primary key(workspace_id,id), unique(workspace_id,id,user_id),
  foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id) deferrable initially deferred
);
create table public.flashcards (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null, user_id uuid not null, deck_id uuid not null,
  created_at timestamptz not null, updated_at timestamptz not null, payload jsonb not null,
  primary key(workspace_id,id),
  foreign key(workspace_id,deck_id,user_id) references public.flashcard_decks(workspace_id,id,user_id) deferrable initially deferred
);
create index note_sheets_subject on public.note_sheets(workspace_id,subject_id);
create index flashcards_deck on public.flashcards(workspace_id,deck_id,created_at);
do $$ declare t text; begin
  foreach t in array array['note_sheets','flashcard_decks','flashcards'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.workspace_role(workspace_id) is not null)',t);
  end loop;
end $$;

-- The trusted billing calculation stays the single authority for paid periods.
alter function public.workspace_entitlements(uuid) set schema private;
alter function private.workspace_entitlements(uuid) rename to workspace_entitlements_v1;
revoke all on function private.workspace_entitlements_v1(uuid) from public,anon,authenticated,service_role;
create function public.workspace_entitlements(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ent jsonb; paid boolean;
begin
  ent := private.workspace_entitlements_v1(p_workspace_id);
  paid := ent->>'tier'<>'free';
  return jsonb_set(ent,'{features}',ent->'features'||jsonb_build_object('backgrounds',paid,'flashcards',paid));
end $$;
revoke all on function public.workspace_entitlements(uuid) from public,anon;
grant execute on function public.workspace_entitlements(uuid) to authenticated,service_role;

create function private.learning_preferences(p_preferences jsonb,p_prior jsonb,p_ent jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare prefs jsonb:=p_preferences; background jsonb;
begin
  if jsonb_typeof(prefs) is distinct from 'object' then raise exception 'Invalid preferences.' using errcode='22023'; end if;
  -- Preserve a newer accent when an old tab simply sends back its closest legacy
  -- fallback; a different legacy color is still an explicit color change.
  if not (prefs ? 'accentColor') and not (prefs ? 'background') and p_prior->>'accent' in ('blurple','rose','cyan')
    and prefs->>'accent'=(case p_prior->>'accent' when 'rose' then 'plum' else 'blue' end) then
    prefs:=jsonb_set(prefs,'{accent}',p_prior->'accent');
  end if;
  if not (prefs ? 'accentColor') then prefs:=prefs||jsonb_build_object('accentColor',coalesce(p_prior->'accentColor','null'::jsonb)); end if;
  if not (prefs ? 'background') then prefs:=prefs||jsonb_build_object('background',coalesce(p_prior->'background','{"kind":"none","preset":"aurora","image":null,"overlay":70,"blur":0}'::jsonb)); end if;
  if prefs->'accentColor'<>'null'::jsonb and (jsonb_typeof(prefs->'accentColor')<>'string' or prefs->>'accentColor' !~ '^#[0-9a-fA-F]{6}$') then raise exception 'Invalid accent color.' using errcode='22023'; end if;
  background:=prefs->'background';
  if jsonb_typeof(background) is distinct from 'object' or not (background ?& array['kind','preset','image','overlay','blur'])
    or jsonb_typeof(background->'kind') is distinct from 'string' or jsonb_typeof(background->'preset') is distinct from 'string'
    or background->>'kind' not in ('none','preset','image') or background->>'preset' not in ('aurora','dusk','ocean','forest')
    or jsonb_typeof(background->'overlay') is distinct from 'number' or jsonb_typeof(background->'blur') is distinct from 'number'
    or (background->>'overlay')::numeric not between 40 and 95 or (background->>'blur')::numeric not between 0 and 16
    or trunc((background->>'overlay')::numeric)<>(background->>'overlay')::numeric or trunc((background->>'blur')::numeric)<>(background->>'blur')::numeric
    or (background->'image'<>'null'::jsonb and (jsonb_typeof(background->'image')<>'string' or length(background->>'image')>350000 or background->>'image' !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'))
    or (background->>'kind'='image' and background->'image'='null'::jsonb)
  then raise exception 'Invalid background settings.' using errcode='22023'; end if;
  if not coalesce((p_ent->'features'->>'backgrounds')::boolean,false) and background->>'kind'<>'none' and background is distinct from p_prior->'background' then
    raise exception 'Personalized backgrounds require a paid plan for this workspace.' using errcode='42501';
  end if;
  return prefs;
end $$;
revoke all on function private.learning_preferences(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid) set schema private;
alter function private.folia_commit_document(uuid,uuid,jsonb,bigint,uuid) rename to commit_document_v1;
revoke all on function private.commit_document_v1(uuid,uuid,jsonb,bigint,uuid) from public,anon,authenticated,service_role;
create function public.folia_commit_document(p_actor uuid,p_workspace uuid,p_data jsonb,p_expected_version bigint,p_operation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  prior jsonb; prior_prefs jsonb; normalized jsonb:=p_data; ent jsonb; result jsonb;
  original public.sync_operations%rowtype; original_hash text; version_now bigint;
  collection text; item jsonb; saved jsonb; revisions jsonb; session jsonb; subject jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,1));
  perform 1 from public.workspaces where id=p_workspace for update;
  if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor and role in ('owner','admin','member')) then raise exception 'Your workspace role cannot save content.' using errcode='42501'; end if;
  select data,version into prior,version_now from public.workspace_documents where workspace_id=p_workspace for update;
  if not found then raise exception 'Workspace storage does not exist.' using errcode='22023'; end if;
  original_hash:=encode(extensions.digest(p_data::text,'sha256'),'hex');
  select * into original from public.sync_operations where workspace_id=p_workspace and operation_id=p_operation;
  if found then
    if original.actor_id<>p_actor or coalesce(original.request_hash,original.payload_hash)<>original_hash then raise exception 'An operation ID cannot be reused for different changes.' using errcode='23505'; end if;
    return jsonb_build_object('version',version_now,'committedVersion',original.version,'replayed',true);
  end if;
  if version_now<>p_expected_version then return jsonb_build_object('conflict',true,'version',version_now); end if;
  ent:=public.workspace_entitlements(p_workspace);
  select data into prior_prefs from public.preferences where workspace_id=p_workspace and user_id=p_actor;
  normalized:=jsonb_set(normalized,'{preferences}',private.learning_preferences(p_data->'preferences',prior_prefs,ent));
  foreach collection in array array['noteSheets','flashcardDecks','flashcards'] loop
    if not (p_data ? collection) then normalized:=normalized||jsonb_build_object(collection,coalesce(prior->collection,'[]'::jsonb)); end if;
    if jsonb_typeof(normalized->collection) is distinct from 'array' then raise exception 'Invalid learning collection.' using errcode='22023'; end if;
    if jsonb_array_length(normalized->collection)>(case collection when 'flashcardDecks' then 10000 else 100000 end) then raise exception 'Learning collection is too large.' using errcode='22023'; end if;
  end loop;
  -- Legacy clients cannot erase completion state by omitting a field they do not know.
  if not (p_data ? 'noteSheets') then
    normalized:=jsonb_set(normalized,'{events}',coalesce(p_data->'events','[]'::jsonb)||coalesce((
      select jsonb_agg(x) from jsonb_array_elements(coalesce(prior->'events','[]'::jsonb)) x
      where x->>'type' in ('subject_completed','subject_reopened','note_created','note_updated','note_deleted','flashcard_deck_created','flashcard_deck_updated','flashcard_deck_deleted','flashcard_created','flashcard_updated','flashcard_deleted')
      and not exists(select 1 from jsonb_array_elements(p_data->'events') supplied where supplied->>'id'=x->>'id')
    ),'[]'::jsonb));
    select coalesce(jsonb_agg(case when not (proposed ? 'completedAt') and old_subject ? 'completedAt' then proposed||jsonb_build_object('completedAt',old_subject->'completedAt') else proposed end),'[]'::jsonb)
    into subject from jsonb_array_elements(p_data->'subjects') proposed left join lateral (select x old_subject from jsonb_array_elements(coalesce(prior->'subjects','[]'::jsonb)) x where x->>'id'=proposed->>'id' limit 1) old on true;
    normalized:=jsonb_set(normalized,'{subjects}',subject);
  end if;
  foreach collection in array array['noteSheets','flashcardDecks','flashcards'] loop
    for saved in select * from jsonb_array_elements(coalesce(prior->collection,'[]'::jsonb)) loop
      if saved->>'userId'<>p_actor::text and not exists(select 1 from jsonb_array_elements(normalized->collection) x where x=saved) then raise exception 'You cannot change another member''s learning records.' using errcode='42501'; end if;
    end loop;
    for item in select * from jsonb_array_elements(normalized->collection) loop
      if item->>'workspaceId' is distinct from p_workspace::text then raise exception 'Learning records belong to this workspace.' using errcode='23514'; end if;
      select x into saved from jsonb_array_elements(coalesce(prior->collection,'[]'::jsonb)) x where x->>'id'=item->>'id';
      if saved is not null and (saved->>'userId' is distinct from item->>'userId' or saved->>'createdAt' is distinct from item->>'createdAt') then raise exception 'Learning records retain their author and creation timestamp.' using errcode='42501'; end if;
      if saved is distinct from item and item->>'userId' is distinct from p_actor::text then raise exception 'Create or edit only your own learning records.' using errcode='42501'; end if;
      if collection='noteSheets' and saved is null and not (ent->'features'->>'teamWorkspaces')::boolean and exists(select 1 from public.workspaces where id=p_workspace and kind='organization') then raise exception 'Creating new shared notes requires an active Team plan. Existing notes remain available.' using errcode='42501'; end if;
      if collection<>'noteSheets' and saved is distinct from item and not (ent->'features'->>'flashcards')::boolean then raise exception 'Creating or changing flashcards requires a paid plan for this workspace.' using errcode='42501'; end if;
      if collection in ('noteSheets','flashcardDecks') and item->>'subjectId' is not null and not exists(select 1 from jsonb_array_elements(normalized->'subjects') x where x->>'id'=item->>'subjectId') then raise exception 'Learning subject must belong to this workspace.' using errcode='23514'; end if;
      if collection='noteSheets' then
        if coalesce(length(btrim(item->>'title')),0) not between 1 and 200 or coalesce(length(btrim(item->>'content')),0) not between 1 and 20000 or jsonb_typeof(item->'revisions') is distinct from 'array' then raise exception 'Invalid note sheet.' using errcode='22023'; end if;
        if item->>'kind'='subject_completion' and item->>'subjectId' is null then raise exception 'Completion notes require a subject.' using errcode='23514'; end if;
        if item->>'kind'='session_reflection' and item->>'sessionId' is null then raise exception 'Reflection notes require a completed focus session.' using errcode='23514'; end if;
        if item->>'sessionId' is not null then
          select x into session from jsonb_array_elements(normalized->'focusSessions') x where x->>'id'=item->>'sessionId';
          if session is null or session->>'userId'<>item->>'userId' or session->>'phase'<>'focus' or session->>'status'<>'completed' or session->>'workspaceId'<>p_workspace::text or (item->>'subjectId' is not null and item->>'subjectId' is distinct from session->'context'->>'subjectId') then raise exception 'Notes can reference only the author''s completed focus in the selected subject.' using errcode='23514'; end if;
        end if;
        if saved is not null then
          revisions:=item->'revisions';
          if saved->>'title' is distinct from item->>'title' or saved->>'content' is distinct from item->>'content' then
            if jsonb_array_length(revisions)<>jsonb_array_length(saved->'revisions')+1 or (revisions - (jsonb_array_length(revisions)-1))<>saved->'revisions' or revisions->-1->>'title' is distinct from saved->>'title' or revisions->-1->>'content' is distinct from saved->>'content' then raise exception 'Keep the previous note title and content in revision history.' using errcode='23514'; end if;
          elsif revisions is distinct from saved->'revisions' then raise exception 'Note revisions cannot be rewritten.' using errcode='23514'; end if;
        end if;
      elsif collection='flashcardDecks' then
        if coalesce(length(btrim(item->>'title')),0) not between 1 and 120 or length(item->>'description')>20000 then raise exception 'Invalid flashcard deck.' using errcode='22023'; end if;
      else
        if coalesce(length(btrim(item->>'front')),0) not between 1 and 4000 or coalesce(length(btrim(item->>'back')),0) not between 1 and 10000 then raise exception 'Invalid flashcard.' using errcode='22023'; end if;
        if not exists(select 1 from jsonb_array_elements(normalized->'flashcardDecks') x where x->>'id'=item->>'deckId' and x->>'userId'=item->>'userId') then raise exception 'A flashcard and its deck must have the same author and workspace.' using errcode='23514'; end if;
      end if;
    end loop;
  end loop;
  result:=private.commit_document_v1(p_actor,p_workspace,normalized,p_expected_version,p_operation);
  if coalesce((result->>'conflict')::boolean,false) or coalesce((result->>'replayed')::boolean,false) then return result; end if;
  delete from public.flashcards where workspace_id=p_workspace;
  delete from public.flashcard_decks where workspace_id=p_workspace;
  delete from public.note_sheets where workspace_id=p_workspace;
  for item in select * from jsonb_array_elements(normalized->'noteSheets') loop
    insert into public.note_sheets(workspace_id,id,user_id,subject_id,session_id,kind,created_at,updated_at,payload) values(p_workspace,(item->>'id')::uuid,(item->>'userId')::uuid,(item->>'subjectId')::uuid,(item->>'sessionId')::uuid,item->>'kind',(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz,item);
  end loop;
  for item in select * from jsonb_array_elements(normalized->'flashcardDecks') loop
    insert into public.flashcard_decks(workspace_id,id,user_id,subject_id,created_at,updated_at,payload) values(p_workspace,(item->>'id')::uuid,(item->>'userId')::uuid,(item->>'subjectId')::uuid,(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz,item);
  end loop;
  for item in select * from jsonb_array_elements(normalized->'flashcards') loop
    insert into public.flashcards(workspace_id,id,user_id,deck_id,created_at,updated_at,payload) values(p_workspace,(item->>'id')::uuid,(item->>'userId')::uuid,(item->>'deckId')::uuid,(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz,item);
  end loop;
  update public.subjects set completed_at=(payload->>'completedAt')::timestamptz where workspace_id=p_workspace;
  update public.sync_operations set request_hash=original_hash where workspace_id=p_workspace and operation_id=p_operation;
  return result;
end $$;
revoke all on function public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid) to service_role;

alter function public.folia_save_preferences(uuid,uuid,jsonb,bigint,uuid) set schema private;
alter function private.folia_save_preferences(uuid,uuid,jsonb,bigint,uuid) rename to save_preferences_v1;
revoke all on function private.save_preferences_v1(uuid,uuid,jsonb,bigint,uuid) from public,anon,authenticated,service_role;
create function public.folia_save_preferences(p_actor uuid,p_workspace uuid,p_preferences jsonb,p_expected_version bigint,p_operation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare prior jsonb; normalized jsonb; result jsonb; original public.sync_operations%rowtype; original_hash text; version_now bigint;
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor) then raise exception 'You do not have access to this workspace.' using errcode='42501'; end if;
  select version into version_now from public.workspace_documents where workspace_id=p_workspace for update;
  original_hash:=encode(extensions.digest(jsonb_build_object('preferences',p_preferences)::text,'sha256'),'hex');
  select * into original from public.sync_operations where workspace_id=p_workspace and operation_id=p_operation;
  if found then
    if original.actor_id<>p_actor or coalesce(original.request_hash,original.payload_hash)<>original_hash then raise exception 'An operation ID cannot be reused for different changes.' using errcode='23505'; end if;
    select data into prior from public.preferences where workspace_id=p_workspace and user_id=p_actor;
    return jsonb_build_object('version',version_now,'committedVersion',original.version,'preferences',prior,'replayed',true);
  end if;
  if version_now<>p_expected_version then return jsonb_build_object('conflict',true,'version',version_now); end if;
  select data into prior from public.preferences where workspace_id=p_workspace and user_id=p_actor;
  normalized:=private.learning_preferences(p_preferences,prior,public.workspace_entitlements(p_workspace));
  result:=private.save_preferences_v1(p_actor,p_workspace,normalized,p_expected_version,p_operation);
  update public.sync_operations set request_hash=original_hash where workspace_id=p_workspace and operation_id=p_operation;
  return result||jsonb_build_object('preferences',normalized);
end $$;
revoke all on function public.folia_save_preferences(uuid,uuid,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.folia_save_preferences(uuid,uuid,jsonb,bigint,uuid) to service_role;

-- A free custom accent follows personal accessibility choices into a new scope.
-- Paid background/theme assets never copy across subscriptions.
create or replace function public.folia_initialize_preferences(p_actor uuid,p_workspace uuid,p_base jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing jsonb; workspace_settings jsonb; personal jsonb; overrides jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor) then raise exception 'Workspace access denied.' using errcode='42501'; end if;
  select data into existing from public.preferences where user_id=p_actor and workspace_id=p_workspace;
  if found then return existing; end if;
  select settings into workspace_settings from public.workspaces where id=p_workspace and kind='organization';
  select p.data into personal from public.preferences p join public.workspaces w on w.id=p.workspace_id where p.user_id=p_actor and w.kind='personal';
  select jsonb_object_agg(key,value) into overrides from jsonb_each(coalesce(personal,'{}'::jsonb)) where key in ('appearance','accent','accentColor','density','fontSize','radius','motion','timeZone','timeFormat','dateFormat','sound','notifications','heatmapMode');
  existing := p_base || coalesce(overrides,'{}'::jsonb) || coalesce(workspace_settings->'defaultPreferences','{}'::jsonb);
  insert into public.preferences(user_id,workspace_id,data) values(p_actor,p_workspace,existing) on conflict(user_id,workspace_id) do nothing;
  select data into existing from public.preferences where user_id=p_actor and workspace_id=p_workspace;
  return existing;
end $$;
