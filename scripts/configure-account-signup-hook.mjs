import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI_VERSION = '2.122.0';
export const PROJECT_REF = 'zwgjauskorkpucuaqvgs';
export const FRONTEND_ORIGIN = 'https://www.solace-pomodoro.com';
export const HOOK_URI = 'pg-functions://postgres/public/folia_before_user_created';
export const EXPECTED_FRONTEND = Object.freeze({
  signupMetadataVersion: 1,
  termsVersion: '2026-10-28',
  privacyVersion: '2026-10-28',
  minimumOnlineAge: 16,
  projectRef: PROJECT_REF,
});
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, '.local', 'mobile-auth');
const ENABLED = 'auth.hook.before_user_created.enabled';
const URI = 'auth.hook.before_user_created.uri';
const ALLOWED = new Set([ENABLED, URI]);

export class SetupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new SetupError(code, message);
};
const pathKey = (value) =>
  Array.isArray(value) && value.every((part) => typeof part === 'string') ? value.join('.') : '';
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function hookConfig(enabled = true, uri = HOOK_URI) {
  if (typeof enabled !== 'boolean' || (uri !== HOOK_URI && uri !== `${HOOK_URI}_read_only_probe`))
    fail('CONFIG_SCOPE', 'Only the approved signup hook configuration can be generated.');
  return `project_id = "solace-signup-hook"\n\n[auth.hook.before_user_created]\nenabled = ${enabled}\nuri = "${uri}"\n`;
}

export function checkDiff(payload) {
  if (
    !Array.isArray(payload?.changes) ||
    !Array.isArray(payload?.masked) ||
    !Array.isArray(payload?.unmanaged)
  )
    fail('UNEXPECTED_DIFF', 'The CLI returned an unexpected diff structure.');
  if (payload.masked.length || payload.unmanaged.length)
    fail('UNEXPECTED_SETTING', 'The preview contains a secret or unmanaged declaration.');
  const changed = new Set();
  for (const change of payload.changes) {
    const key = pathKey(change.path);
    if (!key) fail('UNEXPECTED_DIFF', 'The CLI returned an invalid setting path.');
    if (change.class === 'remote_only' && change.declared === false) continue;
    if (
      !ALLOWED.has(key) ||
      change.declared !== true ||
      !['update', 'local_only'].includes(change.class) ||
      changed.has(key)
    )
      fail(
        'UNEXPECTED_CHANGE',
        'The preview declares a change outside the two approved signup-hook fields.',
      );
    if (Object.hasOwn(change, 'local') && change.local !== (key === ENABLED ? true : HOOK_URI))
      fail('UNEXPECTED_VALUE', 'The preview does not contain the approved signup-hook values.');
    changed.add(key);
  }
  return [...changed].sort();
}

/** Full CLI-visible protected Auth settings are compared in memory only. Secret
 * values remain masked; sparse config never declares or re-sends those fields. */
export function protectedSnapshot(payload) {
  if (!Array.isArray(payload?.changes) || !Array.isArray(payload?.masked))
    fail('UNEXPECTED_SNAPSHOT', 'The CLI returned an unexpected snapshot structure.');
  const values = new Map();
  for (const entry of payload.changes) {
    const key = pathKey(entry.path);
    if (!key.startsWith('auth.') || ALLOWED.has(key)) continue;
    if (
      entry.class !== 'remote_only' ||
      entry.declared !== false ||
      !Object.hasOwn(entry, 'remote') ||
      values.has(key)
    )
      fail('INVALID_SNAPSHOT', 'A protected Auth setting could not be compared safely.');
    values.set(key, canonical(entry.remote));
  }
  if (!values.has('auth.site_url'))
    fail(
      'INCOMPLETE_SNAPSHOT',
      'The CLI did not expose enough protected Auth settings for a safe comparison.',
    );
  return JSON.stringify({
    values: [...values].sort(([a], [b]) => a.localeCompare(b)),
    masked: canonical(payload.masked).sort(),
  });
}

function scalarRemote(payload, key, type) {
  if (!Array.isArray(payload?.changes))
    fail('INVALID_READBACK', 'The CLI returned an invalid readback.');
  const values = payload.changes.filter(
    (entry) => pathKey(entry.path) === key && typeof entry.remote === type,
  );
  if (values.length > 1)
    fail('AMBIGUOUS_READBACK', 'The CLI returned ambiguous hook verification values.');
  return values[0]?.remote;
}
function managedSnapshot(payload) {
  return JSON.stringify([
    scalarRemote(payload, ENABLED, 'boolean'),
    scalarRemote(payload, URI, 'string'),
  ]);
}

export function checkFrontendPayload(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== Object.keys(EXPECTED_FRONTEND).sort().join('|') ||
    Object.entries(EXPECTED_FRONTEND).some(([key, expected]) => value[key] !== expected)
  )
    fail(
      'FRONTEND_NOT_READY',
      'The deployed frontend does not match this signup hook, legal versions and Supabase project.',
    );
  return true;
}

export async function verifyFrontend(fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`${FRONTEND_ORIGIN}/api/account/signup-readiness`, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    if (
      !response.ok ||
      !(response.headers.get('content-type') ?? '').includes('application/json') ||
      !/\bno-store\b/i.test(response.headers.get('cache-control') ?? '')
    )
      throw new Error();
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    let bytes = 0;
    let body = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 8192) {
          await reader.cancel();
          throw new Error();
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return checkFrontendPayload(JSON.parse(body));
  } catch (error) {
    if (error instanceof SetupError) throw error;
    fail(
      'FRONTEND_NOT_READY',
      'The production signup-readiness endpoint is unavailable or invalid. Deploy and check the matching frontend first.',
    );
  }
}

/** command receives only fixed config names. This is exported for fully mocked
 * verification of write ordering; tests never call a hosted provider. */
export async function executeHookWorkflow({ mode, command, frontendCheck }) {
  let writeAttempted = false;
  try {
    const baseline = await command('diff', 'base');
    const before = protectedSnapshot(baseline);
    const managedBefore = managedSnapshot(baseline);
    const preview = await command('diff', 'desired');
    const declaredPaths = checkDiff(preview);
    const enabledBefore = scalarRemote(baseline, ENABLED, 'boolean');
    const uriBefore = scalarRemote(baseline, URI, 'string');
    let frontendReady = false;
    try {
      frontendReady = await frontendCheck();
    } catch (error) {
      if (mode !== 'preview') throw error;
    }
    if (mode !== 'preview' && frontendReady !== true)
      fail(
        'FRONTEND_NOT_READY',
        'The matching frontend must be deployed before applying or verifying the signup hook.',
      );
    const result = {
      mode,
      projectRef: PROJECT_REF,
      cliVersion: CLI_VERSION,
      hookUri: HOOK_URI,
      declaredPaths,
      frontendReady: frontendReady === true,
      writeAttempted: false,
      productionWrites: 0,
      verified: false,
      protectedAuthSnapshotUnchanged: false,
      rawAuthOutputPrinted: false,
      secretFieldsDeclared: 0,
    };
    if (mode === 'preview') {
      if (before !== protectedSnapshot(await command('diff', 'base')))
        fail(
          'PROTECTED_AUTH_CHANGED',
          'Protected Auth settings changed during preview. No write was attempted.',
        );
      return {
        ...result,
        protectedAuthSnapshotUnchanged: true,
        replacesActiveHook: enabledBefore === true && uriBefore !== HOOK_URI,
        next: frontendReady
          ? 'Review the two-field preview and run --apply when the deployed signup UI has been checked.'
          : 'Deploy and smoke-test the matching signup UI, then preview again.',
      };
    }
    if (mode === 'apply' && enabledBefore === true && uriBefore !== HOOK_URI)
      fail(
        'OTHER_ACTIVE_HOOK',
        'Another before-user-created hook is active. Review and compose its policy rather than replacing it automatically.',
      );
    if (mode === 'verify' && declaredPaths.length)
      fail(
        'HOOK_SETTINGS_DIFFER',
        'Hosted hook settings do not match the approved configuration. No write was attempted.',
      );
    if (mode === 'apply' && declaredPaths.length) {
      const immediatelyBefore = await command('diff', 'base');
      if (
        before !== protectedSnapshot(immediatelyBefore) ||
        managedBefore !== managedSnapshot(immediatelyBefore)
      )
        fail(
          'AUTH_CHANGED_BEFORE_WRITE',
          'Auth configuration changed after preview. No write was attempted; preview again.',
        );
      writeAttempted = true;
      const pushed = await command('push', 'desired');
      if (
        (Array.isArray(pushed.secrets?.sent) && pushed.secrets.sent.length) ||
        (Array.isArray(pushed.services) &&
          pushed.services.some((entry) => entry.status === 'updated' && entry.service !== 'auth'))
      )
        fail(
          'UNEXPECTED_WRITE_RESULT',
          'The CLI reported a write outside the approved Auth hook. Check the dashboard before retrying.',
        );
      if (
        !Array.isArray(pushed.services) ||
        !pushed.services.some((entry) => entry.service === 'auth' && entry.status === 'updated')
      )
        fail(
          'AUTH_NOT_CONFIRMED',
          'The CLI did not confirm an Auth update. Verify the hook before retrying.',
        );
    }
    if (checkDiff(await command('diff', 'desired')).length)
      fail(
        'HOOK_READBACK_FAILED',
        'The approved hook values were not confirmed after the operation. Run --verify before retrying.',
      );
    const [disabledProbe, uriProbe] = await Promise.all([
      command('diff', 'disabled'),
      command('diff', 'uriProbe'),
    ]);
    if (
      scalarRemote(disabledProbe, ENABLED, 'boolean') !== true ||
      scalarRemote(uriProbe, URI, 'string') !== HOOK_URI
    )
      fail(
        'HOOK_READBACK_FAILED',
        'Independent read-only probes did not confirm the enabled hook and exact function URI.',
      );
    if (before !== protectedSnapshot(await command('diff', 'base')))
      fail(
        'PROTECTED_AUTH_CHANGED',
        'Protected Auth settings changed. Review the dashboard before continuing; no automatic rollback was attempted.',
      );
    return {
      ...result,
      writeAttempted,
      productionWrites: writeAttempted ? 1 : 0,
      verified: true,
      hookEnabled: true,
      protectedAuthSnapshotUnchanged: true,
      signupDeliveryVerified: false,
      next: 'Verify accepted and rejected signup behavior with authorized disposable test data; no email or signup was sent by this script.',
    };
  } catch (error) {
    const safe =
      error instanceof SetupError
        ? error
        : new SetupError(
            'WORKFLOW_FAILED',
            'The configuration check failed; raw details were suppressed.',
          );
    safe.writeAttempted = writeAttempted;
    throw safe;
  }
}

export function parseArguments(args, env = process.env) {
  const result = {
    mode: 'preview',
    profile: env.SOLACE_SUPABASE_PROFILE || path.join(BASE, 'solace-profile.yaml'),
    cliHome: env.SOLACE_SUPABASE_CLI_HOME || path.join(BASE, 'cli-home'),
    cli: env.SOLACE_SUPABASE_CLI || null,
    help: false,
  };
  let selected = false;
  const names = new Map([
    ['--profile', 'profile'],
    ['--cli-home', 'cliHome'],
    ['--cli', 'cli'],
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') {
      result.help = true;
      continue;
    }
    if (['--preview', '--apply', '--verify'].includes(arg)) {
      if (selected) fail('ARGUMENTS', 'Select exactly one mode: --preview, --apply or --verify.');
      result.mode = arg.slice(2);
      selected = true;
      continue;
    }
    const name = names.get(arg);
    const value = args[++i];
    if (!name || !value || value.startsWith('--') || /[\u0000-\u001f\u007f]/.test(value))
      fail(
        'ARGUMENTS',
        'Use only --preview/--apply/--verify and optional --cli, --profile or --cli-home paths. Never pass credentials as arguments.',
      );
    result[name] = value;
  }
  return result;
}

async function capture(executable, args, env, timeout = 45_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let bytes = 0;
    let overflow = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new SetupError(
          'CLI_TIMEOUT',
          'The CLI timed out. Verify the hook before retrying; raw output was suppressed.',
        ),
      );
    }, timeout);
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 4_000_000) {
        overflow = true;
        child.kill();
      } else stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 4_000_000) {
        overflow = true;
        child.kill();
      }
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new SetupError('CLI_START', 'The pinned CLI could not be started.'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (overflow)
        return reject(
          new SetupError(
            'CLI_OUTPUT_LIMIT',
            'CLI output exceeded the safe limit; raw output was suppressed.',
          ),
        );
      if (code !== 0)
        return reject(
          new SetupError(
            'CLI_FAILED',
            'The CLI command failed; potentially sensitive error output was suppressed.',
          ),
        );
      resolve(stdout);
    });
  });
}

async function findCli(explicit) {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    fail('PLATFORM', 'This helper uses the existing Windows x64 CLI setup.');
  if (explicit) {
    const target = await realpath(path.resolve(explicit));
    await access(target, constants.X_OK);
    return target;
  }
  const cache = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'npm-cache',
    '_npx',
  );
  let entries;
  try {
    entries = await readdir(cache, { withFileTypes: true });
  } catch {
    fail(
      'CLI_MISSING',
      `Cache the official pinned CLI with npx.cmd --yes supabase@${CLI_VERSION} --version.`,
    );
  }
  for (const entry of entries
    .filter((value) => value.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const packageRoot = path.join(cache, entry.name, 'node_modules');
      const metadata = JSON.parse(
        await readFile(path.join(packageRoot, 'supabase', 'package.json'), 'utf8'),
      );
      if (metadata.version !== CLI_VERSION) continue;
      const executable = path.join(
        packageRoot,
        '@supabase',
        'cli-windows-x64',
        'bin',
        'supabase.exe',
      );
      await access(executable, constants.X_OK);
      return executable;
    } catch {
      /* Only an exact cached package/version is eligible. */
    }
  }
  fail(
    'CLI_MISSING',
    `Cache the official pinned CLI with npx.cmd --yes supabase@${CLI_VERSION} --version.`,
  );
}

async function validateProfile(profile) {
  const resolved = await realpath(path.resolve(profile));
  const text = await readFile(resolved, 'utf8');
  if (text.length > 16_384)
    fail('PROFILE_FORMAT', 'The CLI profile is not the expected endpoint-only profile.');
  const fields = new Map();
  const allowed = new Set(['name', 'api_url', 'dashboard_url', 'project_host', 'pooler_host']);
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = /^([a-z_]+):\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([A-Za-z0-9:/.\-_]+))\s*$/.exec(
      line,
    );
    if (!match || !allowed.has(match[1]) || fields.has(match[1]))
      fail('PROFILE_FORMAT', 'Use the existing simple, endpoint-only Solace CLI profile.');
    fields.set(match[1], match[2] ?? match[3] ?? match[4]);
  }
  if (fields.get('name') !== 'solace' || fields.get('api_url') !== 'https://api.supabase.com')
    fail('PROFILE_ENDPOINT', 'The Solace profile must use the canonical Supabase Management API.');
  return resolved;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help)
    return {
      usage: 'node scripts/configure-account-signup-hook.mjs --preview|--apply|--verify',
      options: [
        '--cli <pinned-executable>',
        '--profile <Solace-endpoint-profile.yaml>',
        '--cli-home <existing-CLI-home>',
      ],
      scope:
        'Only auth.hook.before_user_created.enabled and uri; --apply requires the deployed matching frontend.',
    };
  const executable = await findCli(options.cli);
  const profile = await validateProfile(options.profile);
  const cliHome = await realpath(path.resolve(options.cliHome));
  const env = { ...process.env, SUPABASE_HOME: cliHome };
  for (const key of [
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_API_URL',
    'SUPABASE_PROFILE',
    'SUPABASE_PROJECT_REF',
    'SUPABASE_BRANCH',
    'SUPABASE_WORKDIR',
    'SUPABASE_CONFIG',
    'SUPABASE_YES',
  ])
    delete env[key];
  if ((await capture(executable, ['--version'], env, 15_000)).trim() !== CLI_VERSION)
    fail('CLI_VERSION', 'The executable version does not match the pinned CLI.');
  await mkdir(BASE, { recursive: true });
  const base = await realpath(BASE);
  let temp;
  if (!inside(await realpath(ROOT), base))
    fail('BASE_PATH', 'The local Auth workspace must remain inside this project.');
  try {
    temp = await mkdtemp(path.join(base, 'signup-hook-'));
    const resolved = await realpath(temp);
    if (!inside(base, resolved))
      fail('TEMP_PATH', 'The temporary config escaped the local Auth workspace.');
    const workdirs = {};
    for (const [name, config] of Object.entries({
      base: 'project_id = "solace-signup-hook"\n',
      desired: hookConfig(),
      disabled: hookConfig(false),
      uriProbe: hookConfig(true, `${HOOK_URI}_read_only_probe`),
    })) {
      const directory = path.join(resolved, name);
      await mkdir(path.join(directory, 'supabase'), { recursive: true });
      await writeFile(path.join(directory, 'supabase', 'config.toml'), config, {
        encoding: 'utf8',
        mode: 0o600,
      });
      workdirs[name] = directory;
    }
    async function command(operation, config) {
      if (
        !['diff', 'push'].includes(operation) ||
        !Object.hasOwn(workdirs, config) ||
        (operation === 'push' && config !== 'desired')
      )
        fail('COMMAND_SCOPE', 'A command outside the reviewed hook workflow was refused.');
      const argv = [
        'config',
        operation,
        '--project-ref',
        PROJECT_REF,
        '--profile',
        profile,
        '--workdir',
        workdirs[config],
        '--output-format',
        'json',
        '--agent',
        'yes',
      ];
      if (operation === 'push') argv.push('--yes');
      const output = await capture(executable, argv, env);
      let payload;
      try {
        payload = JSON.parse(output);
      } catch {
        fail('CLI_JSON', 'The CLI returned invalid JSON; raw output was suppressed.');
      }
      if (!payload || typeof payload !== 'object' || payload._tag === 'Error' || payload.error)
        fail('CLI_RESPONSE', 'The CLI reported an error; raw output was suppressed.');
      if (
        (operation === 'push' ? payload.project_ref : payload.target?.project_ref) !== PROJECT_REF
      )
        fail('WRONG_TARGET', 'The CLI response did not identify the approved Solace project.');
      return payload;
    }
    return await executeHookWorkflow({
      mode: options.mode,
      command,
      frontendCheck: () => verifyFrontend(),
    });
  } finally {
    if (temp) {
      const resolved = await realpath(temp);
      const metadata = await lstat(temp);
      if (
        !inside(base, resolved) ||
        !path.basename(resolved).startsWith('signup-hook-') ||
        !metadata.isDirectory() ||
        metadata.isSymbolicLink()
      )
        fail(
          'CLEANUP_PATH',
          'Temporary folder cleanup was refused because its resolved path was unexpected.',
        );
      await rm(resolved, { recursive: true, force: false });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      const known = error instanceof SetupError;
      process.stderr.write(
        `${JSON.stringify({ ok: false, code: known ? error.code : 'SETUP_FAILED', message: known ? error.message : 'Setup failed; potentially sensitive details were suppressed.', writeAttempted: Boolean(error.writeAttempted) })}\n`,
      );
      process.exitCode = 1;
    });
}
