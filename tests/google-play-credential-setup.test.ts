import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createVercelOperations,
  previewPlan,
  runSetup,
  validateCatalog,
  validateCredential,
} from '../scripts/configure-google-play-credential.mjs';

const privateKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
}).privateKey;
const identity = {
  projectId: 'ennearock-web',
  email: 'solace-play-billing@ennearock-web.iam.gserviceaccount.com',
  vercelProjectId: 'prj_pgHSZQaH2JiJpZeuxbAtxfKeDXM2',
  vercelTeamId: 'team_UoTX9BIswVAop56hlgcbsUqm',
  secret: 'GOOGLE_IAP_SERVICE_ACCOUNT_JSON',
};
const publicConfig: Record<string, string> = {
  GOOGLE_IAP_PRODUCT_ID: 'solace_pro',
  GOOGLE_IAP_BASE_PLAN_ID: 'monthly',
  NATIVE_BILLING_ENVIRONMENT: 'sandbox',
  NATIVE_LIVE_PURCHASES_ENABLED: 'false',
  GOOGLE_IAP_ENABLED: 'false',
};
function credential(patch: Record<string, unknown> = {}) {
  return {
    type: 'service_account',
    project_id: identity.projectId,
    private_key_id: 'a'.repeat(40),
    private_key: privateKey,
    client_email: identity.email,
    client_id: '123456789',
    token_uri: 'https://oauth2.googleapis.com/token',
    ...patch,
  };
}
function catalog() {
  return {
    packageName: 'com.solace.pomodoro',
    productId: 'solace_pro',
    basePlans: [
      {
        basePlanId: 'monthly',
        state: 'ACTIVE',
        autoRenewingBasePlanType: { billingPeriodDuration: 'P1M' },
        regionalConfigs: [
          {
            regionCode: 'FR',
            newSubscriberAvailability: true,
            price: { currencyCode: 'EUR', units: '1', nanos: 0 },
          },
        ],
      },
    ],
  };
}
type Metadata = { id: string; key: string; type: string; target: string[] };
function fixture() {
  const state = {
    linked: { projectId: identity.vercelProjectId, orgId: identity.vercelTeamId },
    credential: JSON.stringify(credential()),
    values: { ...publicConfig },
    catalog: catalog() as unknown,
    metadata: [
      ...Object.keys(publicConfig).map((key, index) => ({
        id: `env_public_${index}`,
        key,
        type: 'encrypted',
        target: ['production'],
      })),
      {
        id: 'env_unrelated',
        key: 'SUPABASE_SERVICE_ROLE_KEY',
        type: 'sensitive',
        target: ['production'],
      },
    ] as Metadata[],
    uploaded: null as string | null,
  };
  const deps = {
    readLinkedProject: vi.fn(async () => state.linked),
    readCredential: vi.fn(async (path: string) => {
      if (path !== 'owner-selected-credential.json') throw new Error('Unexpected credential path.');
      return state.credential;
    }),
    listEnvironment: vi.fn(async () => ({ envs: structuredClone(state.metadata) })),
    readPublicEnvironment: vi.fn(async (id: string) => {
      const row = state.metadata.find((item) => item.id === id);
      if (!row || !(row.key in publicConfig)) throw new Error('Unexpected secret read.');
      return { ...row, target: [...row.target], value: state.values[row.key], decrypted: true };
    }),
    verifyGoogle: vi.fn(async () => state.catalog),
    uploadCredential: vi.fn(async (serialized: string) => {
      state.uploaded = serialized;
      state.metadata.push({
        id: 'env_google_credential',
        key: identity.secret,
        type: 'sensitive',
        target: ['production'],
      });
    }),
  };
  return { state, deps };
}
const apply = { mode: 'apply', credentialPath: 'owner-selected-credential.json' } as const;

describe('Google Play credential input boundary', () => {
  it('validates the selected account and normalizes only trusted credential fields', () => {
    const result = validateCredential(
      JSON.stringify(
        credential({
          token_uri: 'https://accounts.google.com/o/oauth2/token',
          auth_uri: 'https://untrusted.invalid/authorization',
          client_x509_cert_url: 'https://untrusted.invalid/certificate',
          unexpected: 'PRIVATE_DIAGNOSTIC_SENTINEL',
        }),
      ),
    );
    expect(result).toMatchObject({
      project_id: identity.projectId,
      client_email: identity.email,
      private_key: privateKey,
      token_uri: 'https://oauth2.googleapis.com/token',
    });
    expect(result).not.toHaveProperty('auth_uri');
    expect(result).not.toHaveProperty('client_x509_cert_url');
    expect(result).not.toHaveProperty('unexpected');
  });

  it.each([
    { project_id: 'foreign-project' },
    { client_email: 'other@ennearock-web.iam.gserviceaccount.com' },
    { type: 'authorized_user' },
    { private_key: 'PRIVATE_DIAGNOSTIC_SENTINEL' },
    { private_key_id: 'invalid' },
    { token_uri: 'https://untrusted.invalid/token' },
    { token_uri: 'https://oauth2.googleapis.com/token?redirect=foreign' },
    { universe_domain: 'untrusted.invalid' },
  ])('rejects an invalid credential without echoing its contents: %j', (patch) => {
    expect(() => validateCredential(JSON.stringify(credential(patch)))).toThrow();
    try {
      validateCredential(JSON.stringify(credential(patch)));
    } catch (error) {
      expect(String(error)).not.toContain(privateKey);
      expect(String(error)).not.toContain('PRIVATE_DIAGNOSTIC_SENTINEL');
    }
  });

  it('rejects malformed JSON and a non-RSA key before any provider use', () => {
    expect(() => validateCredential('{malformed')).toThrow();
    const ec = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'pem', type: 'spki' },
    });
    expect(() =>
      validateCredential(JSON.stringify(credential({ private_key: ec.privateKey }))),
    ).toThrow();
  });

  it('rejects weak RSA keys and oversized JSON without provider use', () => {
    const weak = generateKeyPairSync('rsa', {
      modulusLength: 1024,
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'pem', type: 'spki' },
    });
    expect(() =>
      validateCredential(JSON.stringify(credential({ private_key: weak.privateKey }))),
    ).toThrow();
    expect(() =>
      validateCredential(JSON.stringify(credential({ unexpected: 'x'.repeat(65_536) }))),
    ).toThrow();
  });
});

describe('read-only Google catalog evidence', () => {
  it('accepts only the configured active monthly auto-renewing plan', () => {
    expect(validateCatalog(catalog())).toMatchObject({ catalogVerified: true, monthly: true });
    for (const input of [
      { ...catalog(), packageName: 'com.solacepomodoro.myapp' },
      { ...catalog(), productId: 'another-product' },
      { ...catalog(), basePlans: [] },
      { ...catalog(), basePlans: [{ ...catalog().basePlans[0], basePlanId: 'other' }] },
      { ...catalog(), basePlans: [{ ...catalog().basePlans[0], state: 'INACTIVE' }] },
      {
        ...catalog(),
        basePlans: [
          { ...catalog().basePlans[0], autoRenewingBasePlanType: { billingPeriodDuration: 'P1Y' } },
        ],
      },
      {
        ...catalog(),
        basePlans: [
          {
            basePlanId: 'monthly',
            state: 'ACTIVE',
            prepaidBasePlanType: { billingPeriodDuration: 'P1M' },
          },
        ],
      },
      { ...catalog(), basePlans: [catalog().basePlans[0], catalog().basePlans[0]] },
      {
        ...catalog(),
        basePlans: [
          { ...catalog().basePlans[0], installmentsBasePlanType: { commitmentPaymentsCount: 3 } },
        ],
      },
    ])
      expect(() => validateCatalog(input)).toThrow();
  });
});

describe('credential setup with synthetic providers', () => {
  it('previews without reading a key, project, environment or provider', async () => {
    const { deps } = fixture();
    const result = await runSetup({ mode: 'preview' }, deps);
    expect(result).toEqual(previewPlan());
    for (const operation of Object.values(deps)) expect(operation).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(privateKey);
  });

  it.each([undefined, '', ' ', 'credential\n.json', 'credential\0.json'])(
    'rejects a cancelled or invalid file selection before any side effects: %j',
    async (credentialPath) => {
      const { deps } = fixture();
      await expect(runSetup({ mode: 'apply', credentialPath }, deps)).rejects.toThrow();
      for (const operation of Object.values(deps)) expect(operation).not.toHaveBeenCalled();
    },
  );

  it.each(['projectId', 'orgId'] as const)('refuses the wrong linked Vercel %s', async (field) => {
    const { state, deps } = fixture();
    state.linked[field] = 'foreign-project-or-team';
    await expect(runSetup(apply, deps)).rejects.toThrow();
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.verifyGoogle).not.toHaveBeenCalled();
    expect(deps.uploadCredential).not.toHaveBeenCalled();
  });

  it.each([
    ['GOOGLE_IAP_ENABLED', 'true'],
    ['NATIVE_LIVE_PURCHASES_ENABLED', 'true'],
    ['NATIVE_BILLING_ENVIRONMENT', 'production'],
    ['GOOGLE_IAP_PRODUCT_ID', 'another-product'],
    ['GOOGLE_IAP_BASE_PLAN_ID', 'annual'],
  ])('refuses a conflicting %s setting', async (key, value) => {
    const { state, deps } = fixture();
    state.values[key] = value;
    await expect(runSetup(apply, deps)).rejects.toThrow();
    expect(deps.verifyGoogle).not.toHaveBeenCalled();
    expect(deps.uploadCredential).not.toHaveBeenCalled();
  });

  it('preserves an existing credential instead of replacing it', async () => {
    const { state, deps } = fixture();
    state.metadata.push({
      id: 'env_existing_credential',
      key: identity.secret,
      type: 'sensitive',
      target: ['production'],
    });
    await expect(runSetup(apply, deps)).rejects.toThrow();
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.uploadCredential).not.toHaveBeenCalled();
    expect(
      deps.readPublicEnvironment.mock.calls.every(([id]) => id !== 'env_existing_credential'),
    ).toBe(true);
  });

  it.each(['missing', 'duplicate', 'unsafe-id', 'wrong-target'])(
    'rejects %s public configuration metadata before using the key',
    async (fault) => {
      const { state, deps } = fixture();
      if (fault === 'missing') state.metadata.shift();
      if (fault === 'duplicate') state.metadata.push({ ...state.metadata[0] });
      if (fault === 'unsafe-id') state.metadata[0].id = '../env_unrelated';
      if (fault === 'wrong-target') state.metadata[0].target = ['preview'];
      await expect(runSetup(apply, deps)).rejects.toThrow();
      expect(deps.readCredential).not.toHaveBeenCalled();
      expect(deps.verifyGoogle).not.toHaveBeenCalled();
      expect(deps.uploadCredential).not.toHaveBeenCalled();
    },
  );

  it('uploads one sanitized credential after Google verification, without activating purchases', async () => {
    const { state, deps } = fixture();
    const result = await runSetup(apply, deps);
    expect(deps.uploadCredential).toHaveBeenCalledOnce();
    expect(deps.verifyGoogle).toHaveBeenCalledOnce();
    expect(deps.verifyGoogle.mock.invocationCallOrder[0]).toBeLessThan(
      deps.uploadCredential.mock.invocationCallOrder[0],
    );
    expect(JSON.parse(state.uploaded!)).toMatchObject({
      project_id: identity.projectId,
      client_email: identity.email,
      private_key: privateKey,
    });
    expect(state.values).toEqual(publicConfig);
    expect(
      deps.readPublicEnvironment.mock.calls.every(([id]) => id.startsWith('env_public_')),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(privateKey);
    expect(JSON.stringify(result)).not.toContain(state.uploaded!);
  });

  it('refuses invalid catalog evidence without uploading the selected key', async () => {
    const { state, deps } = fixture();
    state.catalog = { ...catalog(), productId: 'foreign-product' };
    await expect(runSetup(apply, deps)).rejects.toThrow();
    expect(deps.uploadCredential).not.toHaveBeenCalled();
  });

  it('rechecks safe settings after Google verification to catch concurrent activation', async () => {
    const { state, deps } = fixture();
    deps.verifyGoogle.mockImplementation(async () => {
      state.values.GOOGLE_IAP_ENABLED = 'true';
      return catalog();
    });
    await expect(runSetup(apply, deps)).rejects.toThrow();
    expect(deps.uploadCredential).not.toHaveBeenCalled();
  });

  it('catches a credential created concurrently before uploading', async () => {
    const { state, deps } = fixture();
    deps.verifyGoogle.mockImplementation(async () => {
      state.metadata.push({
        id: 'env_raced_credential',
        key: identity.secret,
        type: 'sensitive',
        target: ['production'],
      });
      return catalog();
    });
    await expect(runSetup(apply, deps)).rejects.toThrow();
    expect(deps.uploadCredential).not.toHaveBeenCalled();
  });

  it.each([
    'missing-secret',
    'wrong-secret-type',
    'changed-protected-setting',
    'activated-purchases',
  ])('reports an attempted write when post-upload verification finds %s', async (fault) => {
    const { state, deps } = fixture();
    deps.uploadCredential.mockImplementation(async (serialized: string) => {
      state.uploaded = serialized;
      if (fault !== 'missing-secret')
        state.metadata.push({
          id: 'env_google_credential',
          key: identity.secret,
          type: fault === 'wrong-secret-type' ? 'encrypted' : 'sensitive',
          target: ['production'],
        });
      if (fault === 'changed-protected-setting') state.metadata[0].id = 'env_changed';
      if (fault === 'activated-purchases') state.values.GOOGLE_IAP_ENABLED = 'true';
    });
    await expect(runSetup(apply, deps)).rejects.toMatchObject({ writeAttempted: true });
    expect(deps.uploadCredential).toHaveBeenCalledOnce();
    expect(
      deps.readPublicEnvironment.mock.calls.some(([id]) => id === 'env_google_credential'),
    ).toBe(false);
  });

  it.each(['verifyGoogle', 'uploadCredential'] as const)(
    'sanitizes %s failure diagnostics',
    async (operation) => {
      const { deps } = fixture();
      deps[operation].mockRejectedValue(new Error(`PRIVATE_DIAGNOSTIC_SENTINEL ${privateKey}`));
      let caught: unknown;
      try {
        await runSetup(apply, deps);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(String(caught)).not.toContain(privateKey);
      expect(String(caught)).not.toContain('PRIVATE_DIAGNOSTIC_SENTINEL');
      if (operation === 'verifyGoogle') expect(deps.uploadCredential).not.toHaveBeenCalled();
    },
  );
});

describe('Vercel secret transport', () => {
  it('uses a fixed server-only secret target and stdin instead of secret argv or replacement', async () => {
    const command = vi.fn<
      (args: string[], input?: string) => Promise<{ code: number; stdout: string }>
    >(async () => ({ code: 0, stdout: '{}' }));
    const operations = createVercelOperations(command);
    const serialized = JSON.stringify(credential());
    await operations.uploadCredential(serialized);
    expect(command).toHaveBeenCalledOnce();
    const [args, input] = command.mock.calls[0];
    expect(args.slice(0, 4)).toEqual(['env', 'add', identity.secret, 'production']);
    expect(args).toContain('--sensitive');
    expect(args).toContain(identity.vercelProjectId);
    expect(args).toContain('hikmagitzs-projects');
    expect(args).not.toContain('--force');
    expect(args).not.toContain('--value');
    expect(args.join(' ')).not.toContain(privateKey);
    expect(args.join(' ')).not.toContain(serialized);
    expect(input?.trim()).toBe(serialized);
  });

  it('discards unsuccessful upload output rather than surfacing credential diagnostics', async () => {
    const command = vi.fn(async () => ({
      code: 1,
      stdout: `PRIVATE_DIAGNOSTIC_SENTINEL ${JSON.stringify(credential())}`,
    }));
    const operations = createVercelOperations(command);
    let caught: unknown;
    try {
      await operations.uploadCredential(JSON.stringify(credential()));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).not.toContain(privateKey);
    expect(String(caught)).not.toContain('PRIVATE_DIAGNOSTIC_SENTINEL');
  });
});
