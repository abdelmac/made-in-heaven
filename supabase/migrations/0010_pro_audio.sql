-- Keep the trusted paid-period calculation and add audio to paid capabilities.
create or replace function public.workspace_entitlements(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ent jsonb; paid boolean;
begin
  ent := private.workspace_entitlements_v1(p_workspace_id);
  paid := ent->>'tier'<>'free';
  return jsonb_set(ent,'{features}',ent->'features'||jsonb_build_object(
    'backgrounds',paid,'flashcards',paid,'music',paid
  ));
end $$;
revoke all on function public.workspace_entitlements(uuid) from public,anon;
grant execute on function public.workspace_entitlements(uuid) to authenticated,service_role;

create table public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title) between 1 and 120),
  attribution text not null check(length(attribution) between 1 and 500),
  duration_seconds integer not null check(duration_seconds between 1 and 14400),
  category text not null check(category in ('ambient','instrumental')),
  storage_path text not null unique check(length(storage_path) between 1 and 300 and storage_path !~ '(^/|(^|/)\.\.(/|$)|://)'),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.audio_tracks enable row level security;
revoke all on public.audio_tracks from public,anon,authenticated;
grant all on public.audio_tracks to service_role;

-- The SQL-only integration harness has no Storage service. Hosted Supabase does.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('pro-audio','pro-audio',false,52428800,array['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav'])
    on conflict(id) do update set public=false;
    -- Restrictive policies prevent a broad existing client policy granting access.
    execute 'create policy pro_audio_server_only on storage.objects as restrictive for all to anon,authenticated using (bucket_id <> ''pro-audio'') with check (bucket_id <> ''pro-audio'')';
  end if;
end $$;
