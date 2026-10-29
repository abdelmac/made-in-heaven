import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const commands = new Set(['sync', 'copy', 'update', 'open', 'run', 'build', 'add']);
const multiplePlatforms = new Set(['sync', 'copy', 'update']);

/** Each native CLI process receives one identity, including a two-platform sync. */
export function parseCapacitorInvocation(args) {
  const [command, platform, ...extra] = args;
  if (
    !commands.has(command) ||
    !['android', 'ios', 'all'].includes(platform) ||
    (platform === 'all' && !multiplePlatforms.has(command))
  ) {
    throw new Error(
      'Use <sync|copy|update|open|run|build|add> <android|ios>; all is supported only for sync/copy/update.',
    );
  }
  return { command, platforms: platform === 'all' ? ['android', 'ios'] : [platform], extra };
}

/**
 * @param {string[]} args
 * @param {{run?: (executable: string, args: string[], options: {cwd: string, env: Record<string, string | undefined>, stdio: 'inherit', windowsHide: boolean}) => {status: number | null, error?: Error}, env?: Record<string, string | undefined>, cwd?: string}} options
 */
export function runCapacitorPlatforms(
  args,
  { run = spawnSync, env = process.env, cwd = root } = {},
) {
  const { command, platforms, extra } = parseCapacitorInvocation(args);
  const cli = resolve(cwd, 'node_modules/@capacitor/cli/bin/capacitor');
  for (const platform of platforms) {
    const result = run(process.execPath, [cli, command, platform, ...extra], {
      cwd,
      env: { ...env, SOLACE_CAPACITOR_PLATFORM: platform },
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) throw new Error('The installed Capacitor CLI could not be started.');
    if (result.status !== 0)
      throw new Error(
        `Capacitor ${command} ${platform} failed (exit ${result.status ?? 'unknown'}).`,
      );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).includes('--help')) {
    console.log(
      'Usage: node scripts/capacitor-platform.mjs <command> <android|ios|all> [CLI options]',
    );
    console.log(
      'Use sync/copy/update all to run each platform separately with its own app identity.',
    );
  } else {
    try {
      runCapacitorPlatforms(process.argv.slice(2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Native platform command failed.');
      process.exitCode = 1;
    }
  }
}
