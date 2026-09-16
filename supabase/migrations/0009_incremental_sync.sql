-- Compact network writes keep the existing atomic document/permission transaction.
create table private.sync_patch_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_id uuid not null,
  actor_id uuid not null,
  payload_hash text not null,
  version bigint not null,
  primary key(workspace_id, operation_id)
);
revoke all on private.sync_patch_receipts from public, anon, authenticated, service_role;

create function public.folia_commit_patch(p_actor uuid, p_workspace uuid, p_patch jsonb, p_expected_version bigint, p_operation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  original private.sync_patch_receipts%rowtype;
  patch_hash text;
  current_version bigint;
  document jsonb;
  collection text;
  change jsonb;
  values_now jsonb;
  addition jsonb;
  result jsonb;
begin
  -- Same lock ordering as folia_commit_document, including cross-workspace timers.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,1));
  perform 1 from public.workspaces where id=p_workspace for update;
  if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=p_actor and role in ('owner','admin','member')) then
    raise exception 'Votre rôle ne permet pas de modifier cet espace.' using errcode='42501';
  end if;
  select data, version into document, current_version from public.workspace_documents where workspace_id=p_workspace for update;
  patch_hash:=encode(extensions.digest(jsonb_build_object('patch',p_patch,'expectedVersion',p_expected_version)::text,'sha256'),'hex');
  select * into original from private.sync_patch_receipts where workspace_id=p_workspace and operation_id=p_operation;
  if found then
    if original.actor_id<>p_actor or original.payload_hash<>patch_hash then
      raise exception 'Un identifiant de synchronisation ne peut pas être réutilisé pour une autre modification.' using errcode='23505';
    end if;
    return jsonb_build_object('version',current_version,'committedVersion',original.version,'replayed',true);
  end if;
  if current_version<>p_expected_version then return jsonb_build_object('conflict',true,'version',current_version); end if;
  if p_patch->'metadata'->>'workspaceId' is distinct from p_workspace::text then
    raise exception 'Le document appartient à un autre espace.' using errcode='22023';
  end if;
  document:=coalesce(document,'{}'::jsonb)||(p_patch->'metadata');
  foreach collection in array array['subjects','projects','tasks','plannedSessions','focusSessions','journal','noteSheets','flashcardDecks','flashcards','events'] loop
    if not document ? collection then document:=jsonb_set(document,array[collection],'[]'::jsonb); end if;
    change:=p_patch->'collections'->collection;
    if change is null then continue; end if;
    if exists(select 1 from jsonb_array_elements(change->'replace') item group by item->>'id' having count(*)>1)
       or exists(select 1 from jsonb_array_elements(change->'insert') item group by item->'value'->>'id' having count(*)>1)
       or exists(select 1 from jsonb_array_elements(change->'insert') item group by item->>'at' having count(*)>1)
       or exists(select 1 from jsonb_array_elements(change->'insert') item where (item->>'at')::numeric not between 0 and 500000) then
      raise exception 'La modification contient des identifiants ou positions invalides.' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(coalesce(replacement.item,old.item) order by old.position),'[]'::jsonb) into values_now
      from jsonb_array_elements(document->collection) with ordinality old(item,position)
      left join lateral (select value item from jsonb_array_elements(change->'replace') where value->>'id'=old.item->>'id' limit 1) replacement on true
      where not (change->'remove' ? (old.item->>'id'));
    for addition in select value from jsonb_array_elements(change->'insert') order by (value->>'at')::int loop
      values_now:=jsonb_insert(values_now,array[addition->>'at'],addition->'value');
    end loop;
    if change ? 'order' then
      select coalesce(jsonb_agg(item.value order by ordered.position),'[]'::jsonb) into values_now
        from jsonb_array_elements_text(change->'order') with ordinality ordered(id,position)
        join jsonb_array_elements(values_now) item(value) on item.value->>'id'=ordered.id;
    end if;
    document:=jsonb_set(document,array[collection],values_now);
  end loop;
  result:=public.folia_commit_document(p_actor,p_workspace,document,p_expected_version,p_operation);
  if coalesce((result->>'conflict')::boolean,false) then return result; end if;
  insert into private.sync_patch_receipts(workspace_id,operation_id,actor_id,payload_hash,version)
    values(p_workspace,p_operation,p_actor,patch_hash,(result->>'version')::bigint);
  return result||jsonb_build_object('committedVersion',(result->>'version')::bigint);
end $$;
revoke all on function public.folia_commit_patch(uuid,uuid,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.folia_commit_patch(uuid,uuid,jsonb,bigint,uuid) to service_role;
