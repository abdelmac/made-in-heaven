'use client';

import { useEffect, useRef, useState } from 'react';
import { Headphones, Pause, Play, RefreshCw } from 'lucide-react';
import { useApp } from './app-context';
import { Button } from './ui';
import { createAmbientPreview, previewTracks } from '@/lib/ambient-preview';
import { storageKey as workspaceStorageKey } from '@/lib/persistence';
import styles from './focus-audio-player.module.css';

type Track = {
  id: string;
  title: string;
  attribution: string;
  duration_seconds: number;
  category: string;
};
type Preferences = { trackId: string; volume: number; loop: boolean; pauseOnBreak: boolean };
const defaults: Preferences = { trackId: '', volume: 0.25, loop: true, pauseOnBreak: true };

export function FocusAudioPlayer() {
  const { store, navigate } = useApp();
  const preview = !store.user;
  if (!store.ready) return null;
  if (!preview && !store.entitlements?.features.music)
    return (
      <aside className={styles.player} aria-label="Ambiances audio">
        <Headphones size={18} />
        <span>Ambiances pour se concentrer</span>
        <Button variant="ghost" onClick={() => navigate('billing')}>
          Découvrir Pro
        </Button>
      </aside>
    );
  return <Player key={`${store.userId}:${store.workspaceId}:${preview}`} preview={preview} />;
}

function Player({ preview }: { preview: boolean }) {
  const { store } = useApp();
  const storageKey = `${workspaceStorageKey(store.workspaceId, store.user?.id)}:audio`;
  const [preferences, setPreferences] = useState(defaults);
  const [tracks, setTracks] = useState<Track[]>(preview ? [...previewTracks] : []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!preview);
  const [playing, setPlaying] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const blobRef = useRef('');
  const version = useRef(0);
  const mounted = useRef(false);
  const breakPaused = preferences.pauseOnBreak && store.timer.phase !== 'focus';
  const selected = tracks.find((track) => track.id === preferences.trackId) || tracks[0];

  useEffect(() => {
    mounted.current = true;
    const audio = audioRef.current;
    const pendingRequests = version;
    const timer = setTimeout(() => {
      try {
        const saved: Partial<Preferences> = JSON.parse(localStorage.getItem(storageKey) || '{}');
        setPreferences({
          trackId: typeof saved.trackId === 'string' ? saved.trackId : '',
          volume:
            typeof saved.volume === 'number' && Number.isFinite(saved.volume)
              ? Math.max(0, Math.min(1, saved.volume))
              : defaults.volume,
          loop: typeof saved.loop === 'boolean' ? saved.loop : defaults.loop,
          pauseOnBreak:
            typeof saved.pauseOnBreak === 'boolean' ? saved.pauseOnBreak : defaults.pauseOnBreak,
        });
      } catch {
        /* Private browsing can make optional device preferences unavailable. */
      }
    }, 0);
    return () => {
      mounted.current = false;
      pendingRequests.current++;
      clearTimeout(timer);
      audio?.pause();
      audio?.removeAttribute('src');
      audio?.load();
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  }, [storageKey]);

  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    void fetch(`/api/audio?workspaceId=${encodeURIComponent(store.workspaceId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Le catalogue audio est indisponible.');
        if (!controller.signal.aborted) setTracks(data.tracks);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Le catalogue audio est indisponible.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [preview, store.workspaceId, catalogAttempt]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = preferences.volume;
      audioRef.current.loop = preferences.loop;
    }
  }, [preferences.volume, preferences.loop]);
  useEffect(() => {
    if (breakPaused) {
      version.current++;
      audioRef.current?.pause();
    }
  }, [breakPaused]);

  function save(next: Partial<Preferences>) {
    const value = { ...preferences, ...next };
    setPreferences(value);
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Optional local preferences. */
    }
  }
  function stop() {
    version.current++;
    audioRef.current?.pause();
    audioRef.current?.removeAttribute('src');
    audioRef.current?.load();
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = '';
  }
  async function play() {
    const audio = audioRef.current;
    if (!audio || !selected || breakPaused || busy) return;
    const current = ++version.current;
    setBusy(true);
    setError('');
    try {
      if (preview) {
        if (!audio.getAttribute('src')) {
          blobRef.current = URL.createObjectURL(createAmbientPreview(selected.id));
          audio.src = blobRef.current;
        }
      } else {
        const response = await fetch(
          `/api/audio?workspaceId=${encodeURIComponent(store.workspaceId)}&trackId=${encodeURIComponent(selected.id)}`,
          { cache: 'no-store', signal: AbortSignal.timeout(10_000) },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de préparer cette piste.');
        if (current !== version.current) return;
        const url = new URL(data.url);
        if (
          url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
        )
          throw new Error('Cette source audio n’est pas disponible.');
        audio.src = url.toString();
      }
      if (current !== version.current) return;
      audio.volume = preferences.volume;
      audio.loop = preferences.loop;
      await audio.play();
      if (current !== version.current) audio.pause();
      else save({ trackId: selected.id });
    } catch (cause) {
      if (current === version.current) {
        audio.pause();
        audio.removeAttribute('src');
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        blobRef.current = '';
        setError(
          cause instanceof Error && cause.name !== 'NotAllowedError'
            ? cause.message
            : 'Le navigateur a bloqué la lecture. Cliquez à nouveau sur Écouter.',
        );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <details className={styles.player}>
      <summary>
        <Headphones size={18} />
        Ambiances audio <span className="badge">{preview ? 'Aperçu local' : 'Pro'}</span>
        {playing && <span>En lecture</span>}
      </summary>
      <div className={styles.controls}>
        <audio
          ref={audioRef}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            if (audioRef.current?.getAttribute('src')) {
              audioRef.current.pause();
              setPlaying(false);
              setError(
                'Lecture interrompue. Cliquez sur Écouter pour renouveler l’accès et réessayer.',
              );
            }
          }}
        />
        {loading ? (
          <p className="helper">Chargement des ambiances…</p>
        ) : !tracks.length ? (
          <p className="helper">Aucune piste n’est encore disponible dans le catalogue.</p>
        ) : (
          <>
            <label>
              Ambiance
              <select
                value={selected?.id || ''}
                disabled={busy}
                onChange={(event) => {
                  stop();
                  save({ trackId: event.target.value });
                  setError('');
                }}
              >
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.transport}>
              <Button
                variant="secondary"
                disabled={busy || (!playing && breakPaused)}
                onClick={() => (playing ? audioRef.current?.pause() : void play())}
              >
                {busy ? (
                  <RefreshCw size={16} />
                ) : playing ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} />
                )}
                {busy ? 'Préparation…' : playing ? 'Mettre en pause' : 'Écouter'}
              </Button>
              <label>
                Volume : {Math.round(preferences.volume * 100)} %
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  aria-label="Volume des ambiances"
                  value={preferences.volume}
                  onChange={(event) => save({ volume: Number(event.target.value) })}
                />
              </label>
            </div>
            <div className={styles.options}>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.loop}
                  onChange={(event) => save({ loop: event.target.checked })}
                />
                En boucle
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.pauseOnBreak}
                  onChange={(event) => save({ pauseOnBreak: event.target.checked })}
                />
                Pause pendant les pauses du minuteur
              </label>
            </div>
            {breakPaused && (
              <p className="helper">
                Le minuteur est en pause courte ou longue. La lecture restera arrêtée jusqu’à votre
                prochain clic sur Écouter.
              </p>
            )}
            <p className="helper">
              {selected?.attribution}
              {preview ? ' · Générée sur cet appareil, sans téléchargement.' : ''}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!preview && !loading && !tracks.length && (
          <Button
            variant="secondary"
            onClick={() => {
              setLoading(true);
              setError('');
              setCatalogAttempt((attempt) => attempt + 1);
            }}
          >
            Actualiser le catalogue
          </Button>
        )}
      </div>
    </details>
  );
}
