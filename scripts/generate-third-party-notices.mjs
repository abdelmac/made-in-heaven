import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const notices = [
  'Solace — third-party software notices',
  '',
  'This file includes the notices shipped with installed production npm packages.',
  'The applicable licenses remain those of their respective copyright holders.',
  'Native platform dependencies may also supply notices in their distributions.',
  '',
  '@capgo/native-purchases 8.9.6 is included unmodified under MPL-2.0.',
  'Its Source Code Form is available from:',
  'https://github.com/Cap-go/capacitor-native-purchases/tree/085c482dc0b8be0c407e56b909b801164a9ba5ed',
  'Package: https://www.npmjs.com/package/@capgo/native-purchases/v/8.9.6',
  'The MPL license for that component is reproduced below. It does not change',
  'the license of separate Solace source files.',
];
let count = 0;
for (const [relative, entry] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (!relative || entry.dev || !relative.includes('node_modules/')) continue;
  const folder = resolve(root, relative);
  const manifest = resolve(folder, 'package.json');
  if (!existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  notices.push(
    '',
    '='.repeat(72),
    `${pkg.name} ${pkg.version}`,
    `License: ${pkg.license ?? entry.license ?? 'see package distribution'}`,
  );
  const files = readdirSync(folder, { withFileTypes: true })
    .filter(
      (file) => file.isFile() && /^(?:licen[cs]e|notice|copying|ofl)(?:[.-]|$)/i.test(file.name),
    )
    .map((file) => file.name)
    .sort();
  for (const name of files)
    notices.push('', name, readFileSync(resolve(folder, name), 'utf8').trim());
  count++;
}
writeFileSync(resolve(root, 'public/third-party-notices.txt'), `${notices.join('\n')}\n`);
console.log(`Generated production npm notices for ${count} installed packages.`);
