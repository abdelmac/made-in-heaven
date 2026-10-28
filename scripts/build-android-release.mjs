import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectMobileChecks, printMobileChecks, projectRoot } from './check-mobile.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Usage: node scripts/build-android-release.mjs --version-code 1 --version-name 1.0.0 [--signed] [--store-billing] [--apk] [--skip-sync]',
  );
  console.log(
    'Unsigned by default. Use scripts/android-release-signing.ps1 for protected local upload-key signing.',
  );
  process.exit(0);
}
const options = {
  signed: false,
  storeBilling: false,
  apk: false,
  skipSync: false,
  versionCode: '',
  versionName: '',
};
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--signed') options.signed = true;
  else if (arg === '--store-billing') options.storeBilling = true;
  else if (arg === '--apk') options.apk = true;
  else if (arg === '--skip-sync') options.skipSync = true;
  else if (arg === '--version-code') options.versionCode = args[++index] || '';
  else if (arg === '--version-name') options.versionName = args[++index] || '';
  else throw new Error(`Unsupported release option: ${arg}`);
}
if (!/^[1-9][0-9]*$/.test(options.versionCode) || Number(options.versionCode) > 2_100_000_000)
  throw new Error(
    'Provide --version-code between 1 and 2100000000; increase it for every Play upload.',
  );
if (!/^[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-+][A-Za-z0-9.-]+)?$/.test(options.versionName))
  throw new Error('Provide --version-name as a numeric release version, for example 1.0.0.');
if (options.apk && !options.signed)
  throw new Error('The optional release APK requires --signed and the selected upload key.');

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    windowsHide: true,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Release tool failed (exit ${result.status ?? 'unknown'}).`);
  return result;
}
function findJar(directory, prefix) {
  if (!existsSync(directory)) return null;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findJar(path, prefix);
      if (found) return found;
    } else if (entry.name.startsWith(prefix) && entry.name.endsWith('.jar')) return path;
  }
  return null;
}

try {
  const checks = printMobileChecks(collectMobileChecks());
  if (!checks.ready) throw new Error('Android release prerequisites are unavailable.');
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
  const signingNames = ['STORE_FILE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'];
  if (options.signed) {
    if (signingNames.some((name) => !env[`SOLACE_ANDROID_${name}`]))
      throw new Error(
        'Use the protected signing wrapper or provide every signing environment value.',
      );
    if (!existsSync(env.SOLACE_ANDROID_STORE_FILE))
      throw new Error('The selected upload keystore does not exist.');
    env.SOLACE_ANDROID_SIGN_RELEASE = '1';
  } else {
    delete env.SOLACE_ANDROID_SIGN_RELEASE;
    for (const name of signingNames) delete env[`SOLACE_ANDROID_${name}`];
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = [
    ...(tools.javaHome ? [join(tools.javaHome, 'bin')] : []),
    env[pathKey] || '',
  ].join(delimiter);
  mkdirSync(env.ANDROID_USER_HOME, { recursive: true });
  mkdirSync(env.GRADLE_USER_HOME, { recursive: true });
  // Only Gradle needs upload-key passwords. Asset bundling, plugin sync and
  // artifact inspection receive no signing credentials in their environment.
  const inspectionEnv = { ...env };
  delete inspectionEnv.SOLACE_ANDROID_SIGN_RELEASE;
  for (const name of signingNames) delete inspectionEnv[`SOLACE_ANDROID_${name}`];
  if (!options.skipSync) {
    run(process.execPath, ['scripts/build-mobile.mjs'], { cwd: projectRoot, env: inspectionEnv });
    run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], {
      cwd: projectRoot,
      env: inspectionEnv,
    });
  }
  if (!existsSync(join(androidRoot, 'app', 'src', 'main', 'assets', 'public', 'index.html')))
    throw new Error('Android assets are missing. Run a release build without --skip-sync.');
  const sdkPath = tools.sdkRoot.replace(/\\/g, '/').replace(/([:=#!])/g, '\\$1');
  writeFileSync(
    join(androidRoot, 'local.properties'),
    `# Generated locally; do not commit.\nsdk.dir=${sdkPath}\n`,
  );
  // No daemon/configuration cache may retain this build's signing environment.
  run(
    tools.javaCommand,
    [
      '-classpath',
      join(androidRoot, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
      'org.gradle.wrapper.GradleWrapperMain',
      '--no-daemon',
      '--no-configuration-cache',
      `-PsolaceVersionCode=${options.versionCode}`,
      `-PsolaceVersionName=${options.versionName}`,
      'bundleRelease',
      ...(options.apk ? ['assembleRelease'] : []),
    ],
    { cwd: androidRoot, env },
  );
  const bundle = join(
    androidRoot,
    'app',
    'build',
    'outputs',
    'bundle',
    'release',
    'app-release.aab',
  );
  if (!existsSync(bundle)) throw new Error('Gradle did not produce the expected release bundle.');
  const commandLineLib = join(tools.sdkRoot, 'cmdline-tools', 'latest', 'lib');
  const proto = findJar(commandLineLib, 'aapt2-proto');
  const protobuf = findJar(commandLineLib, 'protobuf-java-');
  if (!proto || !protobuf)
    throw new Error(
      'Android command-line protobuf tools are required to inspect the actual AAB manifest.',
    );
  const inspection = run(
    tools.javaCommand,
    [
      '--class-path',
      [proto, protobuf].join(delimiter),
      join(projectRoot, 'scripts', 'android', 'VerifyBundle.java'),
      bundle,
      options.versionCode,
      options.versionName,
      options.signed ? 'signed' : 'unsigned',
      options.storeBilling ? 'store-billing' : 'no-billing',
    ],
    { cwd: projectRoot, env: inspectionEnv, stdio: 'pipe', encoding: 'utf8' },
  );
  const metadata = JSON.parse(inspection.stdout.trim());
  const exported = resolve(
    projectRoot,
    '.local',
    'exports',
    `solace-${options.versionName}-${options.versionCode}-${options.signed ? 'signed' : 'unsigned'}.aab`,
  );
  mkdirSync(dirname(exported), { recursive: true });
  copyFileSync(bundle, exported);
  const report = {
    ...metadata,
    bytes: statSync(exported).size,
    sha256: createHash('sha256').update(readFileSync(exported)).digest('hex'),
    builtAt: new Date().toISOString(),
    artifact: exported,
    publicationStatus: 'not-submitted',
  };
  if (options.apk) {
    const apk = join(androidRoot, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    if (!existsSync(apk))
      throw new Error('Gradle did not produce the expected signed release APK.');
    const signature = run(
      tools.javaCommand,
      [
        '-jar',
        join(tools.buildTools, 'lib', 'apksigner.jar'),
        'verify',
        '--verbose',
        '--print-certs',
        apk,
      ],
      { env: inspectionEnv, stdio: 'pipe', encoding: 'utf8' },
    ).stdout;
    const apkCertificate = signature
      .match(/Signer #1 certificate SHA-256 digest: ([0-9a-f]+)/i)?.[1]
      ?.toLowerCase();
    if (
      !/Verified using v2 scheme.*: true/.test(signature) ||
      apkCertificate !== metadata.uploadCertificateSha256
    )
      throw new Error(
        'Release APK must have a valid v2 signature matching the verified AAB upload certificate.',
      );
    const aapt = join(tools.buildTools, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
    const badging = run(aapt, ['dump', 'badging', apk], {
      env: inspectionEnv,
      stdio: 'pipe',
      encoding: 'utf8',
    }).stdout;
    if (
      !badging.includes(
        `package: name='com.solace.pomodoro' versionCode='${options.versionCode}' versionName='${options.versionName}'`,
      ) ||
      badging.includes('application-debuggable') ||
      !/(?:minSdkVersion|sdkVersion):'26'/.test(badging) ||
      !badging.includes("targetSdkVersion:'36'")
    )
      throw new Error('Release APK package, version, SDK levels or debuggable state do not match.');
    const exportedApk = exported.replace(/\.aab$/, '.apk');
    copyFileSync(apk, exportedApk);
    report.apk = {
      artifact: exportedApk,
      bytes: statSync(exportedApk).size,
      sha256: createHash('sha256').update(readFileSync(exportedApk)).digest('hex'),
      signed: true,
      uploadCertificateSha256: apkCertificate,
      debuggable: false,
    };
  }
  writeFileSync(`${exported}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(
    options.signed
      ? 'Upload-key-signed bundle prepared; Play Console review, enrollment and device testing remain.'
      : 'Unsigned release bundle verified. It cannot be uploaded to Google Play.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Android release packaging failed.');
  process.exitCode = 1;
}
