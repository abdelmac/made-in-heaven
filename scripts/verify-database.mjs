import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The isolated dependency is deliberately outside the application dependency tree.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, '.local/sql-harness/package.json'));
let PGlite, btree_gist, pgcrypto;
try {
  ({ PGlite } = require('@electric-sql/pglite'));
  ({ btree_gist } = require('@electric-sql/pglite/contrib/btree_gist'));
  ({ pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto'));
} catch {
  console.error('Install the isolated SQL runner first:');
  console.error(
    'npm install --prefix .local/sql-harness --ignore-scripts --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8',
  );
  process.exit(1);
}

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
let current = 'initialization';
let assertions = 0;
let suites = 0;
let migrations = 0;
const onNotice = (notice) => {
  if (notice.message?.startsWith('PASS:')) assertions++;
};
const readSql = async (path) =>
  (await readFile(resolve(root, path), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => !/^\\(?:set|i)\b/.test(line))
    .join('\n');

try {
  console.log((await db.query('select version()')).rows[0].version);
  current = 'supabase/tests/bootstrap.sql';
  // Only psql client directives are omitted. Every SQL statement is unchanged.
  await db.exec(await readSql(current), { onNotice });
  for (const name of (await readdir(resolve(root, 'supabase/migrations')))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    current = `supabase/migrations/${name}`;
    if (name === '0011_billing_environment.sql') {
      // Exercise the upgrade against pre-migration billing rows, then roll the
      // entire fixture/migration back so all ordinary suites start empty.
      await db.exec(`
        begin;
        select set_config('request.jwt.claim.role','service_role',true);
        insert into auth.users(id,email,email_confirmed_at) values
          ('abababab-abab-4bab-8bab-abababababab','legacy-billing@example.test',now());
        select set_config('test.legacy_billing_workspace',public.folia_onboard('abababab-abab-4bab-8bab-abababababab')::text,true);
        insert into public.workspace_subscriptions(workspace_id,stripe_customer_id,stripe_subscription_id,tier,paid_tier,status,paid_through,deletion_pending)
          values(current_setting('test.legacy_billing_workspace')::uuid,'cus_legacy','sub_legacy','pro','pro','active',now()+interval '1 month',true);
        insert into public.billing_events(event_id,event_type,status,processed_at)
          values('evt_legacy_upgrade','invoice.paid','processed',now());
      `);
      await db.exec(await readSql(current), { onNotice });
      const { rows } = await db.query(`select
        (select mode='test' and stripe_account_id is null from public.billing_environment where id=true)
        and (select billing_mode='test' and stripe_customer_id='cus_legacy' and stripe_subscription_id='sub_legacy' and deletion_pending
          from public.workspace_subscriptions where workspace_id=current_setting('test.legacy_billing_workspace')::uuid)
        and (select billing_mode='test' and status='processed' and processed_at is not null
          from public.billing_events where event_id='evt_legacy_upgrade')
        and public.workspace_entitlements(current_setting('test.legacy_billing_workspace')::uuid)->>'tier'='pro'
        and (public.workspace_entitlements(current_setting('test.legacy_billing_workspace')::uuid)->'features')
          @> '{"backgrounds":true,"flashcards":true,"music":true}'::jsonb
        as preserved`);
      if (rows[0]?.preserved !== true) {
        throw new Error(
          'Billing migration changed legacy test subscriptions, receipts or paid capabilities.',
        );
      }
      assertions++;
      console.log('PASS legacy billing upgrade preserves test coverage and durable receipts');
      await db.exec('rollback;');
    }
    await db.exec(await readSql(current), { onNotice });
    migrations++;
    console.log(`PASS migration ${name}`);
  }
  for (const name of (await readdir(resolve(root, 'supabase/tests')))
    .filter((name) => name.endsWith('.sql') && name !== 'bootstrap.sql')
    .sort()) {
    current = `supabase/tests/${name}`;
    const before = assertions;
    await db.exec(await readSql(current), { onNotice });
    suites++;
    console.log(`PASS suite ${name}: ${assertions - before} assertions`);
  }
  console.log(`PASS ${migrations} migrations, ${suites} suites, ${assertions} SQL assertions.`);
  console.log(
    'In-memory PostgreSQL only: hosted Supabase Auth, Storage, mail, Stripe and concurrent connections are not exercised.',
  );
} catch (error) {
  console.error(`FAIL ${current}: ${error.code || ''} ${error.message}`);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
