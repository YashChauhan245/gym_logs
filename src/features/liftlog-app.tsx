'use client';

import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Building2, ChartNoAxesCombined, CircleUserRound, Dumbbell, House, ShieldCheck, Utensils, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { defaultProfile } from '@/db/liftlog';
import { useDatabase } from '@/db/workspace';
import { CloudWorkspace, useCloud } from '@/cloud/workspace';
import { Today, Workouts } from '@/features/dashboard';
import { PlatformStatus } from '@/features/platform';
import { localDate, localDateAtNoon } from '@/domain/date';
import type { Exercise } from '@/domain/workout';

const loading = () => <p role="status" className="muted">Opening…</p>;
const ExerciseLibrary = dynamic(() => import('@/features/catalog/exercise-library').then((module) => module.ExerciseLibrary), { loading });
const ProfileScreen = dynamic(() => import('@/features/profile').then((module) => module.ProfileScreen), { loading });
const TrainingSetup = dynamic(() => import('@/features/profile').then((module) => module.TrainingSetup), { loading });
const ActiveWorkout = dynamic(() => import('@/features/workouts/active-workout').then((module) => module.ActiveWorkout), { loading });
const WorkoutSummary = dynamic(() => import('@/features/workouts/workout-summary').then((module) => module.WorkoutSummary), { loading });
const QuickLog = dynamic(() => import('@/features/workouts/quick-log').then((module) => module.QuickLog), { loading });
const NutritionScreen = dynamic(() => import('@/features/nutrition/nutrition-screen').then((module) => module.NutritionScreen), { loading });
const ProgressScreen = dynamic(() => import('@/features/workouts/progress-screen').then((module) => module.ProgressScreen), { loading });
const GymScreen = dynamic(() => import('@/features/gym/gym-screen').then((module) => module.GymScreen), { loading });

const tabs = [
  { id: 'today', title: 'Today', icon: House },
  { id: 'workouts', title: 'Workouts', icon: Dumbbell },
  { id: 'nutrition', title: 'Nutrition', icon: Utensils },
  { id: 'progress', title: 'Progress', icon: ChartNoAxesCombined },
  { id: 'gym', title: 'Gym', icon: Building2 },
  { id: 'profile', title: 'Profile', icon: CircleUserRound },
] as const;
type Tab = (typeof tabs)[number]['id'];
type AppDialog = 'quick-log' | 'browse-exercises' | 'add-exercise' | 'training-setup';

function subscribeHash(change: () => void) {
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
}

function subscribeDate(change: () => void) {
  document.addEventListener('visibilitychange', change);
  const interval = window.setInterval(change, 30_000);
  return () => { document.removeEventListener('visibilitychange', change); window.clearInterval(interval); };
}

function Brand({ home }: { home: Tab }) {
  return <a className="brand" href={`#${home}`} aria-label="LiftLog home"><BrandMark /><span>LiftLog</span></a>;
}

function Navigation({ selected, available }: { selected: Tab; available: readonly (typeof tabs)[number][] }) {
  return <nav className="navigation" aria-label="Main navigation">{available.map(({ id, title, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={selected === id ? 'page' : undefined}>
    <Icon size={20} strokeWidth={1.85} /><span>{title}</span>
  </a>)}</nav>;
}

class StorageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="offline-page"><BrandMark /><h1>LiftLog couldn’t open</h1><p>Check that this browser allows site storage, then try again.</p><Button onClick={() => window.location.reload()}>Reload LiftLog</Button></main>;
    return this.props.children;
  }
}

export function LiftLogApp() {
  return <StorageBoundary><CloudWorkspace><Shell /></CloudWorkspace></StorageBoundary>;
}

function Shell() {
  const db = useDatabase();
  const cloud = useCloud();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => 'today');
  const day = useSyncExternalStore(subscribeDate, () => localDate(), () => '');
  const today = day ? localDateAtNoon(day) : undefined;
  const [requestedRoute, workoutId] = hash.split('/');
  const available = tabs.filter(({ id }) => !cloud?.accountId || id === 'profile' ||
    (cloud.role === 'gym_owner' && id === 'gym') || (cloud.role === 'personal' && id !== 'gym'));
  const home: Tab = cloud?.role === 'gym_owner' ? 'gym' : cloud?.accountId && !cloud.role ? 'profile' : 'today';
  const requestedTab = ['active', 'history', 'quick-log'].includes(requestedRoute) ? 'workouts' : requestedRoute;
  const permitted = available.some(({ id }) => id === requestedTab);
  const route = permitted ? requestedRoute : home;
  const selected = route === 'active' || route === 'history' ? 'workouts' : requestedRoute === 'quick-log' && permitted ? 'today' : available.find((tab) => tab.id === route)?.id ?? home;
  const profile = useLiveQuery(async () => (await db.profiles.get('guest')) ?? defaultProfile) ?? defaultProfile;
  const active = useLiveQuery(async () => (await db.getActive()) ?? null) ?? null;
  const workouts = useLiveQuery(() => db.workouts.orderBy('finishedAt').reverse().toArray()) ?? [];
  const draft = useLiveQuery(async () => (await db.deviceState.get('quick-log')) ?? null);
  const [dialog, setDialog] = useState<AppDialog | null>(null);
  const canTrain = available.some(({ id }) => id === 'workouts');
  const openDialog = canTrain ? dialog ?? (route === 'quick-log' ? 'quick-log' : null) : null;
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { document.documentElement.dataset.theme = profile.theme; }, [profile.theme]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);
  useEffect(() => {
    if (!permitted && cloud?.accountId && cloud.role) window.location.hash = home;
  }, [permitted, home, cloud?.accountId, cloud?.role]);
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

  function closeDialog() {
    setDialog(null);
    if (route === 'quick-log') window.location.hash = 'today';
  }

  function quickSaved(message: string) {
    setDialog(null);
    setNotice(message);
    window.location.hash = 'active';
  }

  async function addExercise(exercise: Exercise) {
    if (!active) throw new Error('Start a workout to add an exercise.');
    await db.addExercise(active.id, exercise);
    setNotice(`${exercise.name} added.`);
  }

  let screen: ReactNode;
  if (route === 'active') screen = <ActiveWorkout workout={active} unit={profile.unit} onAdd={() => setDialog('add-exercise')} onStart={start}
    onQuick={() => setDialog('quick-log')} onFinished={(id) => { window.location.hash = `history/${id}`; }} notify={setNotice} />;
  else if (route === 'history' && workoutId) screen = <WorkoutSummary key={workoutId} id={workoutId} unit={profile.unit} notify={setNotice} />;
  else if (selected === 'workouts') screen = <Workouts active={active} workouts={workouts} onStart={start} onLibrary={() => setDialog('browse-exercises')} />;
  else if (selected === 'nutrition') screen = <NutritionScreen currentDay={day || localDate()} profile={profile} notify={setNotice} />;
  else if (selected === 'progress') screen = <ProgressScreen today={day || localDate()} goal={profile.days} unit={profile.unit} />;
  else if (selected === 'gym') screen = <GymScreen key={db.name} today={day || localDate()} notify={setNotice} />;
  else if (selected === 'profile') screen = <ProfileScreen profile={profile} onSetup={() => setDialog('training-setup')} notify={setNotice} />;
  else screen = <Today active={active} workouts={workouts} profile={profile} today={today} onStart={start}
    onQuick={() => setDialog('quick-log')} onSetup={() => setDialog('training-setup')} />;

  return <div className="app-shell">
    <aside className="sidebar"><Brand home={home} /><Navigation selected={selected} available={available} /><div className="sidebar-local"><ShieldCheck size={18} /><div><strong>{cloud?.role === 'gym_owner' ? 'Gym owner workspace' : cloud?.accountId ? 'Personal workspace' : 'Guest workspace'}</strong><small>{cloud?.signedIn ? cloud.status : 'Stored on this device'}</small></div></div></aside>
    <div className="workspace">
      <header className="topbar"><div className="mobile-brand"><Brand home={home} /></div><PlatformStatus /></header>
      <main className="main-content" id="main-content">
        {error && <p role="alert" className="error-text shell-error">{error}</p>}
        {screen}
      </main>
    </div>
    <div className="bottom-nav"><Navigation selected={selected} available={available} /></div>
    {(openDialog === 'browse-exercises' || openDialog === 'add-exercise') && <ExerciseLibrary open
      onOpenChange={(open) => { if (!open) closeDialog(); }} onPick={openDialog === 'add-exercise' ? addExercise : undefined} />}
    {openDialog === 'quick-log' && draft !== undefined && <QuickLog unit={profile.unit} initialDraft={draft?.id === 'quick-log' ? draft.draft : ''} onClose={closeDialog} onSaved={quickSaved} />}
    {openDialog === 'training-setup' && <TrainingSetup open profile={profile} onOpenChange={(open) => { if (!open) closeDialog(); }} notify={setNotice} />}
    {notice && <div className="toast"><span role="status">{notice}</span><Button size="icon" variant="ghost" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={17} /></Button></div>}
  </div>;
}
