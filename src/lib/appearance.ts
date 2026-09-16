import type { Preferences } from './model';
import { contrastRatio } from './calendar';

export const classicColors = {
  green: { name: 'Garden green', color: '#2f6547' },
  blue: { name: 'Classic blue', color: '#3a6695' },
  blurple: { name: 'Blurple', color: '#5865f2' },
  plum: { name: 'Soft plum', color: '#856082' },
  rose: { name: 'Rose', color: '#ae416d' },
  cyan: { name: 'Lagoon', color: '#087c87' },
  amber: { name: 'Warm amber', color: '#92671c' },
  neutral: { name: 'Charcoal', color: '#5c626e' },
} as const;
export const backgroundPresets = {
  aurora: {
    name: 'Aurora',
    description: 'Violet, blue, and a little starlight.',
    css: 'radial-gradient(ellipse at 15% 20%, #b891fa 0%, transparent 55%), radial-gradient(ellipse at 85% 70%, #63d5d0 0%, transparent 55%), linear-gradient(135deg, #262b69, #6955a4)',
  },
  dusk: {
    name: 'Dusk',
    description: 'The warmth of a quiet evening.',
    css: 'radial-gradient(ellipse at 75% 15%, #ffc6a0 0%, transparent 65%), linear-gradient(145deg, #703e87, #db777e 60%, #eabd93)',
  },
  ocean: {
    name: 'Ocean',
    description: 'Deep blues and open space.',
    css: 'radial-gradient(ellipse at 20% 80%, #64d4d4 0%, transparent 65%), linear-gradient(130deg, #112d62, #4977a8 65%, #a7e0de)',
  },
  forest: {
    name: 'Forest',
    description: 'A soft green place to settle in.',
    css: 'radial-gradient(ellipse at 85% 25%, #d6d7a1 0%, transparent 60%), linear-gradient(135deg, #1f504d, #4f8470 60%, #a6b28d)',
  },
} as const;

function mix(first: string, second: string, amount: number) {
  return `#${[1, 3, 5]
    .map((offset) =>
      Math.round(
        parseInt(first.slice(offset, offset + 2), 16) * (1 - amount) +
          parseInt(second.slice(offset, offset + 2), 16) * amount,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
export function readableAccent(color: string, dark: boolean) {
  const surface = dark ? '#2b2d31' : '#ffffff';
  for (let step = 0; step <= 20; step++) {
    const adjusted = mix(color, dark ? '#ffffff' : '#000000', step / 20);
    if (contrastRatio(adjusted, surface) >= 4.8) return adjusted;
  }
  return dark ? '#ffffff' : '#000000';
}
function readableOn(color: string, surfaces: string[], dark: boolean) {
  for (let step = 0; step <= 40; step++) {
    const adjusted = mix(color, dark ? '#ffffff' : '#000000', step / 40);
    if (surfaces.every((surface) => contrastRatio(adjusted, surface) >= 4.8)) return adjusted;
  }
  return dark ? '#ffffff' : '#000000';
}

/** Resolve the whole palette, so no sidebar, hover or muted color leaks from an old theme. */
export function themeColors(p: Preferences, dark: boolean, theme = p.customTheme) {
  const chosen = p.accentColor || classicColors[p.accent].color;
  const background =
    theme?.background || mix(dark ? '#1e1f22' : '#ffffff', chosen, dark ? 0.08 : 0.035);
  const surface = theme?.surface || (dark ? mix('#2b2d31', chosen, 0.035) : '#ffffff');
  const text = theme?.text || (dark ? '#f2f3f5' : '#24312b');
  const surfaceSoft = mix(surface, text, 0.04);
  const sidebar = mix(surface, background, 0.55);
  const surfaces = [background, surface, surfaceSoft, sidebar];
  const darkSurface = contrastRatio('#ffffff', surface) > contrastRatio('#000000', surface);
  const accent = theme?.accent || readableOn(chosen, surfaces, darkSurface);
  const onAccent =
    contrastRatio('#ffffff', accent) >= contrastRatio('#000000', accent) ? '#ffffff' : '#000000';
  const colors: Record<string, string> = {
    background,
    surface,
    'surface-soft': surfaceSoft,
    sidebar,
    text,
    muted: readableOn(mix(text, surface, 0.32), surfaces, darkSurface),
    'secondary-text': readableOn(mix(text, surface, 0.18), surfaces, darkSurface),
    border: theme?.border || mix(surface, text, 0.16),
    accent,
    'on-accent': onAccent,
    'accent-hover': mix(accent, onAccent === '#ffffff' ? '#000000' : '#ffffff', 0.12),
    'accent-soft': mix(surface, accent, 0.1),
    sage: mix(surface, accent, 0.5),
    danger: readableOn('#a34444', surfaces, darkSurface),
    'danger-soft': mix(surface, '#a34444', 0.1),
  };
  const heatmap = theme?.heatmap || [
    mix(surface, text, 0.08),
    ...[0.25, 0.5, 0.75, 1].map((amount) => mix(surface, accent, amount)),
  ];
  heatmap.forEach((color, index) => {
    colors[`heat-${index}`] = color;
    colors[`on-heat-${index}`] =
      contrastRatio('#ffffff', color) >= contrastRatio('#000000', color) ? '#ffffff' : '#000000';
  });
  return colors;
}

export function applyThemeColors(p: Preferences, theme = p.customTheme) {
  const root = document.documentElement;
  const colors = themeColors(p, root.dataset.theme === 'dark', theme);
  for (const [key, value] of Object.entries(colors)) root.style.setProperty(`--${key}`, value);
  root.style.colorScheme =
    contrastRatio('#ffffff', colors.background) > contrastRatio('#000000', colors.background)
      ? 'dark'
      : 'light';
}
export function backgroundCss(background: Preferences['background']) {
  if (background.kind === 'preset') return backgroundPresets[background.preset].css;
  if (background.kind === 'image' && background.image) return `url("${background.image}")`;
  return 'none';
}
export function applyBackground(background: Preferences['background']) {
  const root = document.documentElement;
  root.dataset.backdrop = background.kind;
  root.style.setProperty('--personal-background', backgroundCss(background));
  root.style.setProperty('--background-overlay', `${background.overlay}%`);
  root.style.setProperty('--background-blur', `${background.blur}px`);
}

export async function prepareBackgroundImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const source = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = source;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    )
      throw new Error('Choose an image smaller than 40 megapixels.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare your image.');
    for (const size of [1600, 1280, 960]) {
      const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.65, 0.45]) {
        const result = canvas.toDataURL('image/webp', quality);
        if (result.length <= 350000) return result;
      }
    }
    throw new Error('This image is too detailed to save. Try a smaller image.');
  } catch (error) {
    if (error instanceof DOMException)
      throw new Error('This image could not be opened. Try another JPG, PNG, or WebP file.');
    throw error;
  } finally {
    URL.revokeObjectURL(source);
  }
}
