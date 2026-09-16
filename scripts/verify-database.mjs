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
