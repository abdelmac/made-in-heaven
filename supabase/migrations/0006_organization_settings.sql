-- Organization defaults are narrow, server-owned values. They never overwrite
-- existing member preferences or include appearance/accessibility policy.
create function public.folia_set_organization_settings(p_actor uuid,p_workspace uuid,p_icon text,p_defaults jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_role text; ent jsonb; item record;
begin
  perform 1 from public.workspaces where id=p_workspace and kind='organization' for update;
  if not found then raise exception 'Choose an organization workspace.' using errcode='22023'; end if;
  select role into actor_role from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor;
  if actor_role is null or actor_role not in ('owner','admin') then raise exception 'Only owners and admins can set organization defaults.' using errcode='42501'; end if;
  ent := public.workspace_entitlements(p_workspace);
  if not (ent->'features'->>'teamWorkspaces')::boolean then raise exception 'Organization defaults require an active Team plan.' using errcode='42501'; end if;
  if p_icon not in ('leaf','sprout','book','code','sparkles') then raise exception 'Choose a supported workspace icon.' using errcode='22023'; end if;
  if p_defaults is null or jsonb_typeof(p_defaults)<>'object' or (select count(*) from jsonb_object_keys(p_defaults))<>7 then raise exception 'Provide the complete organization defaults.' using errcode='22023'; end if;
  for item in select * from jsonb_each(p_defaults) loop
    if item.key not in ('focusMinutes','shortBreakMinutes','longBreakMinutes','cycleLength','visibleStartHour','visibleEndHour','weekStartsOn') or jsonb_typeof(item.value)<>'number' or item.value::text !~ '^[0-9]+$' then raise exception 'Only supported timer and calendar defaults may be shared.' using errcode='22023'; end if;
  end loop;
  if (p_defaults->>'focusMinutes')::int not between 1 and 180 or (p_defaults->>'shortBreakMinutes')::int not between 1 and 60 or (p_defaults->>'longBreakMinutes')::int not between 1 and 120 or (p_defaults->>'cycleLength')::int not between 1 and 12 or (p_defaults->>'visibleStartHour')::int not between 0 and 23 or (p_defaults->>'visibleEndHour')::int not between 1 and 24 or (p_defaults->>'weekStartsOn')::int not in (0,1) or (p_defaults->>'visibleEndHour')::int <= (p_defaults->>'visibleStartHour')::int then raise exception 'Organization defaults are outside the supported range.' using errcode='22023'; end if;
  update public.workspaces set icon=p_icon,settings=jsonb_set(settings,'{defaultPreferences}',p_defaults) where id=p_workspace;
  insert into public.workspace_audit(workspace_id,actor_id,action,details) values(p_workspace,p_actor,'organization_settings_updated',jsonb_build_object('icon',p_icon,'defaultPreferences',p_defaults));
  return jsonb_build_object('workspaceId',p_workspace,'icon',p_icon,'defaults',p_defaults);
end $$;

create function public.folia_initialize_preferences(p_actor uuid,p_workspace uuid,p_base jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing jsonb; workspace_settings jsonb; personal jsonb; overrides jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor) then raise exception 'Workspace access denied.' using errcode='42501'; end if;
  select data into existing from public.preferences where user_id=p_actor and workspace_id=p_workspace;
  if found then return existing; end if;
  select settings into workspace_settings from public.workspaces where id=p_workspace and kind='organization';
  select p.data into personal from public.preferences p join public.workspaces w on w.id=p.workspace_id where p.user_id=p_actor and w.kind='personal';
  -- Carry existing personal accessibility and calendar choices into a new scope;
  -- custom paid themes/layouts remain entitled within their original workspace.
  select jsonb_object_agg(key,value) into overrides from jsonb_each(coalesce(personal,'{}'::jsonb)) where key in ('appearance','accent','density','fontSize','radius','motion','timeZone','timeFormat','dateFormat','sound','notifications','heatmapMode');
  existing := p_base || coalesce(overrides,'{}'::jsonb) || coalesce(workspace_settings->'defaultPreferences','{}'::jsonb);
  insert into public.preferences(user_id,workspace_id,data) values(p_actor,p_workspace,existing) on conflict(user_id,workspace_id) do nothing;
  select data into existing from public.preferences where user_id=p_actor and workspace_id=p_workspace;
  return existing;
end $$;
revoke all on function public.folia_set_organization_settings(uuid,uuid,text,jsonb),public.folia_initialize_preferences(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.folia_set_organization_settings(uuid,uuid,text,jsonb),public.folia_initialize_preferences(uuid,uuid,jsonb) to service_role;
