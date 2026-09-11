-- Folia: tenant-isolated storage. Application mutations use service-only transactions.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 100),
  created_at timestamptz not null default now()
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  kind text not null check (kind in ('personal', 'organization')),
  created_by uuid references auth.users(id) on delete cascade,
  icon text not null default 'leaf',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index one_personal_workspace on public.workspaces(created_by) where kind = 'personal';
create table public.workspace_memberships (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create index memberships_user on public.workspace_memberships(user_id);
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member','viewer')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_workspace on public.workspace_invitations(workspace_id);
create table public.workspace_documents (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  data jsonb,
  version bigint not null default 0 check (version >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.sync_operations (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  operation_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  payload_hash text not null,
  version bigint not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,operation_id)
);
create table public.subjects (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  id uuid not null, name text not null, archived boolean not null default false,
  payload jsonb not null, primary key(workspace_id,id)
);
create table public.projects (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  id uuid not null, subject_id uuid, payload jsonb not null,
  primary key(workspace_id,id),
  foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id) deferrable initially deferred
);
create table public.tasks (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  id uuid not null, subject_id uuid, project_id uuid, assignee_id uuid,
  payload jsonb not null, primary key(workspace_id,id),
  foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id) deferrable initially deferred,
  foreign key(workspace_id,project_id) references public.projects(workspace_id,id) deferrable initially deferred
);
create table public.subtasks (
  workspace_id uuid not null, id uuid not null, task_id uuid not null,
  payload jsonb not null, primary key(workspace_id,id),
  foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete cascade
);
create table public.planned_sessions (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid, project_id uuid, task_id uuid,
  starts_at timestamptz not null, ends_at timestamptz not null,
  payload jsonb not null, primary key(workspace_id,id),
  check(ends_at > starts_at),
  foreign key(workspace_id,subject_id) references public.subjects(workspace_id,id) deferrable initially deferred,
  foreign key(workspace_id,project_id) references public.projects(workspace_id,id) deferrable initially deferred,
  foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) deferrable initially deferred,
  exclude using gist (user_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
);
create index planned_workspace_time on public.planned_sessions(workspace_id,starts_at);
-- Snapshots deliberately have no current subject/task FK: deleting a task cannot erase history.
create table public.focus_sessions (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid, phase text not null check(phase in ('focus','shortBreak','longBreak')),
  status text not null check(status in ('completed','interrupted','skipped')),
  started_at timestamptz not null, ended_at timestamptz not null,
  duration_minutes numeric not null check(duration_minutes between 0 and 1440),
  actual_seconds numeric not null check(actual_seconds between 0 and 86400),
  payload jsonb not null,
  check(ended_at >= started_at),
  check(status <> 'completed' or actual_seconds >= duration_minutes * 60),
  exclude using gist (user_id with =, tstzrange(started_at,ended_at,'[)') with &&) where (phase='focus' and status='completed')
);
create index focus_workspace_time on public.focus_sessions(workspace_id,ended_at);
create table public.development_notes (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  id uuid not null, task_id uuid not null, user_id uuid not null,
  payload jsonb not null, primary key(workspace_id,id)
);
create table public.activity_events (
  id uuid primary key, workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid, occurred_at timestamptz not null, type text not null, payload jsonb not null
);
create index events_workspace_time on public.activity_events(workspace_id,occurred_at);
create table public.preferences (
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  data jsonb not null, timer_state jsonb, updated_at timestamptz not null default now(),
  primary key(user_id,workspace_id)
);
create table public.active_timers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null unique,
  payload jsonb not null, updated_at timestamptz not null default now()
);
create table public.workspace_audit (
  id uuid primary key default gen_random_uuid(), workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid, action text not null, target_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.api_rate_limits (
  user_id uuid not null, scope text not null, window_start timestamptz not null, count integer not null,
  primary key(user_id,scope)
);

create function private.workspace_role(p_workspace uuid) returns text language sql stable security definer set search_path = '' as $$
  select role from public.workspace_memberships where workspace_id=p_workspace and user_id=(select auth.uid());
$$;
grant usage on schema private to authenticated;
grant execute on function private.workspace_role(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','workspaces','workspace_memberships','workspace_invitations','workspace_documents','sync_operations','subjects','projects','tasks','subtasks','planned_sessions','focus_sessions','development_notes','activity_events','preferences','active_timers','workspace_audit','api_rate_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  foreach t in array array['workspace_documents','subjects','projects','tasks','subtasks','planned_sessions','focus_sessions','development_notes','activity_events'] loop
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.workspace_role(workspace_id) is not null)',t);
  end loop;
end $$;
grant select on public.profiles,public.workspaces,public.workspace_memberships,public.workspace_invitations,public.preferences,public.active_timers,public.workspace_audit to authenticated;
create policy profile_self on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy workspaces_member on public.workspaces for select to authenticated using(private.workspace_role(id) is not null);
create policy memberships_member on public.workspace_memberships for select to authenticated using(private.workspace_role(workspace_id) is not null);
create policy invitations_manager on public.workspace_invitations for select to authenticated using(private.workspace_role(workspace_id) in ('owner','admin'));
create policy preferences_self on public.preferences for select to authenticated using(user_id=(select auth.uid()) and private.workspace_role(workspace_id) is not null);
create policy active_timers_self on public.active_timers for select to authenticated using(user_id=(select auth.uid()));
create policy audit_manager on public.workspace_audit for select to authenticated using(private.workspace_role(workspace_id) in ('owner','admin'));

create function public.folia_onboard(p_user uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  insert into public.profiles(id) values(p_user) on conflict do nothing;
  select id into wid from public.workspaces where created_by=p_user and kind='personal';
  if wid is null then
    insert into public.workspaces(name,kind,created_by) values('My workspace','personal',p_user) returning id into wid;
    insert into public.workspace_memberships(workspace_id,user_id,role) values(wid,p_user,'owner');
    insert into public.workspace_documents(workspace_id) values(wid);
  end if;
  return wid;
end $$;
create function public.folia_rate_limit(p_user uuid,p_scope text,p_limit int,p_seconds int) returns boolean language plpgsql security definer set search_path = '' as $$
declare hits int;
begin
  if p_limit < 1 or p_seconds < 1 then return false; end if;
  insert into public.api_rate_limits(user_id,scope,window_start,count) values(p_user,p_scope,now(),1)
  on conflict(user_id,scope) do update set
    count=case when public.api_rate_limits.window_start < now()-make_interval(secs=>p_seconds) then 1 else public.api_rate_limits.count+1 end,
    window_start=case when public.api_rate_limits.window_start < now()-make_interval(secs=>p_seconds) then now() else public.api_rate_limits.window_start end
  returning count into hits;
  return hits <= p_limit;
end $$;
revoke all on function public.folia_onboard(uuid),public.folia_rate_limit(uuid,text,int,int) from public,anon,authenticated;
grant execute on function public.folia_onboard(uuid),public.folia_rate_limit(uuid,text,int,int) to service_role;
