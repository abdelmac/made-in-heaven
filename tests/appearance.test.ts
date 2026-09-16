import { describe, expect, it } from 'vitest';
import {
  backgroundSchema,
  createEmptyData,
  DEFAULT_PREFERENCES,
  preferencesSchema,
  workspaceDataSchema,
} from '../src/lib/model';
import { backgroundCss, classicColors, readableAccent, themeColors } from '../src/lib/appearance';
import { contrastRatio } from '../src/lib/calendar';

describe('personal appearance data', () => {
  it('loads existing workspaces with neutral defaults for all new fields', () => {
    const legacy = JSON.parse(JSON.stringify(createEmptyData()));
    delete legacy.preferences.accentColor;
    delete legacy.preferences.background;
    delete legacy.noteSheets;
    delete legacy.flashcardDecks;
    delete legacy.flashcards;
    const loaded = workspaceDataSchema.parse(legacy);
    expect(loaded.preferences.accentColor).toBeNull();
    expect(loaded.preferences.background.kind).toBe('none');
    expect(loaded.noteSheets).toEqual([]);
    expect(loaded.flashcards).toEqual([]);
    expect(loaded.flashcardDecks).toEqual([]);
  });
  it('accepts every classic palette and a free custom accent without a custom theme', () => {
    for (const accent of Object.keys(classicColors)) {
      const parsed = preferencesSchema.parse({
        ...DEFAULT_PREFERENCES,
        accent,
        accentColor: '#ffee22',
      });
      expect(parsed.customTheme).toBeNull();
      expect(parsed.accentColor).toBe('#ffee22');
    }
  });
  it('rejects executable, remote, oversized, incomplete and out-of-bounds backgrounds', () => {
    for (const image of [
      'https://example.com/image.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,abc");color:red',
      `data:image/png;base64,${'A'.repeat(350000)}`,
      null,
    ])
      expect(
        backgroundSchema.safeParse({ ...DEFAULT_PREFERENCES.background, kind: 'image', image })
          .success,
      ).toBe(false);
    expect(
      backgroundSchema.safeParse({ ...DEFAULT_PREFERENCES.background, overlay: 0 }).success,
    ).toBe(false);
    expect(
      backgroundSchema.safeParse({ ...DEFAULT_PREFERENCES.background, blur: 17 }).success,
    ).toBe(false);
    expect(backgroundCss(DEFAULT_PREFERENCES.background)).toBe('none');
  });
  it('keeps arbitrary free accents readable in light and dark modes', () => {
    for (const color of ['#000000', '#ffffff', '#ffff00', '#00ff00', '#ff00ff', '#5865f2']) {
      expect(contrastRatio(readableAccent(color, false), '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(readableAccent(color, true), '#2b2d31')).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('keeps text, links and buttons readable on every resolved classic palette', () => {
    for (const dark of [false, true]) {
      for (const accent of Object.keys(classicColors) as (keyof typeof classicColors)[]) {
        const colors = themeColors({ ...DEFAULT_PREFERENCES, accent }, dark);
        for (const surface of ['background', 'surface', 'surface-soft', 'sidebar']) {
          for (const foreground of ['text', 'muted', 'secondary-text', 'accent'])
            expect(contrastRatio(colors[foreground], colors[surface])).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrastRatio(colors['on-accent'], colors.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors['on-accent'], colors['accent-hover'])).toBeGreaterThanOrEqual(
          4.5,
        );
        for (let index = 0; index < 5; index++)
          expect(
            contrastRatio(colors[`on-heat-${index}`], colors[`heat-${index}`]),
          ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('keeps planner minute labels readable with arbitrary accents and custom heatmaps', () => {
    const samples = ['#000000', '#ffffff', '#ffff00', '#00ff00', '#ff00ff', '#5865f2', '#777777'];
    for (const dark of [false, true]) {
      for (const accentColor of samples) {
        const colors = themeColors({ ...DEFAULT_PREFERENCES, accentColor }, dark);
        for (let index = 0; index < 5; index++)
          expect(
            contrastRatio(colors[`on-heat-${index}`], colors[`heat-${index}`]),
          ).toBeGreaterThanOrEqual(4.5);
      }
      const custom = themeColors(DEFAULT_PREFERENCES, dark, {
        accent: '#808080',
        background: '#171722',
        surface: '#262638',
        border: '#55556f',
        text: '#f4f4fa',
        heatmap: ['#ffffff', '#111111', '#777777', '#ffee00', '#000000'],
      });
      for (let index = 0; index < 5; index++)
        expect(
          contrastRatio(custom[`on-heat-${index}`], custom[`heat-${index}`]),
        ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('resolves custom surfaces and secondary colors without retaining the previous classic palette', () => {
    const customTheme = {
      accent: '#e8b86d',
      background: '#171722',
      surface: '#262638',
      border: '#55556f',
      text: '#f4f4fa',
      heatmap: ['#262638', '#68577b', '#997da4', '#c6a7c9', '#f5d5f7'],
    };
    const green = themeColors({ ...DEFAULT_PREFERENCES, accent: 'green', customTheme }, false);
    const blue = themeColors({ ...DEFAULT_PREFERENCES, accent: 'blue', customTheme }, true);
    expect(blue).toEqual(green);
    expect(green.background).toBe(customTheme.background);
    expect(green.surface).toBe(customTheme.surface);
    expect(green['heat-4']).toBe(customTheme.heatmap[4]);
    expect(contrastRatio(green.muted, green.sidebar)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(green['on-accent'], green.accent)).toBeGreaterThanOrEqual(4.5);
    expect(themeColors(DEFAULT_PREFERENCES, false).background).not.toBe(green.background);
  });
});
