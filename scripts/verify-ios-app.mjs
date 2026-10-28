import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Usage on macOS: node scripts/verify-ios-app.mjs --app /absolute/Payload/App.app --version 1.0.0 --build 1',
  );
  console.log(
    'Read-only checks of an exported distribution app; does not archive, sign, upload or access account credentials.',
  );
  process.exit(0);
}
const options = { app: '', version: '', build: '' };
for (let index = 0; index < args.length; index++) {
  const name = args[index].replace(/^--/, '');
  if (!Object.hasOwn(options, name))
    throw new Error('Supported options are --app, --version and --build.');
  options[name] = args[++index] || '';
}

function run(command, commandArgs, input) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', input, timeout: 30_000 });
  if (result.error || result.status !== 0)
    throw new Error(
      `Local ${command} verification failed. Use Xcode Organizer to inspect the distribution artifact.`,
    );
  return result.stdout;
}
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function plist(path) {
  return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path]));
}

try {
  requireValue(
    process.platform === 'darwin',
    'An actual iOS distribution app and macOS codesign/plutil tools are required. Windows cannot validate an iOS binary.',
  );
  requireValue(
    isAbsolute(options.app) && options.app.endsWith('.app'),
    'Provide an absolute --app path to the exported .app directory.',
  );
  requireValue(
    /^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(options.version),
    'Provide the expected --version, for example 1.0.0.',
  );
  requireValue(
    /^[1-9][0-9]*$/.test(options.build),
    'Provide the expected positive --build number.',
  );
  const app = realpathSync(options.app);
  const info = plist(join(app, 'Info.plist'));
  requireValue(
    info.CFBundleIdentifier === 'com.solace.pomodoro',
    'The app has another bundle identifier.',
  );
  requireValue(
    info.CFBundleShortVersionString === options.version && info.CFBundleVersion === options.build,
    'The app version/build differ from the expected release.',
  );
  requireValue(
    info.CFBundleSupportedPlatforms?.includes('iPhoneOS'),
    'A simulator build cannot be submitted to App Store Connect.',
  );
  requireValue(
    Number(info.MinimumOSVersion?.split('.')[0]) >= 15,
    'The app must preserve its supported iOS 15+ minimum.',
  );
  requireValue(
    Number(info.DTSDKName?.match(/^iphoneos([0-9]+)/)?.[1]) >= 26 && Number(info.DTXcode) >= 2600,
    'The distribution app must use Xcode 26+ and the iOS 26+ SDK.',
  );
  requireValue(
    existsSync(join(app, 'embedded.mobileprovision')),
    'The exported distribution provisioning profile is missing.',
  );
  requireValue(
    existsSync(join(app, 'public', 'index.html')),
    'The bundled mobile interface is missing.',
  );
  const privacy = plist(join(app, 'PrivacyInfo.xcprivacy'));
  requireValue(
    privacy.NSPrivacyTracking === false,
    'Unexpected tracking declaration; review the archived privacy report.',
  );
  const config = JSON.parse(readFileSync(join(app, 'capacitor.config.json'), 'utf8'));
  requireValue(
    config.appId === 'com.solace.pomodoro' &&
      config.plugins?.NativePurchases?.autoFinishTransactions === false &&
      config.plugins.NativePurchases.debugLogging === false,
    'The archived NativePurchases configuration is missing or unsafe.',
  );
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const entitlements = run('/usr/bin/codesign', ['--display', '--entitlements', ':-', app]);
  const start = entitlements.indexOf('<?xml');
  requireValue(start >= 0, 'The distribution signing entitlements could not be read.');
  const decoded = JSON.parse(
    run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], entitlements.slice(start)),
  );
  requireValue(
    decoded['get-task-allow'] !== true,
    'The app permits debugger attachment. Inspect the exported distribution app, not a development build.',
  );
  requireValue(
    decoded['application-identifier']?.endsWith('.com.solace.pomodoro') &&
      typeof decoded['com.apple.developer.team-identifier'] === 'string',
    'The app signing identity does not match its bundle.',
  );
  console.log(
    JSON.stringify(
      {
        applicationId: info.CFBundleIdentifier,
        version: info.CFBundleShortVersionString,
        build: info.CFBundleVersion,
        minimumOS: info.MinimumOSVersion,
        sdk: info.DTSDKName,
        xcode: info.DTXcode,
        signatureVerified: true,
        debuggingAllowed: false,
        nativePurchaseAutoFinish: false,
        publicationStatus: 'not-submitted-by-this-script',
      },
      null,
      2,
    ),
  );
  console.log(
    'Local distribution checks passed. Xcode Organizer validation, TestFlight and App Review are separate steps.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local iOS verification failed.');
  process.exitCode = 1;
}
