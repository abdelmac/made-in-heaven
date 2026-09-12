'use client';
import { ui } from '@/lib/i18n/ui';

import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Palette, RotateCcw, Sparkles } from 'lucide-react';
import { useApp } from './app-context';
import { Button, Field, Panel } from './ui';
import {
  applyBackground,
  backgroundCss,
  backgroundPresets,
  classicColors,
  prepareBackgroundImage,
} from '@/lib/appearance';
import type { Preferences } from '@/lib/model';

export function ClassicColors() {
  const { store, notify } = useApp();
  const p = store.data.preferences;
  const savedColor = p.accentColor || classicColors[p.accent].color;
  const [color, setColor] = useState<string>(savedColor);
  const [colorSource, setColorSource] = useState<string>(savedColor);
  if (colorSource !== savedColor) {
    setColorSource(savedColor);
    if (color === colorSource) setColor(savedColor);
  }
  return (
    <>
      <div className="appearance-section-heading">
        <h3>{ui.appearance.classicColors}</h3>
        <span className="feature-badge">{ui.appearance.includedForEveryone}</span>
      </div>
      <p className="helper">{ui.appearance.aFamiliarPaletteFromGardenGreenToBlurplePick}</p>
      <div className="accent-options" aria-label={ui.appearance.classicColorPalette}>
        {Object.entries(classicColors).map(([accent, choice]) => (
          <button
            key={accent}
            aria-pressed={p.accent === accent && !p.accentColor && !p.customTheme}
            className={p.accent === accent && !p.accentColor && !p.customTheme ? 'selected' : ''}
            onClick={async () => {
              if (
                await store.update((d) => {
                  d.preferences.accent = accent as Preferences['accent'];
                  d.preferences.accentColor = null;
                  d.preferences.customTheme = null;
                })
              )
                setColor(choice.color);
            }}
          >
            <span style={{ backgroundColor: choice.color }}>
              {p.accent === accent && !p.accentColor && !p.customTheme && <Check size={15} />}
            </span>
            {choice.name}
          </button>
        ))}
      </div>
      <div className="custom-accent-row">
        <Field label={ui.appearance.yourAccentColor}>
          <div className="color-input">
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            <code>{color}</code>
          </div>
        </Field>
        <Button
          variant="secondary"
          onClick={async () => {
            if (
              await store.update((d) => {
                d.preferences.accentColor = color;
                d.preferences.customTheme = null;
              })
            )
              notify(ui.appearance.yourAccentColorIsSaved);
          }}
        >
          <Palette size={15} />
          {ui.appearance.saveAccentColor}
        </Button>
      </div>
      <p className="helper">{ui.appearance.yourAccentIsAdjustedForReadableTextInLight}</p>
    </>
  );
}

export function BackgroundPanel() {
  const { store, notify, navigate } = useApp();
  const saved = store.data.preferences.background;
  const [draft, setDraft] = useState(saved);
  const [draftSource, setDraftSource] = useState(saved);
  if (draftSource !== saved) {
    setDraftSource(saved);
    if (JSON.stringify(draft) === JSON.stringify(draftSource)) setDraft(saved);
  }
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const savedRef = useRef(saved);
  const uploadGeneration = useRef(0);
  const paid = !store.isCloud || Boolean(store.entitlements?.features.backgrounds);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  useEffect(
    () => () => {
      uploadGeneration.current++;
      applyBackground(savedRef.current);
    },
    [],
  );
  function change(next: Preferences['background']) {
    setDraft(next);
    if (preview) applyBackground(next);
  }
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <Panel
      title={ui.appearance.makeTheBackgroundYours}
      subtitle={ui.appearance.aLittleAtmosphereForYourFocusSpace}
    >
      <div className="background-plan-line">
        <span className="feature-badge pro">
          <Sparkles size={12} /> {ui.appearance.pro}
        </span>
        <p>
          {store.isCloud
            ? ui.appearance.gradientScenesAndYourOwnPhotosWithAReadable
            : ui.appearance.proPreviewInYourLocalWorkspaceConnectedAccountsRequire}
        </p>
      </div>
      <div className="background-presets" aria-label={ui.appearance.backgroundScenes}>
        <button
          className={`background-choice ${draft.kind === 'none' ? 'selected' : ''}`}
          aria-pressed={draft.kind === 'none'}
          onClick={() => change({ ...draft, kind: 'none' })}
        >
          <span className="background-thumbnail plain">
            <Palette size={20} />
          </span>
          <strong>{ui.appearance.classic}</strong>
          <small>{ui.appearance.yourOriginalWorkspace}</small>
        </button>
        {Object.entries(backgroundPresets).map(([preset, choice]) => (
          <button
            key={preset}
            className={`background-choice ${draft.kind === 'preset' && draft.preset === preset ? 'selected' : ''}`}
            aria-pressed={draft.kind === 'preset' && draft.preset === preset}
            onClick={() =>
              change({
                ...draft,
                kind: 'preset',
                preset: preset as Preferences['background']['preset'],
              })
            }
          >
            <span className="background-thumbnail" style={{ backgroundImage: choice.css }}>
              {draft.kind === 'preset' && draft.preset === preset && <Check size={17} />}
            </span>
            <strong>{choice.name}</strong>
            <small>{choice.description}</small>
          </button>
        ))}
      </div>
      <div className="background-upload">
        <div>
          <h3>{ui.appearance.yourOwnBackground}</h3>
          <p className="helper">{ui.appearance.chooseAJpgPngOrWebpUpTo8}</p>
        </div>
        <Button
          variant="secondary"
          disabled={!paid || loading}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} />
          {loading ? ui.appearance.preparingImage : ui.appearance.uploadBackground}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          aria-label={ui.appearance.uploadBackgroundImage}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file || !paid) return;
            const generation = ++uploadGeneration.current;
            setLoading(true);
            setError('');
            try {
              const image = await prepareBackgroundImage(file);
              if (generation === uploadGeneration.current)
                change({ ...draft, kind: 'image', image });
            } catch (reason) {
              if (generation === uploadGeneration.current)
                setError(
                  reason instanceof Error
                    ? reason.message
                    : ui.appearance.theImageCouldNotBePrepared,
                );
            } finally {
              if (generation === uploadGeneration.current) setLoading(false);
            }
          }}
        />
      </div>
      {draft.image && (
        <div className="saved-background-row">
          <button
            aria-pressed={draft.kind === 'image'}
            className="uploaded-background"
            onClick={() => change({ ...draft, kind: 'image' })}
            style={{ backgroundImage: backgroundCss({ ...draft, kind: 'image' }) }}
          >
            <span>{ui.appearance.useYourImage}</span>
          </button>
          <Button
            variant="ghost"
            onClick={() =>
              change({ ...draft, kind: draft.kind === 'image' ? 'none' : draft.kind, image: null })
            }
          >
            {ui.appearance.removeImage}
          </Button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-grid background-controls">
        <Field label={`Background dimming: ${draft.overlay}%`}>
          <input
            type="range"
            min={40}
            max={95}
            value={draft.overlay}
            onChange={(event) => change({ ...draft, overlay: Number(event.target.value) })}
          />
        </Field>
        <Field label={`Background blur: ${draft.blur}px`}>
          <input
            type="range"
            min={0}
            max={16}
            value={draft.blur}
            onChange={(event) => change({ ...draft, blur: Number(event.target.value) })}
          />
        </Field>
      </div>
      {draft.kind !== 'none' && draft.overlay < 70 && (
        <p className="notice">{ui.appearance.aBrighterBackgroundCanMakePageHeadingsHarderTo}</p>
      )}
      <div className="form-actions wrap">
        <Button
          variant="secondary"
          onClick={() => {
            applyBackground(preview ? saved : draft);
            setPreview(!preview);
          }}
        >
          {preview ? ui.appearance.endBackgroundPreview : ui.appearance.previewBackground}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            const next: Preferences['background'] = {
              kind: 'none',
              preset: 'aurora',
              image: null,
              overlay: 70,
              blur: 0,
            };
            uploadGeneration.current++;
            setLoading(false);
            setError('');
            if (
              await store.update((d) => {
                d.preferences.background = next;
              })
            ) {
              savedRef.current = next;
              setDraft(next);
              setPreview(false);
              applyBackground(next);
              notify(ui.appearance.classicBackgroundRestored);
            }
          }}
        >
          <RotateCcw size={15} />
          {ui.appearance.restoreClassicBackground}
        </Button>
        <Button
          disabled={loading || !hasChanges || (!paid && draft.kind !== 'none')}
          onClick={async () => {
            if (
              await store.update((d) => {
                d.preferences.background = draft;
              })
            ) {
              savedRef.current = draft;
              setPreview(false);
              notify(ui.appearance.yourBackgroundIsSaved);
            }
          }}
        >
          {ui.appearance.saveBackground}
        </Button>
      </div>
      {!paid && (
        <div className="background-upgrade">
          <p>{ui.appearance.findASceneYouLoveThenUpgradeToSave}</p>
          <Button variant="secondary" onClick={() => navigate('billing')}>
            <Sparkles size={15} />
            {ui.appearance.explorePro}
          </Button>
        </div>
      )}
    </Panel>
  );
}
