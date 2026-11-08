import { afterAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Allow Windows process startup and the bounded IAM visibility delay.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
const repo = resolve(import.meta.dirname, '..');
const local = join(repo, '.local');
const script = join(repo, 'scripts', 'setup-google-play-notifications.sh');
const pathEntries = (process.env.Path || process.env.PATH || '').split(delimiter);
function locate(name: string) {
  return pathEntries
    .filter((entry) => !entry.toLowerCase().includes('microsoft\\windowsapps'))
    .map((entry) => join(entry, name))
    .find(existsSync);
}
const git = process.platform === 'win32' ? locate('git.exe') : undefined;
const gitRoot = git ? dirname(dirname(git)) : undefined;
const bash = (
  process.platform === 'win32'
    ? [
        ...(gitRoot ? [join(gitRoot, 'bin', 'bash.exe')] : []),
        'C:/Program Files/Git/bin/bash.exe',
        'G:/abdel/program/Git/bin/bash.exe',
      ]
    : ['/bin/bash', '/usr/bin/bash']
).find(existsSync);
const python =
  process.platform === 'win32'
    ? locate('python.exe') || locate('python3.exe')
    : ['/usr/bin/python3', '/usr/local/bin/python3'].find(existsSync);
const supported = Boolean(bash && python);
const roots: string[] = [];
const expected = {
  project: 'ennearock-web',
  projectNumber: '123456789012',
  topic: 'projects/ennearock-web/topics/solace-play-rtdn',
  subscription: 'projects/ennearock-web/subscriptions/solace-play-rtdn-push',
  pushEmail: 'solace-play-rtdn-push@ennearock-web.iam.gserviceaccount.com',
  endpoint: 'https://www.solace-pomodoro.com/api/billing/native/webhooks/google',
  publisher: 'serviceAccount:google-play-developer-notifications@system.gserviceaccount.com',
  tokenCreator: 'serviceAccount:service-123456789012@gcp-sa-pubsub.iam.gserviceaccount.com',
};

// Serialized into a temporary CommonJS fake executable; no provider is contacted.
function fakeGcloud() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  const args = process.argv.slice(2);
  const file = process.env.SOLACE_TEST_STATE!;
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.appendFileSync(process.env.SOLACE_TEST_LOG!, JSON.stringify(args) + '\n');
  const words = args.filter((arg) => !arg.startsWith('--'));
  const command = words.slice(0, 3).join(' ');
  const option = (name: string) => {
    const direct = args.find((arg) => arg.startsWith(name + '='));
    if (direct) return direct.slice(name.length + 1);
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const respond = (data: unknown) => {
    fs.writeFileSync(file, JSON.stringify(state));
    process.stdout.write(JSON.stringify(data) + '\n');
    process.exit(0);
  };
  const reject = () => {
    process.stderr.write('Provider request refused PRIVATE_PROVIDER_DIAGNOSTIC\n');
    process.exit(1);
  };
  if (state.failure && command === state.failure) reject();
  if (option('--project') !== 'ennearock-web') reject();
  if (command === 'projects describe ennearock-web') respond(state.project);
  if (command === 'services list')
    respond(state.enabled.map((name: string) => ({ config: { name } })));
  if (command.startsWith('services enable')) {
    for (const name of words.slice(2)) {
      if (!['pubsub.googleapis.com', 'iam.googleapis.com'].includes(name)) reject();
      if (!state.enabled.includes(name)) {
        state.enabled.push(name);
        state.changes++;
      }
    }
    respond({});
  }
  if (command === 'iam service-accounts list') {
    if (state.accounts.length && state.failAccountReadAfterCreate) reject();
    if (state.accounts.length && state.accountVisibilityDelay > 0) {
      state.accountVisibilityDelay--;
      respond([]);
    }
    respond(state.accounts);
  }
  if (command === 'pubsub topics list') respond(state.topics);
  if (command === 'pubsub subscriptions list') respond(state.subscriptions);
  if (command === 'iam service-accounts create') {
    if (words[3] !== 'solace-play-rtdn-push' || state.accounts.length) reject();
    state.accounts.push({
      email: 'solace-play-rtdn-push@ennearock-web.iam.gserviceaccount.com',
      projectId: 'ennearock-web',
      disabled: false,
    });
    state.changes++;
    respond(state.accounts[0]);
  }
  if (command === 'pubsub topics create') {
    if (words[3] !== 'solace-play-rtdn' || state.topics.length) reject();
    state.topics.push({ name: 'projects/ennearock-web/topics/solace-play-rtdn', state: 'ACTIVE' });
    state.changes++;
    respond(state.topics[0]);
  }
  if (command === 'pubsub subscriptions create') {
    if (words[3] !== 'solace-play-rtdn-push' || state.subscriptions.length) reject();
    state.subscriptions.push({
      name: 'projects/ennearock-web/subscriptions/solace-play-rtdn-push',
      topic: option('--topic'),
      pushConfig: {
        pushEndpoint: option('--push-endpoint'),
        oidcToken: {
          serviceAccountEmail: option('--push-auth-service-account'),
          audience: option('--push-auth-token-audience'),
        },
      },
      ackDeadlineSeconds: Number(option('--ack-deadline')),
      expirationPolicy: option('--expiration-period') === 'never' ? {} : { ttl: 'invalid' },
      state: 'ACTIVE',
    });
    state.changes++;
    respond(state.subscriptions[0]);
  }
  if (words.slice(0, 4).join(' ') === 'beta services identity create') {
    if (option('--service') !== 'pubsub.googleapis.com') reject();
    if (!state.serviceIdentity) {
      state.serviceIdentity = true;
      state.changes++;
    }
    respond({ email: 'service-123456789012@gcp-sa-pubsub.iam.gserviceaccount.com' });
  }
  if (command === 'pubsub topics get-iam-policy') respond(state.topicPolicy);
  if (command === 'iam service-accounts get-iam-policy') respond(state.accountPolicy);
  if (
    command === 'pubsub topics add-iam-policy-binding' ||
    command === 'iam service-accounts add-iam-policy-binding'
  ) {
    const topic = command.startsWith('pubsub');
    const target = words[3];
    if (
      (topic &&
        !['solace-play-rtdn', 'projects/ennearock-web/topics/solace-play-rtdn'].includes(target)) ||
      (!topic && target !== 'solace-play-rtdn-push@ennearock-web.iam.gserviceaccount.com')
    )
      reject();
    const policy = topic ? state.topicPolicy : state.accountPolicy;
    const role = option('--role');
    const member = option('--member');
    if (
      role !== (topic ? 'roles/pubsub.publisher' : 'roles/iam.serviceAccountTokenCreator') ||
      member !==
        (topic
          ? 'serviceAccount:google-play-developer-notifications@system.gserviceaccount.com'
          : 'serviceAccount:service-123456789012@gcp-sa-pubsub.iam.gserviceaccount.com') ||
      (topic ? option('--condition') !== undefined : option('--condition') !== 'None')
    )
      reject();
    let binding = policy.bindings.find(
      (item: { role: string; condition?: unknown }) => item.role === role && !item.condition,
    );
    if (!binding) {
      binding = { role, members: [] };
      policy.bindings.push(binding);
    }
    if (!binding.members.includes(member)) {
      binding.members.push(member);
      state.changes++;
    }
    respond(policy);
  }
  reject();
}

function shellPath(value: string) {
  return value
    .replaceAll('\\', '/')
    .replace(/^([A-Za-z]):\//, (_, drive: string) => '/' + drive.toLowerCase() + '/');
}
function fixture(ready = false) {
  mkdirSync(local, { recursive: true });
  const root = mkdtempSync(join(local, 'rtdn-setup-test-'));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const statePath = join(root, 'state.json');
  const logPath = join(root, 'calls.jsonl');
  const fakePath = join(root, 'fake-gcloud.cjs');
  writeFileSync(fakePath, '(' + fakeGcloud.toString() + ')();\n');
  writeFileSync(logPath, '');
  writeFileSync(
    join(bin, 'gcloud'),
    '#!/bin/bash\nexec "$SOLACE_TEST_NODE" "$SOLACE_TEST_FAKE" "$@"\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, 'python3'),
    '#!/bin/bash\nargs=()\nfor arg in "$@"; do\n' +
      ' if command -v cygpath >/dev/null && [[ "$arg" == /* && -f "$arg" ]]; then args+=("$(cygpath -w "$arg")"); else args+=("$arg"); fi\n' +
      'done\nexec "$SOLACE_TEST_PYTHON" "$' +
      '{args[@]}"\n',
    { mode: 0o755 },
  );
  const state = {
    project: {
      projectId: expected.project,
      projectNumber: expected.projectNumber,
      lifecycleState: 'ACTIVE',
    },
    enabled: ready ? ['pubsub.googleapis.com', 'iam.googleapis.com'] : [],
    accounts: ready
      ? [{ email: expected.pushEmail, projectId: expected.project, disabled: false }]
      : [],
    topics: ready ? [{ name: expected.topic, state: 'ACTIVE' }] : [],
    subscriptions: ready
      ? [
          {
            name: expected.subscription,
            topic: expected.topic,
            pushConfig: {
              pushEndpoint: expected.endpoint,
              oidcToken: { serviceAccountEmail: expected.pushEmail, audience: expected.endpoint },
            },
            ackDeadlineSeconds: 60,
            expirationPolicy: {},
            state: 'ACTIVE',
          },
        ]
      : [],
    topicPolicy: {
      version: 1,
      etag: 'topic-etag',
      bindings: [
        { role: 'roles/pubsub.viewer', members: ['user:existing-topic-reader@example.invalid'] },
        ...(ready ? [{ role: 'roles/pubsub.publisher', members: [expected.publisher] }] : []),
      ],
    },
    accountPolicy: {
      version: 1,
      etag: 'account-etag',
      bindings: [
        {
          role: 'roles/iam.serviceAccountViewer',
          members: ['user:existing-account-reader@example.invalid'],
        },
        ...(ready
          ? [{ role: 'roles/iam.serviceAccountTokenCreator', members: [expected.tokenCreator] }]
          : []),
      ],
    },
    serviceIdentity: ready,
    accountVisibilityDelay: 0,
    failAccountReadAfterCreate: false,
    changes: 0,
    failure: '',
  };
  const save = () => writeFileSync(statePath, JSON.stringify(state));
  save();
  const run = (args: string[] = []) => {
    const env = { ...process.env };
    delete env.Path;
    env.PATH = [
      shellPath(bin),
      ...(gitRoot
        ? [shellPath(join(gitRoot, 'usr', 'bin')), shellPath(join(gitRoot, 'mingw64', 'bin'))]
        : ['/usr/bin', '/bin']),
    ].join(':');
    env.MSYS2_ARG_CONV_EXCL = '*';
    env.SOLACE_TEST_NODE = process.execPath.replaceAll('\\', '/');
    env.SOLACE_TEST_PYTHON = python!.replaceAll('\\', '/');
    env.SOLACE_TEST_FAKE = fakePath.replaceAll('\\', '/');
    env.SOLACE_TEST_STATE = statePath.replaceAll('\\', '/');
    env.SOLACE_TEST_LOG = logPath.replaceAll('\\', '/');
    const result = spawnSync(bash!, [shellPath(script), ...args], {
      cwd: repo,
      env,
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
    });
    const calls = readFileSync(logPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
    return { ...result, calls, state: JSON.parse(readFileSync(statePath, 'utf8')) as typeof state };
  };
  return { state, save, run };
}
afterAll(() => {
  for (const root of roots) {
    const child = relative(local, root);
    if (
      !child ||
      child.startsWith('..') ||
      isAbsolute(child) ||
      !child.startsWith('rtdn-setup-test-')
    )
      throw new Error('Refusing fixture cleanup outside the intended workspace directory.');
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!supported)(
  'Google Play notification Cloud Shell setup with fake providers',
  () => {
    it('passes Bash syntax validation', () => {
      const result = spawnSync(bash!, ['-n', shellPath(script)], {
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(result.status, result.stderr).toBe(0);
    });
    it('previews without running any Google command or changing state', () => {
      const result = fixture().run();
      expect(result.status, result.stderr).toBe(0);
      expect(result.calls).toEqual([]);
      expect(result.state.changes).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        projectId: expected.project,
        purchasesEnabled: false,
      });
      expect(result.stdout).not.toContain('solace-play-billing');
    });
    it('refuses unknown or conflicting modes without provider effects', () => {
      for (const args of [['--unexpected'], ['--apply', '--verify']]) {
        const result = fixture().run(args);
        expect(result.status).not.toBe(0);
        expect(result.calls).toEqual([]);
        expect(result.state.changes).toBe(0);
      }
    });
    it('creates only dedicated resources and narrow IAM grants', () => {
      const test = fixture();
      const beforeTopic = structuredClone(test.state.topicPolicy.bindings[0]);
      const beforeAccount = structuredClone(test.state.accountPolicy.bindings[0]);
      const result = test.run(['--apply']);
      expect(result.status, result.stderr).toBe(0);
      expect(result.calls.length).toBeGreaterThan(0);
      for (const call of result.calls) {
        expect(call).toContain('--project=ennearock-web');
        expect(
          call.some((word) =>
            ['delete', 'remove-iam-policy-binding', 'set-iam-policy', 'keys', 'billing'].includes(
              word,
            ),
          ),
        ).toBe(false);
        expect(call.join(' ')).not.toContain('solace-play-billing');
        expect(call.slice(0, 2)).not.toEqual(['config', 'set']);
        if (call.includes('add-iam-policy-binding')) expect(call[0]).not.toBe('projects');
      }
      expect(result.state.accounts).toHaveLength(1);
      expect(result.state.accounts[0].email).toBe(expected.pushEmail);
      expect(result.state.topics).toHaveLength(1);
      expect(result.state.topics[0].name).toBe(expected.topic);
      expect(result.state.subscriptions[0]).toMatchObject({
        name: expected.subscription,
        topic: expected.topic,
        ackDeadlineSeconds: 60,
        expirationPolicy: {},
        pushConfig: {
          pushEndpoint: expected.endpoint,
          oidcToken: { serviceAccountEmail: expected.pushEmail, audience: expected.endpoint },
        },
      });
      expect(result.state.topicPolicy.bindings).toContainEqual(beforeTopic);
      expect(result.state.accountPolicy.bindings).toContainEqual(beforeAccount);
      expect(result.state.topicPolicy.bindings).toContainEqual({
        role: 'roles/pubsub.publisher',
        members: [expected.publisher],
      });
      expect(result.state.accountPolicy.bindings).toContainEqual({
        role: 'roles/iam.serviceAccountTokenCreator',
        members: [expected.tokenCreator],
      });
    });
    it('verifies existing matching resources without mutation', () => {
      const result = fixture(true).run(['--verify']);
      expect(result.status, result.stderr).toBe(0);
      expect(result.state.changes).toBe(0);
      expect(
        result.calls.some(
          (call) =>
            call.includes('create') ||
            call.includes('enable') ||
            call.includes('add-iam-policy-binding'),
        ),
      ).toBe(false);
    });
    it('waits for a new push identity to become visible without repeating creation', () => {
      const test = fixture();
      test.state.accountVisibilityDelay = 1;
      test.save();
      const result = test.run(['--apply']);
      expect(result.status, result.stderr).toBe(0);
      expect(
        result.calls.filter((call) => call.slice(0, 3).join(' ') === 'iam service-accounts create'),
      ).toHaveLength(1);
      expect(result.state.accountVisibilityDelay).toBe(0);
    });
    it('does not retry a denied account read as eventual-consistency propagation', () => {
      const test = fixture();
      test.state.failAccountReadAfterCreate = true;
      test.save();
      const result = test.run(['--apply']);
      expect(result.status).not.toBe(0);
      expect(
        result.calls.filter((call) => call.slice(0, 3).join(' ') === 'iam service-accounts list'),
      ).toHaveLength(2);
      expect(result.calls.some((call) => call.includes('add-iam-policy-binding'))).toBe(false);
    });
    it('reuses matching resources and IAM policies on repeated apply', () => {
      const result = fixture(true).run(['--apply']);
      expect(result.status, result.stderr).toBe(0);
      expect(result.state.changes).toBe(0);
      expect(result.calls.some((call) => call.includes('add-iam-policy-binding'))).toBe(false);
      expect(
        result.calls.some((call) => ['iam', 'pubsub'].includes(call[0]) && call.includes('create')),
      ).toBe(false);
    });
    it('refuses missing configuration during verify without creating it', () => {
      const result = fixture().run(['--verify']);
      expect(result.status).not.toBe(0);
      expect(result.state.changes).toBe(0);
    });
    it.each(['endpoint', 'audience', 'topic', 'sender', 'wrapper', 'expiration', 'filter'])(
      'preserves a conflicting subscription %s instead of updating it',
      (kind) => {
        const test = fixture(true);
        const subscription = test.state.subscriptions[0] as Record<string, unknown>;
        const push = subscription.pushConfig as {
          pushEndpoint: string;
          oidcToken: { audience: string; serviceAccountEmail: string };
          noWrapper?: unknown;
        };
        if (kind === 'endpoint') push.pushEndpoint = 'https://unrelated.invalid/hook';
        if (kind === 'audience') push.oidcToken.audience = 'https://unrelated.invalid/audience';
        if (kind === 'topic') subscription.topic = 'projects/ennearock-web/topics/unrelated-topic';
        if (kind === 'sender')
          push.oidcToken.serviceAccountEmail = 'other@ennearock-web.iam.gserviceaccount.com';
        if (kind === 'wrapper') push.noWrapper = {};
        if (kind === 'expiration') subscription.expirationPolicy = { ttl: '86400s' };
        if (kind === 'filter') subscription.filter = 'attributes.environment = "other"';
        test.save();
        const result = test.run(['--apply']);
        expect(result.status).not.toBe(0);
        expect(result.state.changes).toBe(0);
        expect(
          result.calls.some(
            (call) =>
              call.includes('update') ||
              call.includes('modify-push-config') ||
              call.includes('delete'),
          ),
        ).toBe(false);
      },
    );
    it('refuses a disabled push identity without replacing it', () => {
      const test = fixture(true);
      test.state.accounts[0].disabled = true;
      test.save();
      const result = test.run(['--apply']);
      expect(result.status).not.toBe(0);
      expect(result.state.changes).toBe(0);
    });
    it.each(['projectId', 'lifecycleState'])(
      'rejects wrong project %s before resource changes',
      (key) => {
        const test = fixture(true);
        test.state.project[key as 'projectId' | 'lifecycleState'] =
          key === 'projectId' ? 'unrelated-project' : 'DELETE_REQUESTED';
        test.save();
        const result = test.run(['--apply']);
        expect(result.status).not.toBe(0);
        expect(result.state.changes).toBe(0);
      },
    );
    it('does not treat a provider permission failure as a missing resource', () => {
      const test = fixture(true);
      test.state.failure = 'pubsub topics list';
      test.save();
      const result = test.run(['--apply']);
      expect(result.status).not.toBe(0);
      expect(result.state.changes).toBe(0);
      expect(result.calls.some((call) => call[0] === 'pubsub' && call.includes('create'))).toBe(
        false,
      );
      expect(result.stdout + result.stderr).not.toContain('PRIVATE_PROVIDER_DIAGNOSTIC');
    });
    it('refuses conditional publisher grants rather than broadening them', () => {
      const test = fixture(true);
      const binding = test.state.topicPolicy.bindings.find(
        (row) => row.role === 'roles/pubsub.publisher',
      )!;
      Object.assign(binding, { condition: { title: 'existing-condition', expression: 'false' } });
      test.save();
      const result = test.run(['--apply']);
      expect(result.status).not.toBe(0);
      expect(result.state.changes).toBe(0);
      expect(result.calls.some((call) => call.includes('add-iam-policy-binding'))).toBe(false);
    });
  },
);
