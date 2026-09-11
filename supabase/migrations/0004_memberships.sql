create function public.folia_manage_workspace(p_actor uuid,p_action text,p_workspace uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_role text; target_role text; wid uuid; target uuid; invite public.workspace_invitations%rowtype; ent jsonb; max_members int; actor_email text; confirmed timestamptz;
begin
  if p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended(p_actor::text,2));
    if (select count(*) from public.workspaces where created_by=p_actor and kind='organization') >= 10 then raise exception 'You can own up to ten organizations.' using errcode='23514'; end if;
    insert into public.workspaces(name,kind,created_by) values(p_input->>'name','organization',p_actor) returning id into wid;
    insert into public.workspace_memberships(workspace_id,user_id,role) values(wid,p_actor,'owner');
    insert into public.workspace_documents(workspace_id) values(wid);
    insert into public.workspace_audit(workspace_id,actor_id,action) values(wid,p_actor,'organization_created');
    return jsonb_build_object('workspaceId',wid);
  end if;
  if p_action='acceptInvite' then
    select * into invite from public.workspace_invitations where token_hash=p_input->>'tokenHash';
    if not found then raise exception 'This invitation is not valid.' using errcode='22023'; end if;
    p_workspace := invite.workspace_id;
  end if;
  perform 1 from public.workspaces where id=p_workspace for update;
  if not found then raise exception 'This workspace is not available.' using errcode='42501'; end if;
  select role into actor_role from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor;
  if p_action='acceptInvite' then
    select * into invite from public.workspace_invitations where id=invite.id for update;
    if invite.revoked_at is not null or invite.accepted_at is not null or invite.expires_at<=now() then raise exception 'This invitation has expired, was revoked, or has already been used.' using errcode='22023'; end if;
    select lower(email),email_confirmed_at into actor_email,confirmed from auth.users where id=p_actor;
    if confirmed is null or actor_email<>lower(invite.email) then raise exception 'Sign in with the verified email address invited to this workspace.' using errcode='42501'; end if;
    if actor_role is not null then raise exception 'You are already a member of this workspace.' using errcode='23505'; end if;
    ent := public.workspace_entitlements(p_workspace);
    max_members := (ent->'limits'->>'members')::int;
    if not (ent->'features'->>'teamWorkspaces')::boolean then raise exception 'This organization needs an active Team plan before accepting members.' using errcode='42501'; end if;
    if max_members is not null and (select count(*) from public.workspace_memberships where workspace_id=p_workspace)>=max_members then raise exception 'This organization has reached its member limit.' using errcode='23514'; end if;
    insert into public.workspace_memberships(workspace_id,user_id,role) values(p_workspace,p_actor,invite.role);
    update public.workspace_invitations set accepted_at=now() where id=invite.id;
    insert into public.workspace_audit(workspace_id,actor_id,action,target_id) values(p_workspace,p_actor,'invitation_accepted',invite.id);
    return jsonb_build_object('workspaceId',p_workspace);
  end if;
  if actor_role is null or actor_role not in ('owner','admin') then raise exception 'Only workspace owners and admins can manage members.' using errcode='42501'; end if;
  if p_action='rename' then
    update public.workspaces set name=p_input->>'name' where id=p_workspace;
  else
    if exists(select 1 from public.workspaces where id=p_workspace and kind='personal') then raise exception 'Personal workspaces are private and cannot have other members.' using errcode='42501'; end if;
    if p_action='invite' then
      ent := public.workspace_entitlements(p_workspace);
      if not (ent->'features'->>'teamWorkspaces')::boolean then raise exception 'Invitations require an active Team plan.' using errcode='42501'; end if;
      if p_input->>'role' not in ('admin','member','viewer') then raise exception 'Choose admin, member, or viewer.' using errcode='22023'; end if;
      if actor_role='admin' and p_input->>'role'='admin' then raise exception 'Only an owner can invite another admin.' using errcode='42501'; end if;
      if exists(select 1 from public.workspace_invitations where workspace_id=p_workspace and lower(email)=lower(p_input->>'email') and accepted_at is null and revoked_at is null and expires_at>now()) then raise exception 'A pending invitation already exists for this email.' using errcode='23505'; end if;
      insert into public.workspace_invitations(workspace_id,email,role,token_hash,invited_by,expires_at)
        values(p_workspace,lower(p_input->>'email'),p_input->>'role',p_input->>'tokenHash',p_actor,now()+interval '7 days') returning * into invite;
      insert into public.workspace_audit(workspace_id,actor_id,action,target_id) values(p_workspace,p_actor,'invitation_created',invite.id);
      return jsonb_build_object('invitation',jsonb_build_object('id',invite.id,'email',invite.email,'expires_at',invite.expires_at));
    elsif p_action='revokeInvite' then
      target := (p_input->>'invitationId')::uuid;
      select * into invite from public.workspace_invitations where id=target and workspace_id=p_workspace;
      if not found then raise exception 'Invitation not found.' using errcode='22023'; end if;
      if actor_role='admin' and invite.role='admin' then raise exception 'Only an owner can revoke an admin invitation.' using errcode='42501'; end if;
      update public.workspace_invitations set revoked_at=now() where id=target and accepted_at is null;
    elsif p_action in ('setRole','removeMember','transferOwnership') then
      target := (p_input->>'memberId')::uuid;
      select role into target_role from public.workspace_memberships where workspace_id=p_workspace and user_id=target;
      if target_role is null then raise exception 'This member was not found.' using errcode='22023'; end if;
      if p_action='transferOwnership' then
        if actor_role<>'owner' or target=p_actor or p_input->>'confirmation'<>'TRANSFER' then raise exception 'An owner must deliberately confirm this ownership transfer.' using errcode='42501'; end if;
        update public.workspace_memberships set role='admin' where workspace_id=p_workspace and user_id=p_actor;
        update public.workspace_memberships set role='owner' where workspace_id=p_workspace and user_id=target;
        -- Creator owns the lifecycle FK; transfer it with ownership so deleting the old owner cannot erase the organization.
        update public.workspaces set created_by=target where id=p_workspace;
      else
        if target_role='owner' then raise exception 'Transfer ownership before removing or changing an owner.' using errcode='42501'; end if;
        if actor_role='admin' and (target_role='admin' or p_input->>'role'='admin') then raise exception 'Only owners can manage admins.' using errcode='42501'; end if;
        if p_action='setRole' then
          if p_input->>'role' not in ('admin','member','viewer') then raise exception 'Ownership changes require an explicit transfer.' using errcode='22023'; end if;
          update public.workspace_memberships set role=p_input->>'role' where workspace_id=p_workspace and user_id=target;
        else
          delete from public.workspace_memberships where workspace_id=p_workspace and user_id=target;
          delete from public.active_timers where workspace_id=p_workspace and user_id=target;
          delete from public.preferences where workspace_id=p_workspace and user_id=target;
        end if;
      end if;
    else raise exception 'Unknown workspace operation.' using errcode='22023';
    end if;
  end if;
  insert into public.workspace_audit(workspace_id,actor_id,action,target_id) values(p_workspace,p_actor,p_action,target);
  return jsonb_build_object('workspaceId',p_workspace,'ok',true);
end $$;
revoke all on function public.folia_manage_workspace(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.folia_manage_workspace(uuid,text,uuid,jsonb) to service_role;
