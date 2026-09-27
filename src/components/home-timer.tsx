'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Leaf, Pause, Play, RotateCcw } from 'lucide-react';
import {
  createHomeTimer,
  HOME_TIMER_DURATIONS,
  HOME_TIMER_STORAGE_KEY,
  homeTimerRemaining,
  parseHomeTimer,
  pauseHomeTimer,
  refreshHomeTimer,
  startHomeTimer,
  type HomeTimerPhase,
} from '@/lib/home-timer';
import styles from './home-timer.module.css';

const CIRCUMFERENCE = 2 * Math.PI * 108;

export function HomeTimer() {
  const [timer, setTimer] = useState(() => createHomeTimer());
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Restore after hydration so the server and first browser render agree.
    const initialize = window.setTimeout(() => {
      const currentTime = Date.now();
      try {
        const saved = parseHomeTimer(sessionStorage.getItem(HOME_TIMER_STORAGE_KEY), currentTime);
        if (saved) setTimer(saved);
      } catch {
        // The timer also works when the browser blocks storage.
      }
      setNow(currentTime);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(initialize);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(HOME_TIMER_STORAGE_KEY, JSON.stringify(timer));
    } catch {
      // Persistence is optional; keeping time does not depend on it.
    }
  }, [ready, timer]);

  useEffect(() => {
    if (timer.status !== 'running') return;
    const update = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      setTimer((current) => refreshHomeTimer(current, currentTime));
    };
    const interval = window.setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pageshow', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('pageshow', update);
    };
  }, [timer.status]);

  const remaining = homeTimerRemaining(timer, now);
  const seconds = Math.ceil(remaining / 1000);
  const minutesLabel = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secondsLabel = String(seconds % 60).padStart(2, '0');
  const running = timer.status === 'running';
  const completed = timer.status === 'complete';
  const progress = remaining / HOME_TIMER_DURATIONS[timer.phase];
  const message = completed
    ? timer.phase === 'focus'
      ? 'Bien joué. Prenez cinq minutes pour souffler.'
      : 'Votre pause est terminée. Reprenez à votre rythme.'
    : running
      ? timer.phase === 'focus'
        ? 'Une seule chose à la fois. Vous avez le temps.'
        : 'Détendez les épaules. Le reste peut attendre.'
      : timer.status === 'paused'
        ? 'En pause. Reprenez quand vous le souhaitez.'
        : 'Choisissez une petite tâche, puis lancez-vous.';

  function choosePhase(phase: HomeTimerPhase) {
    if (!running && phase !== timer.phase) setTimer(createHomeTimer(phase));
  }

  function toggle() {
    const currentTime = Date.now();
    setNow(currentTime);
    setTimer((current) => {
      if (current.status === 'running') return pauseHomeTimer(current, currentTime);
      if (current.status === 'complete') {
        return startHomeTimer(
          createHomeTimer(current.phase === 'focus' ? 'break' : 'focus'),
          currentTime,
        );
      }
      return startHomeTimer(current, currentTime);
    });
  }

  const actionLabel = running
    ? 'Mettre en pause'
    : completed
      ? timer.phase === 'focus'
        ? 'Prendre une pause'
        : 'Nouvelle session'
      : timer.status === 'paused'
        ? 'Reprendre'
        : 'Commencer';

  return (
    <section className={styles.card} aria-labelledby="home-timer-title">
      <div className={styles.heading}>
        <span className={styles.eyebrow}>
          <Leaf size={14} aria-hidden="true" /> Essayez, tout simplement
        </span>
        <h2 id="home-timer-title">Un moment pour vous</h2>
      </div>
      <div className={styles.modes} role="group" aria-label="Mode du minuteur">
        <button
          type="button"
          aria-pressed={timer.phase === 'focus'}
          disabled={!ready || running}
          onClick={() => choosePhase('focus')}
        >
          Concentration <span>25 min</span>
        </button>
        <button
          type="button"
          aria-pressed={timer.phase === 'break'}
          disabled={!ready || running}
          onClick={() => choosePhase('break')}
        >
          Pause <span>5 min</span>
        </button>
      </div>
      <div className={styles.dial}>
        <svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
          <circle className={styles.track} cx="120" cy="120" r="108" />
          <circle
            className={styles.progress}
            cx="120"
            cy="120"
            r="108"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          />
        </svg>
        <div className={styles.dialContent}>
          <span className={styles.phase}>
            {timer.phase === 'focus' ? 'Concentration' : 'Respirez'}
          </span>
          <span
            className={styles.time}
            role="timer"
            aria-live="off"
            aria-label={`Temps restant : ${Math.floor(seconds / 60)} minutes et ${seconds % 60} secondes`}
          >
            {minutesLabel}:{secondsLabel}
          </span>
          <span className={styles.dialHint}>
            {running ? 'à votre rythme' : completed ? 'c’est fait' : 'sans pression'}
          </span>
        </div>
      </div>
      <p className={styles.message} role="status" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      <div className={styles.controls}>
        <button className={styles.start} type="button" onClick={toggle} disabled={!ready}>
          {running ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          {actionLabel}
        </button>
        <button
          className={styles.reset}
          type="button"
          aria-label="Réinitialiser le minuteur"
          title="Réinitialiser le minuteur"
          onClick={() => setTimer(createHomeTimer(timer.phase))}
          disabled={!ready || timer.status === 'idle'}
        >
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.note}>
        Ce minuteur est un essai libre. Pour enregistrer vos sessions,
        {/* A full navigation lets the shared root entry select the workspace. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/?view=overview">
          ouvrez votre espace <ArrowRight size={12} aria-hidden="true" />
        </a>
      </p>
    </section>
  );
}
