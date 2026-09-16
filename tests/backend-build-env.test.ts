import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { invalidSupabaseVariables } from '../scripts/validate-env.mjs';

const ref = 'abcdefghijklmnopqrst';
const url = `https://${ref}.supabase.co`;
const publicName = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const fallbackName = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const serverName = 'SUPABASE_SERVICE_ROLE_KEY';
const publishable = `sb_publishable_${'A'.repeat(32)}`;
const secret = `sb_secret_${'B'.repeat(32)}`;
const directories: string[] = [];

function jwt(role: string, project = ref) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', role, ref: project })).toString(
    'base64url',
  );
  const body = `${header}.${payload}`;
  return `${body}.${createHmac('sha256', 'synthetic-test-signing-key').update(body).digest('base64url')}`;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('prebuild Supabase credential exposure guard', () => {
  it('allows local demo and empty optional cloud variables', () => {
    expect(invalidSupabaseVariables({})).toEqual([]);
    expect(
      invalidSupabaseVariables({ [publicName]: '', [fallbackName]: '', [serverName]: '' }),
    ).toEqual([]);
  });

  it('accepts modern public and server keys in their designated variables', () => {
    expect(
      invalidSupabaseVariables({
        NEXT_PUBLIC_SUPABASE_URL: url,
        [publicName]: publishable,
        [fallbackName]: publishable,
        [serverName]: secret,
      }),
    ).toEqual([]);
  });

  it('accepts single legacy keys with the expected role and project reference', () => {
    expect(
      invalidSupabaseVariables({
        NEXT_PUBLIC_SUPABASE_URL: url,
        [publicName]: jwt('anon'),
        [fallbackName]: jwt('anon'),
        [serverName]: jwt('service_role'),
      }),
    ).toEqual([]);
    expect(invalidSupabaseVariables({ [fallbackName]: jwt('anon') })).toEqual([]);
  });

  it.each([publicName, fallbackName])('rejects privileged or combined keys in %s', (name) => {
    for (const value of [
      secret,
      jwt('service_role'),
      jwt('authenticated'),
      `${jwt('anon')} ${jwt('service_role')}`,
      `${publishable}\n${secret}`,
      `${publishable},${secret}`,
      `${publishable}${secret}`,
      JSON.stringify([publishable, secret]),
      ` ${publishable}`,
      `${publishable}\n`,
      '   ',
    ]) {
      expect(invalidSupabaseVariables({ [name]: value })).toEqual([name]);
    }
  });

  it('checks the fallback even when a valid preferred public key is present', () => {
    expect(invalidSupabaseVariables({ [publicName]: publishable, [fallbackName]: secret })).toEqual(
      [fallbackName],
    );
  });

  it('rejects wrong-project legacy public and server keys', () => {
    expect(
      invalidSupabaseVariables({
        NEXT_PUBLIC_SUPABASE_URL: url,
        [publicName]: jwt('anon', 'otherproject'),
        [serverName]: jwt('service_role', 'otherproject'),
      }),
    ).toEqual([publicName, serverName]);
  });

  it('rejects public keys in the server-only setting and malformed JWTs', () => {
    expect(invalidSupabaseVariables({ [serverName]: publishable })).toEqual([serverName]);
    expect(invalidSupabaseVariables({ [serverName]: jwt('anon') })).toEqual([serverName]);
    for (const value of [
      'eyJ.invalid.payload',
      `${jwt('anon')}.${jwt('anon')}`,
      'sb_publishable_...',
      `${jwt('anon')}extra`,
    ]) {
      expect(invalidSupabaseVariables({ [publicName]: value })).toEqual([publicName]);
    }
  });

  it('reports variable names only, including a malformed project URL', () => {
    const invalid = invalidSupabaseVariables({
      NEXT_PUBLIC_SUPABASE_URL: `https://user:${secret}@example.com`,
      [publicName]: secret,
    });
    expect(invalid).toEqual(['NEXT_PUBLIC_SUPABASE_URL', publicName]);
    expect(JSON.stringify(invalid)).not.toContain(secret);
  });

  it('blocks unsafe production dotenv values before the build without logging their contents', () => {
    const directory = mkdtempSync(join(tmpdir(), 'folia-build-env-'));
    directories.push(directory);
    writeFileSync(
      join(directory, '.env.production.local'),
      `${publicName}="${jwt('anon')} ${jwt('service_role')}"\n`,
    );
    const result = spawnSync(process.execPath, [resolve('scripts/validate-env.mjs')], {
      cwd: directory,
      env: { NODE_ENV: 'production', SystemRoot: process.env.SystemRoot },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe(`Invalid Supabase environment: ${publicName}.`);
    expect(result.stdout + result.stderr).not.toContain(jwt('service_role'));
    expect(result.stdout + result.stderr).not.toContain(jwt('anon'));
  });

  it('honors process environment precedence over production dotenv', () => {
    const directory = mkdtempSync(join(tmpdir(), 'folia-build-env-'));
    directories.push(directory);
    writeFileSync(join(directory, '.env.production.local'), `${publicName}=${secret}\n`);
    const result = spawnSync(process.execPath, [resolve('scripts/validate-env.mjs')], {
      cwd: directory,
      env: {
        NODE_ENV: 'production',
        SystemRoot: process.env.SystemRoot,
        [publicName]: publishable,
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('Supabase environment validation passed.');
    expect(result.stdout + result.stderr).not.toContain(secret);
  });
});
