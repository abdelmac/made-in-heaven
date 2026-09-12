import { describe, expect, it } from 'vitest';
import {
  backgroundSchema,
  createEmptyData,
  DEFAULT_PREFERENCES,
  preferencesSchema,
  workspaceDataSchema,
} from '../src/lib/model';
import { backgroundCss, classicColors, readableAccent } from '../src/lib/appearance';
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
});
