import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiftLogDB, workoutVolume } from '@/db/liftlog';
import { fromGrams, toGrams, type Exercise, type SetInput } from '@/domain/workout';

const press: Exercise = {
  id: 'bench', name: 'Bench Press', aliases: [], muscle: 'chest', secondary: [], equipment: 'barbell',
  level: 'beginner', movement: 'strength', cues: [], images: [],
};
const set: SetInput = { weight: 135, unit: 'lb', reps: 8, type: 'Working', effort: { kind: 'RIR', value: 2 } };

describe('offline workout storage', () => {
  let db: LiftLogDB;

  beforeEach(() => { db = new LiftLogDB(`liftlog-test-${crypto.randomUUID()}`); });
  afterEach(async () => { await db.delete(); });

  it('starts one active workout when multiple tabs start simultaneously', async () => {
    const anotherTab = new LiftLogDB(db.name);
    const [first, second] = await Promise.all([db.startWorkout(), anotherTab.startWorkout()]);
    expect(first.id).toBe(second.id);
    expect(await db.workouts.count()).toBe(1);
    anotherTab.close();
  });

  it('persists a set and rest deadline, resumes on reopen, and computes volume', async () => {
    const workout = await db.startWorkout();
    const movement = await db.addExercise(workout.id, press);
    await db.logSet(movement.id, set);
    db.close();
    db = new LiftLogDB(db.name);
    expect((await db.getActive())?.id).toBe(workout.id);
    const detail = await db.getWorkout(workout.id);
    expect(detail?.exercises[0].sets[0]).toMatchObject({ reps: 8, loadGrams: 61235 });
    expect(workoutVolume(detail!.exercises[0].sets)).toBe(489880);
    const timer = await db.deviceState.get('rest');
    expect(timer).toMatchObject({ rest: { workoutId: workout.id, seconds: 90 } });
    expect(timer?.id === 'rest' && timer.rest.deadline).toBeGreaterThan(Date.now());
    await db.finishWorkout(workout.id);
    expect(await db.getActive()).toBeUndefined();
    expect(await db.deviceState.get('rest')).toBeUndefined();
  });

  it('saves paste as normal sets, reuses an exercise and preserves notes', async () => {
    await db.deviceState.put({ id: 'quick-log', draft: 'working draft' });
    const id = await db.saveQuickLog([{ exercise: press, sets: [set, set] }, { exercise: press, sets: [set] }], ['  Keep my grip narrower  ']);
    const detail = await db.getWorkout(id);
    expect(detail?.exercises).toHaveLength(1);
    expect(detail?.exercises[0].sets.map(({ position, source }) => [position, source])).toEqual([[1, 'quick-log'], [2, 'quick-log'], [3, 'quick-log']]);
    expect(detail?.workout.notes).toBe('  Keep my grip narrower  ');
    expect(await db.deviceState.get('quick-log')).toBeUndefined();
  });

  it('rolls back a Quick Log write when persistence fails', async () => {
    const hook = () => { throw new Error('disk full'); };
    db.sets.hook('creating').subscribe(hook);
    await db.deviceState.put({ id: 'quick-log', draft: 'Bench 135lb x 8' });
    await expect(db.saveQuickLog([{ exercise: press, sets: [set] }], ['Keep this'])).rejects.toThrow('disk full');
    expect(await db.workouts.count()).toBe(0);
    expect(await db.workoutExercises.count()).toBe(0);
    expect(await db.deviceState.get('quick-log')).toMatchObject({ draft: 'Bench 135lb x 8' });
    db.sets.hook('creating').unsubscribe(hook);
  });

  it('uses the previous session after changing units and editing an old set', async () => {
    const first = await db.startWorkout();
    const exercise = await db.addExercise(first.id, press);
    await db.logSet(exercise.id, set);
    const previous = (await db.sets.toArray())[0];
    await db.editSet(previous.id, { ...set, unit: 'kg', weight: 62.5 });
    await db.finishWorkout(first.id);
    const second = await db.startWorkout();
    const next = await db.addExercise(second.id, press);
    expect(await db.lastSessionSets(next)).toMatchObject([{ loadGrams: 62500, reps: 8 }]);
  });

  it('reports when a set another tab removed can no longer be edited', async () => {
    const workout = await db.startWorkout();
    const exercise = await db.addExercise(workout.id, press);
    await db.logSet(exercise.id, set);
    const [saved] = await db.sets.toArray();
    await db.sets.delete(saved.id);
    await expect(db.editSet(saved.id, { ...set, reps: 10 })).rejects.toThrow('already removed');
  });
});

describe('load conversion', () => {
  it('round-trips decimal kilogram and pound values using integer grams', () => {
    expect(fromGrams(toGrams(62.5, 'kg'), 'kg')).toBe(62.5);
    expect(fromGrams(toGrams(135, 'lb'), 'lb')).toBeCloseTo(135, 2);
    expect(toGrams(0, 'lb')).toBe(0);
  });
});
