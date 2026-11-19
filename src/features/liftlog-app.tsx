'use client';

import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Activity, ChartNoAxesCombined, CircleUserRound, Dumbbell, House, ShieldCheck, Utensils, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { db, defaultProfile } from '@/db/liftlog';
import { Nutrition, Progress, Today, Workouts } from '@/features/dashboard';
import { PlatformStatus } from '@/features/platform';
import { localDate } from '@/domain/workout';

const loading = () => <p role="status" className="muted">Opening…</p>;
const ExerciseLibrary = dynamic(() => import('@/features/catalog/exercise-library').then((module) => module.ExerciseLibrary), { loading });
const ProfileScreen = dynamic(() => import('@/features/profile').then((module) => module.ProfileScreen), { loading });
const TrainingSetup = dynamic(() => import('@/features/profile').then((module) => module.TrainingSetup), { loading });
const ActiveWorkout = dynamic(() => import('@/features/workouts/active-workout').then((module) => module.ActiveWorkout), { loading });
const WorkoutSummary = dynamic(() => import('@/features/workouts/active-workout').then((module) => module.WorkoutSummary), { loading });
const QuickLog = dynamic(() => import('@/features/workouts/quick-log').then((module) => module.QuickLog), { loading });

const tabs = [
  { id: 'today', title: 'Today', icon: House },
  { id: 'workouts', title: 'Workouts', icon: Dumbbell },
  { id: 'nutrition', title: 'Nutrition', icon: Utensils },
  { id: 'progress', title: 'Progress', icon: ChartNoAxesCombined },
  { id: 'profile', title: 'Profile', icon: CircleUserRound },
] as const;

function subscribeHash(change: () => void) {
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
}

function subscribeDate(change: () => void) {
  document.addEventListener('visibilitychange', change);
  const interval = window.setInterval(change, 30_000);
  return () => { document.removeEventListener('visibilitychange', change); window.clearInterval(interval); };
}

function Brand() {
  return <a className="brand" href="#today" aria-label="LiftLog home"><span className="app-mark"><Dumbbell size={22} strokeWidth={2.6} /></span><span>Lift<span>Log</span></span></a>;
}

function Navigation({ selected }: { selected: string }) {
  return <nav className="navigation" aria-label="Main navigation">{tabs.map(({ id, title, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={selected === id ? 'page' : undefined}>
    <Icon size={20} strokeWidth={1.85} /><span>{title}</span>
  </a>)}</nav>;
}

class StorageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="offline-page"><div className="app-mark"><Dumbbell size={22} /></div><h1>LiftLog couldn’t open</h1><p>Check that this browser allows site storage, then try again.</p><Button onClick={() => window.location.reload()}>Reload LiftLog</Button></main>;
    return this.props.children;
  }
}

export function LiftLogApp() {
  return <StorageBoundary><Shell /></StorageBoundary>;
}

function Shell() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => 'today');
  const day = useSyncExternalStore(subscribeDate, () => localDate(), () => '');
  const today = day ? new Date(`${day}T12:00:00`) : undefined;
  const [route, workoutId] = hash.split('/');
  const selected = route === 'active' || route === 'history' ? 'workouts' : tabs.find((tab) => tab.id === route)?.id ?? 'today';
  const profile = useLiveQuery(async () => (await db.profiles.get('guest')) ?? defaultProfile) ?? defaultProfile;
  const active = useLiveQuery(async () => (await db.getActive()) ?? null) ?? null;
  const workouts = useLiveQuery(() => db.workouts.orderBy('finishedAt').reverse().toArray()) ?? [];
  const draft = useLiveQuery(async () => (await db.deviceState.get('quick-log')) ?? null);
  const [quick, setQuick] = useState(false);
  const [library, setLibrary] = useState<'view' | 'add' | null>(null);
  const [setup, setSetup] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { document.documentElement.dataset.theme = profile.theme; }, [profile.theme]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function start() {
    setError('');
    try {
      await db.startWorkout();
      window.location.hash = 'active';
    } catch { setError('Could not start a workout. Check that the browser can save data.'); }
  }

  function closeQuick() {
    setQuick(false);
    if (route === 'quick-log') window.location.hash = 'today';
  }

  function quickSaved(message: string) {
    setQuick(false);
    setNotice(message);
    window.location.hash = 'active';
  }

  let screen: ReactNode;
  if (route === 'active') screen = <ActiveWorkout workout={active} unit={profile.unit} onAdd={() => setLibrary('add')} onStart={start} onQuick={() => setQuick(true)} onFinished={(id) => { window.location.hash = `history/${id}`; }} notify={setNotice} />;
  else if (route === 'history' && workoutId) screen = <WorkoutSummary id={workoutId} unit={profile.unit} notify={setNotice} />;
  else if (selected === 'workouts') screen = <Workouts active={active} workouts={workouts} onStart={start} onLibrary={() => setLibrary('view')} />;
  else if (selected === 'nutrition') screen = <Nutrition />;
  else if (selected === 'progress') screen = <Progress workouts={workouts} days={profile.days} today={today} />;
  else if (selected === 'profile') screen = <ProfileScreen profile={profile} onSetup={() => setSetup(true)} notify={setNotice} />;
  else screen = <Today active={active} workouts={workouts} profile={profile} today={today} onStart={start} onQuick={() => setQuick(true)} onSetup={() => setSetup(true)} />;

  return <div className="app-shell">
    <aside className="sidebar"><Brand /><div className="sidebar-rule" /><Navigation selected={selected} /><div className="sidebar-local"><span className="glyph-box"><ShieldCheck size={19} /></span><div><strong>Guest workspace</strong><small>Stored on this device</small></div></div></aside>
    <div className="workspace">
      <header className="topbar"><div className="mobile-brand"><Brand /></div><span className="topbar-label"><Activity size={17} /> Training log</span><PlatformStatus /></header>
      <main className="main-content" id="main-content">
        {error && <p role="alert" className="error-text shell-error">{error}</p>}
        {screen}
      </main>
    </div>
    <div className="bottom-nav"><Navigation selected={selected} /></div>
    {library && <ExerciseLibrary open onOpenChange={(open) => { if (!open) setLibrary(null); }} onPick={library === 'add' && active ? async (exercise) => { await db.addExercise(active.id, exercise); setNotice(`${exercise.name} added.`); } : undefined} />}
    {(quick || route === 'quick-log') && draft !== undefined && <QuickLog unit={profile.unit} initialDraft={draft?.id === 'quick-log' ? draft.draft : ''} onClose={closeQuick} onSaved={quickSaved} />}
    {setup && <TrainingSetup open profile={profile} onOpenChange={setSetup} notify={setNotice} />}
    {notice && <div className="toast"><span role="status">{notice}</span><Button size="icon" variant="ghost" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={17} /></Button></div>}
  </div>;
}
