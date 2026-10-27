import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import nextEnvironment from '@next/env';
import { loadMobilePublicEnvironment } from './mobile-public-env.mjs';

nextEnvironment.loadEnvConfig(process.cwd());
loadMobilePublicEnvironment(process.cwd());
const checked = spawnSync(process.execPath, ['scripts/validate-env.mjs'], { stdio: 'inherit' });
if (checked.status !== 0) process.exit(checked.status ?? 1);

const origin = new URL(process.env.SOLACE_MOBILE_API_ORIGIN || 'https://www.solace-pomodoro.com');
if (
  origin.protocol !== 'https:' ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
) {
  throw new Error('SOLACE_MOBILE_API_ORIGIN must be an HTTPS origin without a path.');
}
const result = spawnSync(
  process.execPath,
  [resolve('node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.mobile.config.mts'],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
