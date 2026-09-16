import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { SOLACE_MARK_PATH, SOLACE_INK, SOLACE_IVORY } from '../src/lib/brand.ts';

// Render every branded asset from the same editable geometry as the React mark.
const icon = (
  maskable = false,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" ${maskable ? '' : 'rx="112"'} fill="${SOLACE_INK}"/>
  <path d="${SOLACE_MARK_PATH}" transform="translate(92 92) scale(3.28)" fill="${SOLACE_IVORY}"/>
</svg>\n`;
const source = icon();
await writeFile('public/icons/solace.svg', source);
await writeFile(
  'public/icons/solace-mark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${SOLACE_MARK_PATH}" fill="${SOLACE_INK}"/></svg>\n`,
);
await Promise.all(
  [180, 192, 512].map((size) =>
    sharp(Buffer.from(source)).resize(size, size).png().toFile(`public/icons/solace-${size}.png`),
  ),
);
// All foreground points stay inside the central maskable safe circle.
await sharp(Buffer.from(icon(true)))
  .png()
  .toFile('public/icons/solace-maskable-512.png');
