import { spawn } from 'node:child_process';
import { createPrivateKey } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_VERSION = '59.25.4';
const MAX_CREDENTIAL_BYTES = 65_536;
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CATALOG_ENDPOINT =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.solace.pomodoro/subscriptions/solace_pro';

export const EXPECTED = Object.freeze({
  googleProjectId: 'ennearock-web',
  serviceAccountEmail: 'solace-play-billing@ennearock-web.iam.gserviceaccount.com',
  packageName: 'com.solace.pomodoro',
  productId: 'solace_pro',
  basePlanId: 'monthly',
  vercelProjectId: 'prj_pgHSZQaH2JiJpZeuxbAtxfKeDXM2',
  vercelTeamId: 'team_UoTX9BIswVAop56hlgcbsUqm',
  vercelScope: 'hikmagitzs-projects',
  credentialVariable: 'GOOGLE_IAP_SERVICE_ACCOUNT_JSON',
});

export const REQUIRED_PUBLIC_CONFIG = Object.freeze({
  GOOGLE_IAP_PRODUCT_ID: EXPECTED.productId,
  GOOGLE_IAP_BASE_PLAN_ID: EXPECTED.basePlanId,
  NATIVE_BILLING_ENVIRONMENT: 'sandbox',
  NATIVE_LIVE_PURCHASES_ENABLED: 'false',
  GOOGLE_IAP_ENABLED: 'false',
});

export class SetupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SetupError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new SetupError(code, message);
}

export function previewPlan() {
  return {
    ok: true,
    mode: 'preview',
    ...EXPECTED,
    target: 'production',
    requiredPublicConfig: REQUIRED_PUBLIC_CONFIG,
    credentialRead: false,
    networkRequests: 0,
    writeAttempted: false,
    purchasesEnabled: false,
    deploymentPerformed: false,
  };
}

/** Return only fields trusted by Google's fixed service-account auth flow. */
export function validateCredential(raw) {
  let value;
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_CREDENTIAL_BYTES)
      throw new Error();
    value = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    fail('INVALID_CREDENTIAL', 'Select a valid Google service-account JSON file.');
  }
  if (
    !value ||
    Array.isArray(value) ||
    value.type !== 'service_account' ||
    value.project_id !== EXPECTED.googleProjectId ||
    value.client_email !== EXPECTED.serviceAccountEmail ||
    ![TOKEN_ENDPOINT, 'https://accounts.google.com/o/oauth2/token'].includes(value.token_uri) ||
    (value.universe_domain !== undefined && value.universe_domain !== 'googleapis.com') ||
    typeof value.private_key !== 'string' ||
    (value.private_key_id !== undefined &&
      (typeof value.private_key_id !== 'string' || !/^[a-fA-F0-9]{40}$/.test(value.private_key_id)))
  )
    fail(
      'CREDENTIAL_IDENTITY',
      'The selected credential must belong to the approved Solace service account.',
    );
  try {
    const key = createPrivateKey(value.private_key);
    if (key.asymmetricKeyType !== 'rsa' || !(key.asymmetricKeyDetails?.modulusLength >= 2048))
      throw new Error();
  } catch {
    fail(
      'INVALID_PRIVATE_KEY',
      'The service-account file does not contain a supported RSA private key.',
    );
  }
  return {
    type: 'service_account',
    project_id: EXPECTED.googleProjectId,
    client_email: EXPECTED.serviceAccountEmail,
    private_key: value.private_key,
    ...(value.private_key_id ? { private_key_id: value.private_key_id } : {}),
    token_uri: TOKEN_ENDPOINT,
    universe_domain: 'googleapis.com',
  };
}

export function validateCatalog(raw) {
  const matching = Array.isArray(raw?.basePlans)
    ? raw.basePlans.filter((plan) => plan?.basePlanId === EXPECTED.basePlanId)
    : [];
  const plan = matching[0];
  if (
    raw?.packageName !== EXPECTED.packageName ||
    raw?.productId !== EXPECTED.productId ||
    matching.length !== 1 ||
    plan.state !== 'ACTIVE' ||
    plan.autoRenewingBasePlanType?.billingPeriodDuration !== 'P1M' ||
    plan.prepaidBasePlanType !== undefined ||
    plan.installmentsBasePlanType !== undefined
  )
    fail(
      'CATALOG_NOT_READY',
      'Google must return Solace Pro with its active auto-renewing monthly base plan.',
    );
  const french = Array.isArray(plan.regionalConfigs)
    ? plan.regionalConfigs.filter((region) => region?.regionCode === 'FR')
    : [];
  const price = french.length === 1 ? french[0].price : null;
  const validPrice =
    price &&
    typeof price.currencyCode === 'string' &&
    /^[A-Z]{3}$/.test(price.currencyCode) &&
    typeof price.units === 'string' &&
    /^\d{1,9}$/.test(price.units) &&
    Number.isInteger(price.nanos ?? 0) &&
    (price.nanos ?? 0) >= 0 &&
    (price.nanos ?? 0) < 1_000_000_000;
  return {
    catalogVerified: true,
    monthly: true,
    francePrice: validPrice
      ? { currencyCode: price.currencyCode, units: price.units, nanos: price.nanos ?? 0 }
      : null,
  };
}

function environmentRows(metadata) {
  if (
    !Array.isArray(metadata?.envs) ||
    metadata.envs.some(
      (row) =>
        !row ||
        typeof row.key !== 'string' ||
        typeof row.id !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(row.id) ||
        !Array.isArray(row.target) ||
        !row.target.includes('production'),
    )
  )
    fail('ENV_METADATA', 'Vercel returned unexpected production environment metadata.');
  return metadata.envs;
}

function protectedMetadata(rows) {
  return JSON.stringify(
    rows
      .filter((row) => row.key !== EXPECTED.credentialVariable)
      .map((row) => ({
        id: row.id,
        key: row.key,
        type: row.type,
        target: [...row.target].sort(),
        gitBranch: row.gitBranch ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

async function checkPublicConfiguration(rows, io) {
  for (const [key, expected] of Object.entries(REQUIRED_PUBLIC_CONFIG)) {
    const matching = rows.filter((row) => row.key === key);
    if (matching.length !== 1 || matching[0].type === 'sensitive')
      fail(
        'PUBLIC_CONFIG',
        'The five approved disabled Google test settings must already be configured.',
      );
    const row = await io.readPublicEnvironment(matching[0].id);
    if (
      row?.id !== matching[0].id ||
      row.key !== key ||
      row.value !== expected ||
      row.decrypted === false ||
      !Array.isArray(row.target) ||
      row.target.length !== 1 ||
      row.target[0] !== 'production'
    )
      fail(
        'PUBLIC_CONFIG',
        'The Google test configuration must match the approved disabled sandbox settings.',
      );
  }
}

function ensureNoCredential(rows) {
  if (rows.some((row) => row.key === EXPECTED.credentialVariable))
    fail(
      'CREDENTIAL_EXISTS',
      'A Google credential already exists in Vercel. This helper never replaces it.',
    );
}

/** Provider output stays in memory; the caller receives only static diagnostics. */
export function createVercelOperations(runCommand) {
  const scope = ['--scope', EXPECTED.vercelScope];
  const project = ['--project', EXPECTED.vercelProjectId];
  async function json(args) {
    const result = await runCommand([...args, ...scope]);
    if (result.code !== 0)
      fail(
        'VERCEL_READ_FAILED',
        'The Vercel configuration could not be inspected. Check your CLI sign-in.',
      );
    try {
      return JSON.parse(result.stdout);
    } catch {
      fail('VERCEL_RESPONSE', 'Vercel returned an unexpected configuration response.');
    }
  }
  return {
    listEnvironment: () =>
      json([
        'api',
        `/v10/projects/${EXPECTED.vercelProjectId}/env?target=production&teamId=${EXPECTED.vercelTeamId}`,
        '--method',
        'GET',
        '--raw',
      ]),
    readPublicEnvironment: (id) => {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id))
        fail('ENV_ID', 'A public configuration identifier was invalid.');
      return json([
        'api',
        `/v1/projects/${EXPECTED.vercelProjectId}/env/${id}?teamId=${EXPECTED.vercelTeamId}`,
        '--method',
        'GET',
        '--raw',
      ]);
    },
    uploadCredential: async (serialized) => {
      const result = await runCommand(
        [
          'env',
          'add',
          EXPECTED.credentialVariable,
          'production',
          '--sensitive',
          '--yes',
          ...project,
          ...scope,
        ],
        serialized,
      );
      if (result.code !== 0)
        fail(
          'CREDENTIAL_UPLOAD',
          'Vercel did not confirm the credential upload. Inspect metadata before retrying.',
        );
    },
  };
}

async function findVercelCli() {
  const cache = process.env.LOCALAPPDATA;
  const candidates = [
    path.join(ROOT, 'node_modules', 'vercel'),
    ...(cache
      ? ['0ba70bd8308c98e3', '67eb4586ca667318'].map((entry) =>
          path.join(cache, 'npm-cache', '_npx', entry, 'node_modules', 'vercel'),
        )
      : []),
  ];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(await readFile(path.join(candidate, 'package.json'), 'utf8'));
      if (pkg.name === 'vercel' && pkg.version === CLI_VERSION)
        return path.join(candidate, 'dist', 'vc.js');
    } catch {
      // Continue only through the fixed candidate locations.
    }
  }
  fail(
    'VERCEL_CLI_MISSING',
    'The pinned Vercel CLI is unavailable. Ask for local setup assistance.',
  );
}

async function runVercel(args, input) {
  const cli = await findVercelCli();
  return new Promise((resolve, reject) => {
    let output = '';
    let outputBytes = 0;
    let settled = false;
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: ROOT,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const rejectSafely = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(new SetupError('VERCEL_PROCESS', 'The Vercel command could not complete safely.'));
    };
    const timer = setTimeout(rejectSafely, 60_000);
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 2_000_000) rejectSafely();
      else output += chunk.toString('utf8');
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', rejectSafely);
    child.once('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code, stdout: output });
    });
    child.stdin.end(input);
  });
}

async function verifyGoogle(credentials) {
  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      clientOptions: { transporterOptions: { timeout: 15_000, retry: false, maxRedirects: 0 } },
    });
    const client = await auth.getClient();
    const access = await client.getAccessToken();
    if (!access.token) throw new Error();
    const response = await fetch(CATALOG_ENDPOINT, {
      method: 'GET',
      headers: { Authorization: `Bearer ${access.token}`, Accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error();
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 1_000_000) throw new Error();
    return JSON.parse(text);
  } catch {
    fail(
      'GOOGLE_VERIFICATION',
      'Google could not verify access to the Solace subscription catalog. Check API enablement and Play permissions.',
    );
  }
}

function defaultDependencies() {
  return {
    readLinkedProject: async () =>
      JSON.parse(await readFile(path.join(ROOT, '.vercel', 'project.json'), 'utf8')),
    readCredential: async (selected) => {
      if (typeof selected !== 'string' || !path.isAbsolute(selected) || /[\r\n\0]/.test(selected))
        fail('CREDENTIAL_FILE', 'Select a local Google service-account JSON file.');
      const info = await lstat(selected);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size < 2 ||
        info.size > MAX_CREDENTIAL_BYTES
      )
        fail(
          'CREDENTIAL_FILE',
          'Select a regular Google service-account JSON file of supported size.',
        );
      return readFile(selected, 'utf8');
    },
    verifyGoogle,
    ...createVercelOperations(runVercel),
  };
}

/** @param {{mode?: string, credentialPath?: string}} [options] */
export async function runSetup({ mode = 'preview', credentialPath } = {}, dependencies = {}) {
  if (mode === 'preview') return previewPlan();
  if (mode !== 'apply') fail('MODE', 'Use preview or apply mode.');
  if (
    typeof credentialPath !== 'string' ||
    !credentialPath.trim() ||
    credentialPath.length > 8192 ||
    /[\r\n\0]/.test(credentialPath)
  )
    fail('CREDENTIAL_FILE', 'Select a local Google service-account JSON file.');
  const io = { ...defaultDependencies(), ...dependencies };
  let writeAttempted = false;
  try {
    const linked = await io.readLinkedProject();
    if (linked?.projectId !== EXPECTED.vercelProjectId || linked.orgId !== EXPECTED.vercelTeamId)
      fail(
        'PROJECT_SCOPE',
        'The linked Vercel project must be the approved Solace project and team.',
      );
    const initial = environmentRows(await io.listEnvironment());
    ensureNoCredential(initial);
    await checkPublicConfiguration(initial, io);
    const credentials = validateCredential(await io.readCredential(credentialPath));
    const catalog = validateCatalog(await io.verifyGoogle(credentials));
    const before = environmentRows(await io.listEnvironment());
    ensureNoCredential(before);
    if (protectedMetadata(before) !== protectedMetadata(initial))
      fail(
        'CONCURRENT_CHANGE',
        'Production environment metadata changed during verification. No credential was uploaded.',
      );
    await checkPublicConfiguration(before, io);
    writeAttempted = true;
    await io.uploadCredential(JSON.stringify(credentials));
    const after = environmentRows(await io.listEnvironment());
    const added = after.filter((row) => row.key === EXPECTED.credentialVariable);
    if (
      added.length !== 1 ||
      added[0].type !== 'sensitive' ||
      added[0].target.length !== 1 ||
      added[0].target[0] !== 'production' ||
      protectedMetadata(after) !== protectedMetadata(initial)
    )
      fail(
        'UPLOAD_READBACK',
        'The credential upload needs metadata review. Do not upload another key or enable purchases.',
      );
    await checkPublicConfiguration(after, io);
    return {
      ok: true,
      mode: 'apply',
      ...EXPECTED,
      target: 'production',
      credentialUploaded: true,
      credentialValueReadBack: false,
      protectedMetadataUnchanged: true,
      ...catalog,
      writeAttempted: true,
      purchasesEnabled: false,
      deploymentPerformed: false,
    };
  } catch (error) {
    if (error instanceof SetupError) {
      error.writeAttempted = writeAttempted;
      throw error;
    }
    const sanitized = new SetupError(
      'SETUP_FAILED',
      'Google credential setup could not complete. No credential details were printed.',
    );
    sanitized.writeAttempted = writeAttempted;
    throw sanitized;
  }
}

async function readSelection() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk.toString('utf8');
    if (Buffer.byteLength(raw, 'utf8') > 8192)
      fail('SELECTION', 'The local file selection could not be read.');
  }
  try {
    const selection = JSON.parse(raw);
    if (!selection || Object.keys(selection).join('|') !== 'credentialPath') throw new Error();
    return selection.credentialPath;
  } catch {
    fail('SELECTION', 'Use the local PowerShell file picker to select the credential.');
  }
}

async function main() {
  try {
    const flags = process.argv.slice(2);
    if (flags.length > 1 || (flags.length === 1 && !['--preview', '--apply'].includes(flags[0])))
      fail('ARGUMENTS', 'Use --preview or use the PowerShell helper with -Apply.');
    const mode = flags[0] === '--apply' ? 'apply' : 'preview';
    const credentialPath = mode === 'apply' ? await readSelection() : undefined;
    console.log(JSON.stringify(await runSetup({ mode, credentialPath }), null, 2));
  } catch (error) {
    const safe =
      error instanceof SetupError
        ? error
        : new SetupError('SETUP_FAILED', 'Google credential setup could not complete safely.');
    console.log(
      JSON.stringify({
        ok: false,
        code: safe.code,
        message: safe.message,
        writeAttempted: safe.writeAttempted === true,
      }),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
