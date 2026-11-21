'use client';

import { useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { workoutVolume, type WorkoutSet } from '@/db/liftlog';
import { useDatabase } from '@/db/workspace';
import { clockLabel, weightLabel, type Unit } from '@/domain/workout';
import { EditSetDialog, WorkoutSetList } from './workout-sets';

export function WorkoutSummary({ id, unit, notify }: { id: string; unit: Unit; notify: (message: string) => void }) {
  const db = useDatabase();
  const detail = useLiveQuery(async () => (await db.getWorkout(id)) ?? null, [db, id]);
  const [editing, setEditing] = useState<{ set: WorkoutSet; exerciseName: string }>();

  if (detail === undefined || (detail && detail.workout.id !== id)) return <p role="status" className="muted">Loading workout…</p>;
  if (!detail || detail.workout.status !== 'finished') return <section className="empty-state panel">
    <h1>Workout unavailable</h1>
    <Button asChild variant="secondary"><a href="#workouts">Back to workouts</a></Button>
  </section>;

  const { workout, exercises } = detail;
  const sets = exercises.flatMap((exercise) => exercise.sets);
  const duration = (workout.finishedAt ?? workout.startedAt) - workout.startedAt;

  return <div className="workout-screen">
    <a className="back-link" href="#workouts"><ChevronLeft size={18} /> Workouts</a>
    <div className="section-heading">
      <div><span className="training-status"><Check size={16} /> Workout complete</span><h1>{workout.title}</h1></div>
      <Button variant="secondary" asChild><a href="#today">Back to Today</a></Button>
    </div>
    <div className="summary-metrics">
      <div className="panel"><small>Duration</small><strong>{clockLabel(duration)}</strong></div>
      <div className="panel"><small>Sets logged</small><strong>{sets.length}</strong></div>
      <div className="panel"><small>Volume</small><strong>{weightLabel(workoutVolume(sets), unit)} <span>{unit}</span></strong></div>
    </div>
    {exercises.map((exercise) => <section className="panel history-exercise" key={exercise.id}>
      <h2>{exercise.name}</h2>
      <WorkoutSetList name={exercise.name} sets={exercise.sets} unit={unit} onEdit={(set) => setEditing({ set, exerciseName: exercise.name })} />
      {exercise.notes && <p className="exercise-note">{exercise.notes}</p>}
    </section>)}
    {workout.notes && <section className="panel session-note"><h2>Workout notes</h2><p>{workout.notes}</p></section>}
    {editing && <EditSetDialog {...editing} unit={unit} onClose={() => setEditing(undefined)} notify={notify} />}
  </div>;
}
