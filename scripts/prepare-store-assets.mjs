import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { SOLACE_MARK_PATH, SOLACE_INK, SOLACE_IVORY } from '../src/lib/brand.ts';

// Marketing artwork only. This never edits native assets or creates screenshots.
const root = resolve(import.meta.dirname, '..');
const output = join(root, '.local/exports/store-assets');
const require = createRequire(import.meta.url);
const fontSource = require.resolve('@fontsource/manrope/files/manrope-latin-500-normal.woff');
const font = join(root, '.local/store-assets/manrope-medium.ttf');
const appleSource = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const caption = 'Un temps pour se concentrer.';
await mkdir(output, { recursive: true });

// Confine the font renderer's cache to this workspace as well as its outputs.
const fontCache = join(root, '.local/store-assets/font-cache');
await mkdir(fontCache, { recursive: true });
const fontConfig = join(root, '.local/store-assets/fontconfig.conf');
const xml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
await writeFile(
  fontConfig,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><cachedir>${xml(fontCache.replaceAll('\\', '/'))}</cachedir></fontconfig>`,
);
// Fontconfig on Windows reads its environment when the native runtime starts.
if (process.env.FONTCONFIG_FILE !== fontConfig) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, FONTCONFIG_FILE: fontConfig },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const { default: sharp } = await import('sharp');

// Pango's Windows loader needs sfnt rather than WOFF. Unwrap the app's existing
// licensed font locally; the glyphs and metrics remain unchanged. No download.
function unwrapWoff(source) {
  if (source.readUInt32BE(0) !== 0x774f4646 || source.length !== source.readUInt32BE(8)) {
    throw new Error('Expected the installed Manrope WOFF font.');
  }
  const count = source.readUInt16BE(12);
  const length = source.readUInt32BE(16);
  if (!count || count > 256 || length > 16 * 1024 * 1024) {
    throw new Error('Unexpected font table dimensions.');
  }
  const result = Buffer.alloc(length);
  const power = Math.floor(Math.log2(count));
  result.writeUInt32BE(source.readUInt32BE(4), 0);
  result.writeUInt16BE(count, 4);
  result.writeUInt16BE(16 * 2 ** power, 6);
  result.writeUInt16BE(power, 8);
  result.writeUInt16BE(16 * count - 16 * 2 ** power, 10);
  let offset = 12 + 16 * count;
  let head;
  for (let index = 0; index < count; index++) {
    const entry = 44 + 20 * index;
    const start = source.readUInt32BE(entry + 4);
    const compressed = source.readUInt32BE(entry + 8);
    const original = source.readUInt32BE(entry + 12);
    if (start + compressed > source.length || offset + original > result.length) {
      throw new Error('Invalid WOFF table bounds.');
    }
    const bytes = source.subarray(start, start + compressed);
    const table = compressed < original ? inflateSync(bytes, { maxOutputLength: original }) : bytes;
    if (table.length !== original) throw new Error('Invalid WOFF table length.');
    const target = 12 + 16 * index;
    source.copy(result, target, entry, entry + 4);
    result.writeUInt32BE(source.readUInt32BE(entry + 16), target + 4);
    result.writeUInt32BE(offset, target + 8);
    result.writeUInt32BE(original, target + 12);
    table.copy(result, offset);
    if (source.toString('ascii', entry, entry + 4) === 'head') head = offset;
    offset += Math.ceil(original / 4) * 4;
  }
  if (head === undefined || offset !== result.length) throw new Error('Invalid sfnt font layout.');
  result.writeUInt32BE(0, head + 8);
  let sum = 0;
  for (let index = 0; index < result.length; index += 4) {
    sum = (sum + result.readUInt32BE(index)) >>> 0;
  }
  result.writeUInt32BE((0xb1b0afba - sum) >>> 0, head + 8);
  return result;
}
await writeFile(font, unwrapWoff(await readFile(fontSource)));

const svg = (width, height, contents) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${contents}</svg>`,
  );
const mark = (x, y, size, color) =>
  `<path d="${SOLACE_MARK_PATH}" transform="translate(${x} ${y}) scale(${size / 100})" fill="${color}"/>`;

const playIcon = join(output, 'google-play-icon-512.png');
await sharp(
  svg(
    512,
    512,
    `<rect width="512" height="512" fill="${SOLACE_INK}"/>${mark(92, 92, 328, SOLACE_IVORY)}`,
  ),
)
  .ensureAlpha()
  .withIccProfile('srgb')
  .png({ compressionLevel: 9, palette: false })
  .toFile(playIcon);

const appleIcon = join(output, 'app-store-icon-1024.png');
const sourceMetadata = await sharp(appleSource).metadata();
if (sourceMetadata.width !== 1024 || sourceMetadata.height !== 1024) {
  throw new Error('The original Apple icon must already be 1024 × 1024.');
}
if (!(await sharp(appleSource).stats()).isOpaque) {
  throw new Error('The primary Apple icon contains transparent pixels; review its source artwork.');
}
await sharp(appleSource)
  .removeAlpha()
  .withIccProfile('srgb')
  .png({ compressionLevel: 9, palette: false })
  .toFile(appleIcon);

async function textLayer(value, size) {
  // Use the app's installed, licensed Manrope font, not a machine fallback.
  return sharp({
    text: {
      text: `<span foreground="${SOLACE_INK}">${value}</span>`,
      font: `Manrope Medium ${size}`,
      fontfile: font,
      dpi: 144,
      rgba: true,
    },
  })
    .resize({ height: size, withoutEnlargement: false })
    .png()
    .toBuffer();
}

const name = await textLayer('Solace', 86);
const subtitle = await textLayer(caption, 25);
const feature = join(output, 'google-play-feature-fr-1024x500.png');
await sharp(
  svg(
    1024,
    500,
    `<rect width="1024" height="500" fill="${SOLACE_IVORY}"/>${mark(220, 164, 172, SOLACE_INK)}`,
  ),
)
  .composite([
    { input: name, left: 436, top: 174 },
    { input: subtitle, left: 440, top: 294 },
  ])
  .removeAlpha()
  .withIccProfile('srgb')
  .png({ compressionLevel: 9, palette: false })
  .toFile(feature);

async function verify(path, width, height, alpha) {
  const metadata = await sharp(path).metadata();
  const bytes = await readFile(path);
  if (
    metadata.format !== 'png' ||
    metadata.width !== width ||
    metadata.height !== height ||
    metadata.depth !== 'uchar' ||
    metadata.hasAlpha !== alpha ||
    metadata.channels !== (alpha ? 4 : 3) ||
    metadata.space !== 'srgb' ||
    !metadata.hasProfile ||
    !(await sharp(path).stats()).isOpaque
  ) {
    throw new Error(`Store artwork failed its PNG checks: ${relative(root, path)}`);
  }
  return {
    path: relative(root, path).replaceAll('\\', '/'),
    width,
    height,
    channels: metadata.channels,
    alphaChannel: alpha,
    colorSpace: metadata.space,
    embeddedColorProfile: true,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

const assets = await Promise.all([
  verify(playIcon, 512, 512, true),
  verify(feature, 1024, 500, false),
  verify(appleIcon, 1024, 1024, false),
]);
if (assets[0].bytes > 1024 * 1024) throw new Error('The Play icon exceeds 1024 KB.');
const sourcePixels = await sharp(appleSource).removeAlpha().raw().toBuffer();
const exportedPixels = await sharp(appleIcon).raw().toBuffer();
if (!sourcePixels.equals(exportedPixels))
  throw new Error('Apple export changed the original RGB pixels.');
const report = {
  brandSource: 'src/lib/brand.ts',
  appleSource: relative(root, appleSource).replaceAll('\\', '/'),
  appleRgbPixelsUnchanged: true,
  typography: '@fontsource/manrope, existing app dependency (SIL Open Font License)',
  featureLanguage: 'fr-FR',
  featureCaption: caption,
  featureAltText: 'Logo Solace et texte « Un temps pour se concentrer. » sur fond ivoire.',
  screenshotsIncluded: false,
  publicationStatus: 'not-submitted',
  assets,
};
await writeFile(join(output, 'assets.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
