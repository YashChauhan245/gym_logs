'use client';

import { useState, type FormEvent } from 'react';
import { Check, ChevronLeft, ClipboardList, Dumbbell, NotebookPen, Plus, Repeat2, Timer } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { Workout, WorkoutDetails, WorkoutSet } from '@/db/liftlog';
import { useDatabase } from '@/db/workspace';
import { clockLabel, type SetInput, type Unit } from '@/domain/workout';
import { SetFields, readSet } from './set-fields';
import { armTimerAudio, RestTimer, useClock, useWakeLock } from './rest-timer';
import { EditSetDialog, setInUnit, setWeightLabel, WorkoutSetList } from './workout-sets';

export function ActiveWorkout({ workout, unit, onAdd, onStart, onQuick, onFinished, notify }: {
  workout: Workout | null; unit: Unit; onAdd: () => void; onStart: () => Promise<void>;
  onQuick: () => void; onFinished: (id: string) => void; notify: (message: string) => void;
}) {
  const db = useDatabase();
  const detail = useLiveQuery(() => workout ? db.getWorkout(workout.id) : undefined, [workout?.id]);
  if (!workout) return <section className="panel empty-state"><span className="glyph-box"><Dumbbell size={23} /></span><h1>Start a workout</h1><p>Open an empty session and add the exercises you want to train.</p><Button onClick={onStart}><Plus size={18} /> Start workout</Button></section>;
  if (!detail || detail.workout.id !== workout.id) return <p role="status" className="muted">Opening your workout…</p>;
  return <WorkoutEditor key={workout.id} detail={detail} unit={unit} onAdd={onAdd} onQuick={onQuick} onFinished={onFinished} notify={notify} />;
}

function WorkoutEditor({ detail, unit, onAdd, onQuick, onFinished, notify }: {
  detail: WorkoutDetails; unit: Unit; onAdd: () => void; onQuick: () => void; onFinished: (id: string) => void; notify: (message: string) => void;
}) {
  const db = useDatabase();
  const { workout, exercises } = detail;
  const now = useClock();
  const [stayAwake, setStayAwake] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useWakeLock(stayAwake && workout.status === 'active');
  const count = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);

  async function finish() {
    setBusy(true);
    setError('');
    try { await db.finishWorkout(workout.id); onFinished(workout.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not finish the workout.'); }
    finally { setBusy(false); }
  }

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await db.workouts.update(workout.id, { title: String(data.get('title')).trim() || 'Workout', notes: String(data.get('notes')), updatedAt: Date.now() });
      setEditing(false);
      notify('Workout notes saved.');
    } catch { setError('Could not save workout notes.'); }
  }

  return <div className="workout-screen">
    <a className="back-link" href="#workouts"><ChevronLeft size={18} /> Workouts</a>
    <div className="section-heading active-heading"><div><span className="training-status"><span /> In progress</span><h1>{workout.title}</h1></div><Button disabled={busy} onClick={finish}><Check size={19} /> Finish workout</Button></div>
    <div className="workout-meta"><span><Timer size={17} /> {clockLabel(now - workout.startedAt)}</span><span>{count} {count === 1 ? 'set' : 'sets'} logged</span><label className="check-label"><input type="checkbox" checked={stayAwake} onChange={(event) => setStayAwake(event.target.checked)} /> Keep screen awake</label></div>
    {error && <p role="alert" className="error-text">{error}</p>}
    <RestTimer workoutId={workout.id} />
    <div className="workout-actions"><Button variant="secondary" onClick={onAdd}><Plus size={19} /> Add exercise</Button><Button variant="secondary" onClick={onQuick}><NotebookPen size={19} /> Quick Log</Button><Button variant="ghost" onClick={() => setEditing(true)}><ClipboardList size={19} /> Workout notes</Button></div>
    {exercises.length === 0 ? <section className="panel empty-state"><span className="glyph-box"><Dumbbell size={23} /></span><h2>No exercises yet</h2><p>Add your first exercise or paste a workout into Quick Log.</p></section>
      : <div className="exercise-stack">{exercises.map((exercise) => <ExerciseBlock key={exercise.id} exercise={exercise} unit={unit} notify={notify} />)}</div>}
    {workout.notes && <section className="panel session-note"><h2>Workout notes</h2><p>{workout.notes}</p></section>}
    <Modal open={editing} onOpenChange={setEditing} title="Workout notes">
      <form className="stack-form" onSubmit={saveNotes}><label>Workout title<input name="title" defaultValue={workout.title} maxLength={80} /></label><label>Notes<textarea name="notes" rows={6} defaultValue={workout.notes} maxLength={12000} /></label><Button type="submit" className="dialog-action">Save notes</Button></form>
    </Modal>
  </div>;
}

function ExerciseBlock({ exercise, unit, notify }: { exercise: WorkoutDetails['exercises'][number]; unit: Unit; notify: (message: string) => void }) {
  const db = useDatabase();
  const previous = useLiveQuery(() => db.lastSessionSets(exercise), [exercise.exerciseId, exercise.workoutId]);
  const [editing, setEditing] = useState<WorkoutSet>();
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const past = previous?.[exercise.sets.length] ?? previous?.at(-1);
  const last = exercise.sets.at(-1);
  const reference = past ?? last;
  const initial: SetInput = reference ? { ...setInUnit(reference, unit), type: 'Working', effort: null } : { unit, weight: null, reps: 8, type: 'Working', effort: null };

  async function act(action: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError('');
    try { await action(); if (message) notify(message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your changes.'); }
    finally { setBusy(false); }
  }

  async function log(set: SetInput) {
    armTimerAudio();
    await act(async () => {
      await db.logSet(exercise.id, set);
      navigator.vibrate?.(24);
    }, 'Set logged.');
  }

  function submitSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = readSet(new FormData(event.currentTarget), initial.unit);
    if (!parsed.success) { setError('Check the weight, reps, and effort values.'); return; }
    void log(parsed.data);
  }

  return <section className="panel exercise-block" aria-label={exercise.name}>
    <header><div className="exercise-title"><span className="glyph-box"><Dumbbell size={21} /></span><div><h2>{exercise.name}</h2><p>{exercise.muscle}</p></div></div>
      <Button variant="ghost" size="icon" onClick={() => setNotes(true)} aria-label={`Notes for ${exercise.name}`}><NotebookPen size={19} /></Button></header>
    {previous === undefined && <p className="past-hint muted">Finding previous sets…</p>}
    {past && <p className="past-hint"><Repeat2 size={16} /> Last session · {setWeightLabel(past, unit)} × {past.reps}</p>}
    <WorkoutSetList active name={exercise.name} sets={exercise.sets} unit={unit} onEdit={(set) => { setError(''); setEditing(set); }} />
    <form key={`${exercise.sets.length}-${unit}-${reference?.id ?? 'none'}`} className="set-form" onSubmit={submitSet}>
      <SetFields initial={initial} />
      <div className="set-action-row"><label className="rest-setting"><Timer size={16} /><span className="sr-only">Rest duration for {exercise.name}</span><select value={exercise.restSeconds} disabled={busy} onChange={(event) => { const restSeconds = Number(event.target.value); void act(() => db.workoutExercises.update(exercise.id, { restSeconds })); }}>
        <option value="0">Rest off</option>{[30, 45, 60, 90, 120, 150, 180, 240, 300].map((value) => <option key={value} value={value}>{value < 60 ? `${value} s rest` : `${Number((value / 60).toFixed(1))} min rest`}</option>)}
      </select></label><div className="row-actions">{last && <Button variant="secondary" onClick={() => log(last)} disabled={busy}><Repeat2 size={17} /> Repeat last set</Button>}<Button type="submit" disabled={busy}><Check size={18} /> Log set</Button></div></div>
    </form>
    {exercise.notes && <p className="exercise-note">{exercise.notes}</p>}
    {error && !editing && !notes && <p className="error-text" role="alert">{error}</p>}
    <Modal open={notes} onOpenChange={(open) => { setNotes(open); setError(''); }} title={`${exercise.name} notes`}>
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get('note')); void act(async () => { await db.workoutExercises.update(exercise.id, { notes: value }); setNotes(false); }, 'Exercise notes saved.'); }}>
        <label>Notes<textarea name="note" rows={5} maxLength={4000} defaultValue={exercise.notes} /></label>{error && <p role="alert" className="error-text">{error}</p>}<Button type="submit" disabled={busy} className="dialog-action">Save notes</Button>
      </form>
    </Modal>
    {editing && <EditSetDialog set={editing} exerciseName={exercise.name} unit={unit} onClose={() => setEditing(undefined)} notify={notify} />}
  </section>;
}
