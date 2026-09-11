import sharp from 'sharp';

// The SVG is the editable source; render installation assets reproducibly.
await Promise.all(
  [192, 512].map((size) =>
    sharp('public/icons/folia.svg')
      .resize(size, size)
      .png()
      .toFile(`public/icons/icon-${size}.png`),
  ),
);
const foreground = await sharp('public/icons/folia.svg').resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#254c3c' } })
  .composite([{ input: foreground, gravity: 'center' }])
  .png()
  .toFile('public/icons/icon-maskable-512.png');
