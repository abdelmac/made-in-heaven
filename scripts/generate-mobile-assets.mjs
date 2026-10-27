import sharp from 'sharp';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { SOLACE_MARK_PATH, SOLACE_INK, SOLACE_IVORY } from '../src/lib/brand.ts';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const android = join(root, 'android/app/src/main/res');
const ios = join(root, 'ios/App/App');

async function put(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function image({ size = 1024, foreground = false, round = false, splash = false } = {}) {
  const scale = splash ? 0.2 : foreground ? 0.46 : 0.64;
  const inset = (100 - 100 * scale) / 2;
  const background = foreground
    ? ''
    : round
      ? `<circle cx="50" cy="50" r="50" fill="${SOLACE_INK}"/>`
      : `<rect width="100" height="100" fill="${SOLACE_INK}"/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${background}<path d="${SOLACE_MARK_PATH}" transform="translate(${inset} ${inset}) scale(${scale})" fill="${SOLACE_IVORY}"/></svg>`,
  );
}

async function png(path, source, size) {
  await mkdir(dirname(path), { recursive: true });
  await sharp(source).resize(size, size).png().toFile(path);
}

// Original synthesized two-note bell; no third-party recording or music rights.
function notificationBell() {
  const rate = 44100;
  const length = Math.round(rate * 1.25);
  const data = Buffer.alloc(44 + length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(length * 2, 40);
  for (let index = 0; index < length; index++) {
    const time = index / rate;
    let value = 0;
    for (const [start, frequency] of [
      [0, 660],
      [0.35, 880],
    ]) {
      const elapsed = time - start;
      if (elapsed < 0) continue;
      const attack = Math.min(1, elapsed / 0.008);
      const release = Math.min(1, Math.max(0, (1.25 - time) / 0.07));
      value +=
        Math.sin(2 * Math.PI * frequency * elapsed) *
        attack *
        Math.exp(-5 * elapsed) *
        release *
        0.22;
    }
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2);
  }
  return data;
}

const icon = image();
const round = image({ round: true });
const foreground = image({ foreground: true });
for (const [density, size, foregroundSize] of [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
]) {
  await png(join(android, `mipmap-${density}/ic_launcher.png`), icon, size);
  await png(join(android, `mipmap-${density}/ic_launcher_round.png`), round, size);
  await png(
    join(android, `mipmap-${density}/ic_launcher_foreground.png`),
    foreground,
    foregroundSize,
  );
}
await put(
  join(android, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${SOLACE_INK}</color></resources>\n`,
);
const statusIcon = `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="100" android:viewportHeight="100"><path android:fillColor="#FFFFFFFF" android:pathData="${SOLACE_MARK_PATH}"/></vector>\n`;
await put(join(android, 'drawable/ic_stat_solace.xml'), statusIcon);
await put(
  join(android, 'drawable/solace_splash.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="200dp" android:height="200dp" android:viewportWidth="100" android:viewportHeight="100"><group android:translateX="20" android:translateY="20" android:scaleX="0.6" android:scaleY="0.6"><path android:fillColor="${SOLACE_IVORY}" android:pathData="${SOLACE_MARK_PATH}"/></group></vector>\n`,
);

// Replace template launch assets with the same editable Solace geometry.
for (const directory of await readdir(android, { withFileTypes: true })) {
  if (!directory.isDirectory() || !directory.name.startsWith('drawable')) continue;
  const path = join(android, directory.name, 'splash.png');
  try {
    await readFile(path);
  } catch {
    continue;
  }
  await png(path, image({ splash: true }), 1024);
}
await png(join(ios, 'Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), icon, 1024);
for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await png(join(ios, 'Assets.xcassets/Splash.imageset', file), image({ splash: true }), 2732);
}
const sound = notificationBell();
await put(join(android, 'raw/solace_timer.wav'), sound);
await put(join(ios, 'solace_timer.wav'), sound);

// Xcode must include these resources in the app target, not only on disk.
const xcode = require('xcode');
const projectPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
const project = xcode.project(projectPath);
project.parseSync();
const groups = project.hash.project.objects.PBXGroup;
const appGroup = Object.entries(groups).find(
  ([, value]) => value && typeof value === 'object' && value.path === 'App',
)?.[0];
if (!appGroup) throw new Error('The generated Xcode App group was not found.');
for (const file of ['solace_timer.wav', 'PrivacyInfo.xcprivacy']) {
  if (project.hasFile(file)) continue;
  const resource = project.addFile(file, appGroup, {
    lastKnownFileType: file.endsWith('.wav') ? 'audio.wav' : 'text.plist.xml',
  });
  resource.uuid = project.generateUuid();
  project.addToPbxBuildFileSection(resource);
  project.addToPbxResourcesBuildPhase(resource);
}
await writeFile(projectPath, project.writeSync());
console.log('Generated branded Android/iOS icons, launch assets and the original timer sound.');
