-- Serialized, idempotent writes with trusted entitlement checks and relational projections.
create function public.folia_commit_document(p_actor uuid,p_workspace uuid,p_data jsonb,p_expected_version bigint,p_operation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  old_data jsonb; version_now bigint; actor_role text; ent jsonb; item jsonb; child jsonb;
  old_payload jsonb; old_timer public.active_timers%rowtype; existing_op public.sync_operations%rowtype;
  payload_hash text; normalized jsonb; next_timer jsonb; max_count int; old_count int; new_count int; collection text;
begin
  -- User lock prevents two workspaces acquiring active timers for one user concurrently.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,1));
  perform 1 from public.workspaces where id=p_workspace for update;
  select role into actor_role from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor;
  if actor_role is null or actor_role='viewer' then raise exception 'Your workspace role cannot save content.' using errcode='42501'; end if;
  if p_data->>'workspaceId' <> p_workspace::text or p_data->>'schemaVersion' <> '1' then raise exception 'Invalid workspace document.' using errcode='22023'; end if;
  select data,version into old_data,version_now from public.workspace_documents where workspace_id=p_workspace for update;
  if not found then raise exception 'Workspace storage does not exist.' using errcode='22023'; end if;
  payload_hash := encode(extensions.digest(p_data::text,'sha256'),'hex');
  select * into existing_op from public.sync_operations where workspace_id=p_workspace and operation_id=p_operation;
  if found then
    if existing_op.actor_id <> p_actor or existing_op.payload_hash <> payload_hash then raise exception 'An operation ID cannot be reused for different changes.' using errcode='23505'; end if;
    return jsonb_build_object('version',version_now,'replayed',true);
  end if;
  if version_now <> p_expected_version then return jsonb_build_object('conflict',true,'version',version_now); end if;
  ent := public.workspace_entitlements(p_workspace);
  if exists(select 1 from public.workspaces where id=p_workspace and kind='organization') and not (ent->'features'->>'teamWorkspaces')::boolean then
    foreach collection in array array['subjects','projects','tasks','journal'] loop
      if exists(select 1 from jsonb_array_elements(p_data->collection) proposed where not exists(select 1 from jsonb_array_elements(coalesce(old_data->collection,'[]'::jsonb)) saved where saved->>'id'=proposed->>'id')) then
        raise exception 'Creating new shared content requires an active Team plan. Existing work and session completions remain available.' using errcode='42501';
      end if;
    end loop;
  end if;
  foreach collection in array array['subjects','tasks','projects'] loop
    max_count := (ent->'limits'->>collection)::int;
    old_count := coalesce(jsonb_array_length(old_data->collection),0);
    new_count := jsonb_array_length(p_data->collection);
    if max_count is not null and new_count > max_count and new_count > old_count then
      raise exception 'Your plan limit has been reached. Existing data remains available.' using errcode='42501';
    end if;
  end loop;
  select data into old_payload from public.preferences where user_id=p_actor and workspace_id=p_workspace;
  if not (ent->'features'->>'customThemes')::boolean and p_data->'preferences'->'customTheme' <> 'null'::jsonb and p_data->'preferences'->'customTheme' is distinct from old_payload->'customTheme' then
    raise exception 'Saving a new custom theme requires a paid plan for this workspace.' using errcode='42501';
  end if;
  if not (ent->'features'->>'savedLayouts')::boolean and exists(select 1 from jsonb_array_elements(p_data->'preferences'->'savedLayouts') layout where not exists(select 1 from jsonb_array_elements(coalesce(old_payload->'savedLayouts','[]'::jsonb)) saved where saved=layout)) then
    raise exception 'Saving layouts requires a paid plan for this workspace.' using errcode='42501';
  end if;
  -- Immutable historical objects must remain present, byte-equivalent as JSON values.
  if exists(select 1 from public.focus_sessions f where f.workspace_id=p_workspace and not exists(select 1 from jsonb_array_elements(p_data->'focusSessions') x where (x->>'id')::uuid=f.id and x=f.payload)) then
    raise exception 'Saved focus history cannot be removed or rewritten.' using errcode='23514';
  end if;
  if exists(select 1 from public.activity_events e where e.workspace_id=p_workspace and not exists(select 1 from jsonb_array_elements(p_data->'events') x where (x->>'id')::uuid=e.id and x=e.payload)) then
    raise exception 'Saved activity history cannot be removed or rewritten.' using errcode='23514';
  end if;
  -- Prevent changes to another user's plans even by an organization administrator.
  if exists(select 1 from public.planned_sessions s where s.workspace_id=p_workspace and s.user_id<>p_actor and not exists(select 1 from jsonb_array_elements(p_data->'plannedSessions') x where (x->>'id')::uuid=s.id and x=s.payload)) then
    raise exception 'You cannot change another member''s planned sessions.' using errcode='42501';
  end if;
  for item in select * from jsonb_array_elements(p_data->'plannedSessions') loop
    select payload into old_payload from public.planned_sessions where workspace_id=p_workspace and id=(item->>'id')::uuid;
    if old_payload is distinct from item and (item->>'userId')::uuid <> p_actor then raise exception 'Record planned sessions only for yourself.' using errcode='42501'; end if;
  end loop;
  next_timer := p_data->'timer';
  select * into old_timer from public.active_timers where user_id=p_actor for update;
  if old_timer.user_id is not null and old_timer.workspace_id=p_workspace and (next_timer->>'sessionId')::uuid is distinct from old_timer.session_id and not exists(select 1 from jsonb_array_elements(p_data->'focusSessions') completed where (completed->>'id')::uuid=old_timer.session_id) then
    raise exception 'Resolve the existing timer before replacing it. Unsaved offline sessions must be reviewed.' using errcode='23505';
  end if;
  if next_timer->>'status' <> 'idle' then
    if next_timer->'context'->>'userId' <> p_actor::text or next_timer->'context'->>'workspaceId' <> p_workspace::text then raise exception 'The active timer has an invalid owner.' using errcode='42501'; end if;
    if old_timer.user_id is not null and old_timer.workspace_id<>p_workspace then raise exception 'You already have an active timer in another workspace. Resolve that timer first.' using errcode='23505'; end if;
    if old_timer.user_id is not null and old_timer.session_id=(next_timer->>'sessionId')::uuid and
      (old_timer.payload->'context' <> next_timer->'context' or old_timer.payload->'durationMs' <> next_timer->'durationMs' or old_timer.payload->'startedAt' <> next_timer->'startedAt' or old_timer.payload->'phase' <> next_timer->'phase') then
      raise exception 'The active session context is frozen.' using errcode='23514';
    end if;
    if exists(select 1 from public.focus_sessions where id=(next_timer->>'sessionId')::uuid) then raise exception 'A recorded session cannot start again.' using errcode='23505'; end if;
    insert into public.active_timers(user_id,workspace_id,session_id,payload) values(p_actor,p_workspace,(next_timer->>'sessionId')::uuid,next_timer)
    on conflict(user_id) do update set workspace_id=excluded.workspace_id,session_id=excluded.session_id,payload=excluded.payload,updated_at=now();
  else
    delete from public.active_timers where user_id=p_actor and workspace_id=p_workspace;
  end if;
  -- Rewrite editable projections in one transaction; deferred composite FKs validate the final graph.
  delete from public.planned_sessions where workspace_id=p_workspace;
  delete from public.subtasks where workspace_id=p_workspace;
  delete from public.tasks where workspace_id=p_workspace;
  delete from public.projects where workspace_id=p_workspace;
  delete from public.subjects where workspace_id=p_workspace;
  for item in select * from jsonb_array_elements(p_data->'subjects') loop
    insert into public.subjects(workspace_id,id,name,archived,payload) values(p_workspace,(item->>'id')::uuid,item->>'name',(item->>'archived')::boolean,item);
  end loop;
  for item in select * from jsonb_array_elements(p_data->'projects') loop
    insert into public.projects(workspace_id,id,subject_id,payload) values(p_workspace,(item->>'id')::uuid,(item->>'subjectId')::uuid,item);
  end loop;
  for item in select * from jsonb_array_elements(p_data->'tasks') loop
    if item->>'assigneeId' is not null and not (ent->'features'->>'teamWorkspaces')::boolean and exists(select 1 from public.workspaces where id=p_workspace and kind='organization') and not exists(select 1 from jsonb_array_elements(old_data->'tasks') old_task where old_task->>'id'=item->>'id' and old_task->>'assigneeId'=item->>'assigneeId') then raise exception 'New shared task assignments require an active Team plan.' using errcode='42501'; end if;
    if item->>'assigneeId' is not null and not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=(item->>'assigneeId')::uuid) and not exists(select 1 from jsonb_array_elements(old_data->'tasks') old_task where old_task->>'id'=item->>'id' and old_task->>'assigneeId'=item->>'assigneeId') then raise exception 'Task assignees must be workspace members.' using errcode='23514'; end if;
    insert into public.tasks(workspace_id,id,subject_id,project_id,assignee_id,payload) values(p_workspace,(item->>'id')::uuid,(item->>'subjectId')::uuid,(item->>'projectId')::uuid,(item->>'assigneeId')::uuid,item);
    for child in select * from jsonb_array_elements(item->'checklist') loop
      insert into public.subtasks(workspace_id,id,task_id,payload) values(p_workspace,(child->>'id')::uuid,(item->>'id')::uuid,child);
    end loop;
  end loop;
  for item in select * from jsonb_array_elements(p_data->'plannedSessions') loop
    insert into public.planned_sessions(workspace_id,id,user_id,subject_id,project_id,task_id,starts_at,ends_at,payload)
    values(p_workspace,(item->>'id')::uuid,(item->>'userId')::uuid,(item->>'subjectId')::uuid,(item->>'projectId')::uuid,(item->>'taskId')::uuid,(item->>'startsAt')::timestamptz,(item->>'startsAt')::timestamptz+make_interval(mins=>(item->>'durationMinutes')::int),item);
  end loop;
  for item in select * from jsonb_array_elements(p_data->'focusSessions') loop
    select payload into old_payload from public.focus_sessions where id=(item->>'id')::uuid;
    if found then
      if old_payload <> item then raise exception 'Session identity already exists.' using errcode='23505'; end if;
    else
      if (item->>'userId')::uuid <> p_actor then raise exception 'You can only record your own focus sessions.' using errcode='42501'; end if;
      if old_timer.session_id=(item->>'id')::uuid and (old_timer.payload->'context' <> item->'context' or (old_timer.payload->>'durationMs')::numeric <> (item->>'durationMinutes')::numeric*60000 or old_timer.payload->>'startedAt' <> item->>'startedAt' or old_timer.payload->>'phase' <> item->>'phase') then raise exception 'A completed session must retain its original timer context.' using errcode='23514'; end if;
      if item->>'workspaceId' <> p_workspace::text or item->'context'->>'workspaceId' <> p_workspace::text or item->'context'->>'userId' <> p_actor::text then raise exception 'Session context belongs to a different workspace or actor.' using errcode='23514'; end if;
      insert into public.focus_sessions(id,workspace_id,user_id,phase,status,started_at,ended_at,duration_minutes,actual_seconds,payload)
      values((item->>'id')::uuid,p_workspace,p_actor,item->>'phase',item->>'status',(item->>'startedAt')::timestamptz,(item->>'endedAt')::timestamptz,(item->>'durationMinutes')::numeric,(item->>'actualSeconds')::numeric,item);
    end if;
  end loop;
  for item in select * from jsonb_array_elements(p_data->'events') loop
    select payload into old_payload from public.activity_events where id=(item->>'id')::uuid;
    if found then
      if old_payload <> item then raise exception 'Activity identity already exists.' using errcode='23505'; end if;
    else
      if (item->>'userId')::uuid <> p_actor then raise exception 'You can only record activity as yourself.' using errcode='42501'; end if;
      insert into public.activity_events(id,workspace_id,user_id,occurred_at,type,payload) values((item->>'id')::uuid,p_workspace,p_actor,(item->>'timestamp')::timestamptz,item->>'type',item);
    end if;
  end loop;
  delete from public.development_notes where workspace_id=p_workspace;
  for item in select * from jsonb_array_elements(p_data->'journal') loop
    insert into public.development_notes(workspace_id,id,task_id,user_id,payload) values(p_workspace,(item->>'id')::uuid,(item->>'taskId')::uuid,(item->>'userId')::uuid,item);
  end loop;
  insert into public.preferences(user_id,workspace_id,data,timer_state) values(p_actor,p_workspace,p_data->'preferences',next_timer)
    on conflict(user_id,workspace_id) do update set data=excluded.data,timer_state=excluded.timer_state,updated_at=now();
  -- Timers are private and restored from active_timers. Shared JSON holds only an idle placeholder.
  normalized := jsonb_set(p_data,'{timer}',jsonb_build_object('phase','focus','status','idle','sessionId',null,'startedAt',null,'endAt',null,'durationMs',1500000,'remainingMs',1500000,'cycleCount',0,'context',null));
  normalized := jsonb_set(normalized,'{revision}',to_jsonb(version_now+1));
  -- Personal preferences never enter the shared document; API reads overlay the private row.
  normalized := normalized - 'preferences';
  update public.workspace_documents set data=normalized,version=version_now+1,updated_by=p_actor,updated_at=now() where workspace_id=p_workspace;
  insert into public.sync_operations(workspace_id,operation_id,actor_id,payload_hash,version) values(p_workspace,p_operation,p_actor,payload_hash,version_now+1);
  return jsonb_build_object('version',version_now+1);
end $$;
revoke all on function public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.folia_commit_document(uuid,uuid,jsonb,bigint,uuid) to service_role;
