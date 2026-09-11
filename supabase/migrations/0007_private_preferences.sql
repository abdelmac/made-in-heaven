-- Any current member may change their own private preferences, including viewers.
-- This operation accepts no productivity content or client timer state.
create function public.folia_save_preferences(p_actor uuid,p_workspace uuid,p_preferences jsonb,p_expected_version bigint,p_operation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare version_now bigint; prior jsonb; ent jsonb; original public.sync_operations%rowtype; payload_hash text; phase_name text; duration_ms bigint;
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor) then raise exception 'You do not have access to this workspace.' using errcode='42501'; end if;
  select version into version_now from public.workspace_documents where workspace_id=p_workspace for update;
  payload_hash := encode(extensions.digest(jsonb_build_object('preferences',p_preferences)::text,'sha256'),'hex');
  select * into original from public.sync_operations where workspace_id=p_workspace and operation_id=p_operation;
  if found then
    if original.actor_id<>p_actor or original.payload_hash<>payload_hash then raise exception 'An operation ID cannot be reused for different changes.' using errcode='23505'; end if;
    return jsonb_build_object('version',version_now,'committedVersion',original.version,'replayed',true);
  end if;
  if version_now<>p_expected_version then return jsonb_build_object('conflict',true,'version',version_now); end if;
  select data into prior from public.preferences where user_id=p_actor and workspace_id=p_workspace;
  ent := public.workspace_entitlements(p_workspace);
  if not (ent->'features'->>'customThemes')::boolean and p_preferences->'customTheme'<>'null'::jsonb and p_preferences->'customTheme' is distinct from prior->'customTheme' then raise exception 'Saving a new custom theme requires a paid plan for this workspace.' using errcode='42501'; end if;
  if not (ent->'features'->>'savedLayouts')::boolean and exists(select 1 from jsonb_array_elements(p_preferences->'savedLayouts') layout where not exists(select 1 from jsonb_array_elements(coalesce(prior->'savedLayouts','[]'::jsonb)) saved where saved=layout)) then raise exception 'Saving layouts requires a paid plan for this workspace.' using errcode='42501'; end if;
  insert into public.preferences(user_id,workspace_id,data) values(p_actor,p_workspace,p_preferences)
    on conflict(user_id,workspace_id) do update set data=excluded.data,updated_at=now();
  -- Recompute only prepared idle duration; a running/paused session remains frozen.
  select timer_state->>'phase' into phase_name from public.preferences where user_id=p_actor and workspace_id=p_workspace and timer_state->>'status'='idle';
  if phase_name is not null then
    duration_ms := (p_preferences->>(case phase_name when 'shortBreak' then 'shortBreakMinutes' when 'longBreak' then 'longBreakMinutes' else 'focusMinutes' end))::bigint*60000;
    update public.preferences set timer_state=jsonb_set(jsonb_set(timer_state,'{durationMs}',to_jsonb(duration_ms)),'{remainingMs}',to_jsonb(duration_ms)) where user_id=p_actor and workspace_id=p_workspace;
  end if;
  update public.workspace_documents set version=version_now+1,data=case when data is null then null else jsonb_set(data,'{revision}',to_jsonb(version_now+1)) end,updated_by=p_actor,updated_at=now() where workspace_id=p_workspace;
  insert into public.sync_operations(workspace_id,operation_id,actor_id,payload_hash,version) values(p_workspace,p_operation,p_actor,payload_hash,version_now+1);
  return jsonb_build_object('version',version_now+1,'committedVersion',version_now+1);
end $$;
revoke all on function public.folia_save_preferences(uuid,uuid,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.folia_save_preferences(uuid,uuid,jsonb,bigint,uuid) to service_role;
