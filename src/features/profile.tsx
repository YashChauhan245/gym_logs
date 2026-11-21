'use client';

import { useState, type FormEvent } from 'react';
import { Download, HardDrive, Settings2, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { Profile } from '@/db/liftlog';
import { useDatabase } from '@/db/workspace';
import { useCloud } from '@/cloud/workspace';
import { AccountPanel } from '@/features/cloud/account-panel';
import { localDate } from '@/domain/workout';
import { PageTitle } from './dashboard';

const goals = ['Strength', 'Build muscle', 'Lose fat', 'Stay active'] as const;
const experiences = ['Beginner', 'Intermediate', 'Advanced'] as const;

export function TrainingSetup({ profile, open, onOpenChange, notify }: { profile: Profile; open: boolean; onOpenChange: (open: boolean) => void; notify: (message: string) => void }) {
  const db = useDatabase();
  const [days, setDays] = useState(profile.days);
  const [experience, setExperience] = useState(profile.experience);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const plan = days <= 3 ? 'Full body' : days === 4 ? 'Upper / lower' : 'Push / pull / legs';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await db.profiles.put({ ...profile, goal: data.get('goal') as Profile['goal'], experience, days, unit: data.get('unit') === 'lb' ? 'lb' : 'kg', onboarded: true });
      onOpenChange(false);
      notify('Training preferences saved.');
    } catch { setError('Could not save your preferences.'); }
    finally { setSaving(false); }
  }

  return <Modal open={open} onOpenChange={onOpenChange} title="Set up your training" description="Pick a goal, schedule, and units. You can edit these anytime in Profile.">
    <form className="stack-form" onSubmit={save}>
      <label>Training goal<select name="goal" defaultValue={profile.goal}>{goals.map((goal) => <option key={goal}>{goal}</option>)}</select></label>
      <label>Experience<select name="experience" value={experience} onChange={(event) => setExperience(event.target.value as Profile['experience'])}>{experiences.map((level) => <option key={level}>{level}</option>)}</select></label>
      <div className="two-fields"><label>Training days per week<select name="days" value={days} onChange={(event) => setDays(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option key={day}>{day}</option>)}</select></label><label>Weight unit<select name="unit" defaultValue={profile.unit}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label></div>
      <div className="plan-preview"><Target size={19} /><span><small>Suggested split</small><strong>{plan} · {days} {days === 1 ? 'day' : 'days'} per week</strong></span></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <Button disabled={saving} type="submit" className="dialog-action">Save training preferences</Button>
    </form>
  </Modal>;
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const csvCell = (value: string | number | null) => {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function ProfileScreen({ profile, onSetup, notify }: { profile: Profile; onSetup: () => void; notify: (message: string) => void }) {
  const db = useDatabase();
  const cloud = useCloud();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function exportData(format: 'json' | 'csv') {
    setError('');
    try {
      const backup = await db.transaction('r', db.tables, async () => ({
        schemaVersion: 2, exportedAt: new Date().toISOString(), profiles: await db.profiles.toArray(),
        workouts: await db.workouts.toArray(), exercises: await db.workoutExercises.toArray(),
        sets: await db.sets.toArray(), customExercises: await db.customExercises.toArray(),
        favourites: await db.favourites.toArray(),
        foodLogs: await db.foodLogs.toArray(), nutritionGoals: await db.nutritionGoals.toArray(), customFoods: await db.customFoods.toArray(),
      }));
      if (format === 'json') download(`liftlog-${localDate()}.json`, JSON.stringify(backup, null, 2), 'application/json');
      else {
        const exercises = new Map(backup.exercises.map((item) => [item.id, item]));
        const workouts = new Map(backup.workouts.map((item) => [item.id, item]));
        const rows = [['date', 'workout', 'exercise', 'set', 'weight', 'unit', 'reps', 'type', 'effort_kind', 'effort_value'], ...backup.sets.map((set) => [
          workouts.get(set.workoutId)?.localDate ?? '', workouts.get(set.workoutId)?.title ?? '', exercises.get(set.workoutExerciseId)?.name ?? '',
          set.position, set.weight, set.unit, set.reps, set.type, set.effort?.kind ?? '', set.effort?.value ?? null,
        ])];
        download(`liftlog-sets-${localDate()}.csv`, rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
      }
      notify(`${format.toUpperCase()} export ready.`);
    } catch { setError('Could not export the data stored on this device.'); }
  }

  async function updateTheme(theme: Profile['theme']) {
    try { await db.profiles.put({ ...profile, theme }); }
    catch { setError('Could not save appearance settings.'); }
  }

  async function clearData() {
    setBusy(true);
    setError('');
    try { await db.clearGuestData(); setDeleting(false); notify('Local LiftLog data deleted.'); }
    catch { setError('Could not clear local data.'); }
    finally { setBusy(false); }
  }

  return <div className="screen-stack"><PageTitle title="Profile" description="Training preferences and data for this device." />
    <AccountPanel notify={notify} />
    <section className="panel settings-panel"><div className="card-title"><span className="glyph-box"><Target size={19} /></span><h2>Training preferences</h2></div><dl className="settings-list"><div><dt>Goal</dt><dd>{profile.goal}</dd></div><div><dt>Experience</dt><dd>{profile.experience}</dd></div><div><dt>Weekly goal</dt><dd>{profile.days} days</dd></div><div><dt>Weight unit</dt><dd>{profile.unit}</dd></div></dl><Button variant="secondary" onClick={onSetup}><Settings2 size={17} /> Edit training preferences</Button></section>
    <section className="panel settings-panel"><div className="card-title"><span className="glyph-box"><Settings2 size={19} /></span><h2>Appearance</h2></div><label className="settings-control">Theme<select value={profile.theme} onChange={(event) => updateTheme(event.target.value as Profile['theme'])}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Match device</option></select></label></section>
    <section className="panel settings-panel"><div className="card-title"><span className="glyph-box"><HardDrive size={19} /></span><h2>Local data</h2></div><p>Your workouts are saved in this browser or installed app.</p><div className="profile-actions"><Button variant="secondary" onClick={() => exportData('json')}><Download size={17} /> Export JSON</Button><Button variant="secondary" onClick={() => exportData('csv')}><Download size={17} /> Export sets CSV</Button>{!cloud?.accountId && <Button variant="danger" onClick={() => { setError(''); setDeleting(true); }}><Trash2 size={17} /> Delete local data</Button>}</div>
    {error && !deleting && <p className="error-text" role="alert">{error}</p>}</section>
    <Modal open={deleting} onOpenChange={(open) => { if (!busy) setDeleting(open); }} title="Delete local data?" description="This permanently clears workouts, exercises, drafts, and preferences on this device.">
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="row-actions"><Button variant="secondary" disabled={busy} onClick={() => setDeleting(false)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={clearData}>Delete data</Button></div>
    </Modal>
  </div>;
}
