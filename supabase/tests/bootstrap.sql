\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema extensions;
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
grant usage on schema public,auth,extensions to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
\i /workspace/migrations/0001_workspace.sql
\i /workspace/migrations/0002_billing.sql
\i /workspace/migrations/0003_sync.sql
\i /workspace/migrations/0004_memberships.sql
\i /workspace/migrations/0005_account_safety.sql
\i /workspace/migrations/0006_organization_settings.sql
\i /workspace/migrations/0007_private_preferences.sql
\i /workspace/migrations/0008_learning_and_backgrounds.sql
\i /workspace/migrations/0009_incremental_sync.sql
\i /workspace/migrations/0010_pro_audio.sql
\i /workspace/migrations/0011_billing_environment.sql
