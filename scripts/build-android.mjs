import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectMobileChecks, printMobileChecks, projectRoot } from './check-mobile.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run mobile:apk -- [--skip-sync]');
  console.log('Builds an installable Android debug APK. --skip-sync reuses already-synced assets.');
  process.exit(0);
}
if (args.some((arg) => arg !== '--skip-sync')) {
  console.error(
    'Only --skip-sync is supported. Store signing and release bundles are a later step.',
  );
  process.exit(1);
}

function run(command, commandArgs, options) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  const checks = printMobileChecks(collectMobileChecks());
  if (!checks.ready) process.exit(1);
  const { tools } = checks;
  const androidRoot = join(projectRoot, 'android');
  const toolRoot = join(projectRoot, '.local', 'mobile-tools');
  const env = {
    ...process.env,
    ANDROID_HOME: tools.sdkRoot,
    ANDROID_SDK_ROOT: tools.sdkRoot,
    ANDROID_USER_HOME: join(toolRoot, 'android-user-home'),
    GRADLE_USER_HOME: join(toolRoot, 'gradle-user-home'),
    ...(tools.javaHome ? { JAVA_HOME: tools.javaHome } : {}),
  };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = [
    ...(tools.javaHome ? [join(tools.javaHome, 'bin')] : []),
    join(tools.sdkRoot, 'platform-tools'),
    env[pathKey] || '',
  ].join(delimiter);
  mkdirSync(env.ANDROID_USER_HOME, { recursive: true });
  mkdirSync(env.GRADLE_USER_HOME, { recursive: true });

  if (!args.includes('--skip-sync')) {
    console.log('Building the mobile interface and syncing native plugins…');
    run(process.execPath, ['scripts/build-mobile.mjs'], { cwd: projectRoot, env });
    run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync'], {
      cwd: projectRoot,
      env,
    });
  }
  if (!existsSync(join(androidRoot, 'app', 'src', 'main', 'assets', 'public', 'index.html'))) {
    throw new Error(
      'Android web assets are missing. Run npm run mobile:sync before using --skip-sync.',
    );
  }
  // Java properties accepts forward slashes on Windows, avoiding backslash escapes.
  const sdkPath = tools.sdkRoot.replace(/\\/g, '/').replace(/([:=#!])/g, '\\$1');
  writeFileSync(
    join(androidRoot, 'local.properties'),
    `# Generated locally by scripts/build-android.mjs; do not commit.\nsdk.dir=${sdkPath}\n`,
    'utf8',
  );

  console.log('Compiling the Android debug APK…');
  run(
    tools.javaCommand,
    [
      '-classpath',
      join(androidRoot, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
      'org.gradle.wrapper.GradleWrapperMain',
      '--no-daemon',
      'assembleDebug',
    ],
    { cwd: androidRoot, env },
  );
  const apk = join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!existsSync(apk))
    throw new Error('Gradle finished without producing the expected debug APK.');
  const exportedApk = resolve(projectRoot, '.local', 'exports', 'solace-debug.apk');
  mkdirSync(dirname(exportedApk), { recursive: true });
  copyFileSync(apk, exportedApk);
  console.log(`Debug APK: ${apk}`);
  console.log(`Shareable test copy: ${exportedApk}`);
  console.log('This debug build is for device testing. It is not a signed Google Play release.');
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'The Android build could not be completed.',
  );
  process.exitCode = 1;
}
