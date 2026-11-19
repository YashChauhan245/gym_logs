'use client';

import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { db } from '@/db/liftlog';
import { clockLabel } from '@/domain/workout';

let audio: AudioContext | undefined;

export function armTimerAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch { /* Vibration and visual feedback remain available. */ }
}

function notifyTimer() {
  navigator.vibrate?.([80, 70, 80]);
  if (!audio || audio.state !== 'running') return;
  const note = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  note.frequency.setValueAtTime(660, now);
  note.frequency.setValueAtTime(880, now + 0.12);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  note.connect(gain).connect(audio.destination);
  note.start(now);
  note.stop(now + 0.35);
}

export function useClock(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, ms);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [ms]);
  return now;
}

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !navigator.wakeLock) return;
    let sentinel: WakeLockSentinel | undefined;
    let alive = true;
    let requesting = false;
    async function request() {
      if (document.visibilityState !== 'visible' || requesting || (sentinel && !sentinel.released)) return;
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (alive) sentinel = lock;
        else await lock.release();
      } catch { /* The OS can decline wake lock. */ }
      finally { requesting = false; }
    }
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}

export function RestTimer({ workoutId }: { workoutId: string }) {
  const state = useLiveQuery(() => db.deviceState.get('rest'));
  if (state?.id !== 'rest' || state.rest.workoutId !== workoutId) return null;
  return <Countdown key={state.rest.deadline} rest={state.rest} />;
}

function Countdown({ rest }: { rest: { workoutId: string; deadline: number; seconds: number; exerciseName: string } }) {
  const now = useClock(250);
  const remaining = Math.max(0, rest.deadline - now);
  const notified = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!remaining && !notified.current) {
      notified.current = true;
      if (Date.now() - rest.deadline < 60_000) notifyTimer();
    }
  }, [remaining, rest.deadline]);

  async function change(extend: boolean) {
    armTimerAudio();
    try {
      await db.transaction('rw', db.deviceState, async () => {
        const current = await db.deviceState.get('rest');
        if (current?.id !== 'rest' || current.rest.deadline !== rest.deadline) return;
        if (extend) await db.deviceState.put({ id: 'rest', rest: { ...rest, deadline: Math.max(Date.now(), rest.deadline) + 15000, seconds: Math.ceil(remaining / 1000) + 15 } });
        else await db.deviceState.delete('rest');
      });
    } catch { setError(true); }
  }

  return <aside className={`rest-timer ${remaining ? '' : 'timer-complete'}`} aria-label="Rest timer">
    <div className="glyph-box"><Timer size={20} /></div>
    <div className="rest-copy"><strong role={remaining ? undefined : 'status'}>{remaining ? 'Rest timer' : 'Rest complete'}</strong><small>{rest.exerciseName}</small></div>
    <span className="rest-clock" role="timer" aria-label="Rest time remaining">{clockLabel(remaining)}</span>
    <div className="rest-actions"><Button variant="secondary" size="compact" onClick={() => change(true)}>+15 s</Button><Button variant="ghost" size="compact" onClick={() => change(false)}>{remaining ? 'Skip' : 'Dismiss'}</Button></div>
    {error && <span role="alert" className="error-text">Could not change the rest timer.</span>}
  </aside>;
}
