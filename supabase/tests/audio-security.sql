\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAILED: %',message; end if;
  raise notice 'PASS: %',message;
end $$;
select set_config('request.jwt.claim.role','service_role',true);
insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','audio@example.test',now());
select set_config('test.audio',public.folia_onboard('11111111-1111-4111-8111-111111111111')::text,true);

do $$ declare wid uuid:=current_setting('test.audio')::uuid; begin
  perform pg_temp.assert_true(not (public.workspace_entitlements(wid)->'features'->>'music')::boolean,'Free workspace has no Pro audio entitlement');
  insert into public.workspace_subscriptions(workspace_id,tier,paid_tier,status,paid_through) values(wid,'pro','pro','active',now()+interval '30 days');
  perform pg_temp.assert_true((public.workspace_entitlements(wid)->'features'->>'music')::boolean,'Trusted active Pro grants audio');
  update public.workspace_subscriptions set tier='free',status='canceled' where workspace_id=wid;
  perform pg_temp.assert_true((public.workspace_entitlements(wid)->'features'->>'music')::boolean,'Cancellation retains audio for the already paid period');
  update public.workspace_subscriptions set paid_through=now()-interval '1 day' where workspace_id=wid;
  perform pg_temp.assert_true(not (public.workspace_entitlements(wid)->'features'->>'music')::boolean,'Expired paid period removes audio access');
  insert into public.audio_tracks(title,attribution,duration_seconds,category,storage_path) values('Test track','Licensed fixture',90,'ambient','fixtures/track.mp3');
  perform pg_temp.assert_true((select active=false from public.audio_tracks where storage_path='fixtures/track.mp3'),'New audio assets are inactive by default');
  begin
    insert into public.audio_tracks(title,attribution,duration_seconds,category,storage_path) values('Traversal','Fixture',90,'ambient','../private.mp3');
    raise exception 'Traversal path accepted';
  exception when check_violation then raise notice 'PASS: Audio path traversal rejected'; end;
end $$;

set local role authenticated;
do $$ begin
  begin perform id from public.audio_tracks; raise exception 'Client read private audio catalog directly';
  exception when insufficient_privilege then raise notice 'PASS: Audio catalog requires the authorized server endpoint'; end;
end $$;
reset role;
rollback;
