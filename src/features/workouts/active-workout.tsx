'use client';

import { useState, type FormEvent } from 'react';
import { Check, ChevronLeft, ClipboardList, Dumbbell, NotebookPen, Pencil, Plus, Repeat2, Timer, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { workoutVolume, type LiftLogDB, type Workout, type WorkoutExercise, type WorkoutSet } from '@/db/liftlog';
import { useDatabase } from '@/db/workspace';
import { clockLabel, fromGrams, weightLabel, type SetInput, type Unit } from '@/domain/workout';
import { SetFields, readSet } from './set-fields';
import { armTimerAudio, RestTimer, useClock, useWakeLock } from './rest-timer';

type Details = NonNullable<Awaited<ReturnType<LiftLogDB['getWorkout']>>>;

export function ActiveWorkout({ workout, unit, onAdd, onStart, onQuick, onFinished, notify }: {
  workout: Workout | null; unit: Unit; onAdd: () => void; onStart: () => Promise<void>;
  onQuick: () => void; onFinished: (id: string) => void; notify: (message: string) => void;
}) {
  const db = useDatabase();
  const detail = useLiveQuery(() => workout ? db.getWorkout(workout.id) : undefined, [workout?.id]);
  if (!workout) return <section className="panel empty-state"><span className="glyph-box"><Dumbbell size={23} /></span><h1>Start a workout</h1><p>Open an empty session and add the exercises you want to train.</p><Button onClick={onStart}><Plus size={18} /> Start workout</Button></section>;
  if (!detail) return <p role="status" className="muted">Opening your workout…</p>;
  return <WorkoutEditor detail={detail} unit={unit} onAdd={onAdd} onQuick={onQuick} onFinished={onFinished} notify={notify} />;
}

function WorkoutEditor({ detail, unit, onAdd, onQuick, onFinished, notify }: {
  detail: Details; unit: Unit; onAdd: () => void; onQuick: () => void; onFinished: (id: string) => void; notify: (message: string) => void;
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

function displayInput(set: WorkoutSet, unit: Unit): SetInput {
  return { ...set, unit, weight: set.unit === unit ? set.weight : set.loadGrams === null ? null : Number(fromGrams(set.loadGrams, unit).toFixed(2)) };
}

function ExerciseBlock({ exercise, unit, notify }: { exercise: WorkoutExercise & { sets: WorkoutSet[] }; unit: Unit; notify: (message: string) => void }) {
  const db = useDatabase();
  const previous = useLiveQuery(() => db.lastSessionSets(exercise), [exercise.exerciseId, exercise.workoutId]);
  const [editing, setEditing] = useState<WorkoutSet>();
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const past = previous?.[exercise.sets.length] ?? previous?.at(-1);
  const last = exercise.sets.at(-1);
  const reference = past ?? last;
  const initial = reference ? { ...displayInput(reference, unit), type: 'Working' as const, effort: null } : { unit, weight: null, reps: 8, type: 'Working' as const, effort: null };

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
    const parsed = readSet(new FormData(event.currentTarget), unit);
    if (!parsed.success) { setError('Check the weight, reps, and effort values.'); return; }
    void log(parsed.data);
  }

  return <section className="panel exercise-block" aria-label={exercise.name}>
    <header><div className="exercise-title"><span className="glyph-box"><Dumbbell size={21} /></span><div><h2>{exercise.name}</h2><p>{exercise.muscle}</p></div></div>
      <Button variant="ghost" size="icon" onClick={() => setNotes(true)} aria-label={`Notes for ${exercise.name}`}><NotebookPen size={19} /></Button></header>
    {previous === undefined && <p className="past-hint muted">Finding previous sets…</p>}
    {past && <p className="past-hint"><Repeat2 size={16} /> Last session · {past.loadGrams === null ? 'Bodyweight' : `${weightLabel(past.loadGrams, unit)} ${unit}`} × {past.reps}</p>}
    {exercise.sets.length > 0 && <ul className="set-list">{exercise.sets.map((set, index) => <li key={set.id}>
      <span className="set-index"><Check size={15} /> {index + 1}</span>
      <strong>{set.loadGrams === null ? 'Bodyweight' : `${weightLabel(set.loadGrams, unit)} ${unit}`} × {set.reps}</strong>
      <span className="muted">{set.type}{set.effort ? ` · ${set.effort.kind} ${set.effort.value}` : ''}</span>
      <Button size="icon" variant="ghost" aria-label={`Edit set ${index + 1} for ${exercise.name}`} onClick={() => { setError(''); setEditing(set); }}><Pencil size={16} /></Button>
    </li>)}</ul>}
    <form key={`${exercise.sets.length}-${unit}-${reference?.id ?? 'none'}`} className="set-form" onSubmit={submitSet}>
      <SetFields initial={initial} unit={unit} />
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
    {editing && <EditSet set={editing} exerciseName={exercise.name} unit={unit} onClose={() => setEditing(undefined)} notify={notify} />}
  </section>;
}

function EditSet({ set, exerciseName, unit, onClose, notify }: { set: WorkoutSet; exerciseName: string; unit: Unit; onClose: () => void; notify: (message: string) => void }) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function commit(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    try { await action(); notify(message); onClose(); }
    catch { setError('Could not save the set change.'); }
    finally { setBusy(false); }
  }

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title={`Edit ${exerciseName} set`}>
    <form className="stack-form" onSubmit={(event) => {
      event.preventDefault();
      const parsed = readSet(new FormData(event.currentTarget), unit);
      if (!parsed.success) { setError('Check the weight, reps, and effort values.'); return; }
      const original = displayInput(set, unit);
      const updated = parsed.data.weight === original.weight ? { ...parsed.data, weight: set.weight, unit: set.unit } : parsed.data;
      void commit(() => db.editSet(set.id, updated), 'Set updated.');
    }}><SetFields initial={displayInput(set, unit)} unit={unit} />{error && <p role="alert" className="error-text">{error}</p>}
      <div className="row-actions"><Button variant="danger" disabled={busy} onClick={() => commit(() => db.sets.delete(set.id), 'Set deleted.')}><Trash2 size={16} /> Delete set</Button><Button type="submit" disabled={busy}>Save changes</Button></div></form>
  </Modal>;
}

export function WorkoutSummary({ id, unit, notify }: { id: string; unit: Unit; notify: (message: string) => void }) {
  const db = useDatabase();
  const detail = useLiveQuery(async () => (await db.getWorkout(id)) ?? null, [id]);
  const [editing, setEditing] = useState<{ set: WorkoutSet; exerciseName: string }>();
  if (detail === undefined) return <p role="status" className="muted">Loading workout…</p>;
  if (!detail) return <section className="empty-state panel"><h1>Workout unavailable</h1><Button asChild variant="secondary"><a href="#workouts">Back to workouts</a></Button></section>;
  const { workout, exercises } = detail;
  const sets = exercises.flatMap((exercise) => exercise.sets);
  return <div className="workout-screen"><a className="back-link" href="#workouts"><ChevronLeft size={18} /> Workouts</a><div className="section-heading"><div><span className="training-status"><Check size={16} /> Workout complete</span><h1>{workout.title}</h1></div><Button variant="secondary" asChild><a href="#today">Back to Today</a></Button></div>
    <div className="summary-metrics"><div className="panel"><small>Duration</small><strong>{clockLabel((workout.finishedAt ?? workout.startedAt) - workout.startedAt)}</strong></div><div className="panel"><small>Sets logged</small><strong>{sets.length}</strong></div><div className="panel"><small>Volume</small><strong>{weightLabel(workoutVolume(sets), unit)} <span>{unit}</span></strong></div></div>
    {exercises.map((exercise) => <section className="panel history-exercise" key={exercise.id}><h2>{exercise.name}</h2><ul className="set-list">{exercise.sets.map((set, index) => <li key={set.id}><span className="set-index">{index + 1}</span><strong>{set.loadGrams === null ? 'Bodyweight' : `${weightLabel(set.loadGrams, unit)} ${unit}`} × {set.reps}</strong><span className="muted">{set.type}</span><Button size="icon" variant="ghost" aria-label={`Edit set ${index + 1} for ${exercise.name}`} onClick={() => setEditing({ set, exerciseName: exercise.name })}><Pencil size={16} /></Button></li>)}</ul>{exercise.notes && <p className="exercise-note">{exercise.notes}</p>}</section>)}
    {workout.notes && <section className="panel session-note"><h2>Workout notes</h2><p>{workout.notes}</p></section>}
    {editing && <EditSet {...editing} unit={unit} onClose={() => setEditing(undefined)} notify={notify} />}
  </div>;
}
