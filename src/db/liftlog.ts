import Dexie, { type EntityTable, type Table } from 'dexie';
import { localDate } from '@/domain/date';
import { setInputSchema, toGrams, type Exercise, type SetInput, type Unit } from '@/domain/workout';
import type { Food, FoodLog, NutritionGoals } from '@/domain/nutrition';
import type { CloudBaseline, CloudState } from '@/cloud/types';

export type Profile = {
  id: 'guest'; goal: 'Strength' | 'Build muscle' | 'Lose fat' | 'Stay active';
  experience: 'Beginner' | 'Intermediate' | 'Advanced'; days: number; unit: Unit;
  theme: 'dark' | 'light' | 'system'; onboarded: boolean;
};

export const defaultProfile: Profile = {
  id: 'guest', goal: 'Strength', experience: 'Beginner', days: 3, unit: 'kg', theme: 'dark', onboarded: false,
};

export type Workout = {
  id: string; title: string; status: 'active' | 'finished'; startedAt: number;
  finishedAt?: number; updatedAt: number; localDate: string; notes: string;
};
export type WorkoutExercise = {
  id: string; workoutId: string; exerciseId: string; name: string; muscle: string; position: number;
  restSeconds: number; notes: string;
};
export type WorkoutSet = SetInput & {
  id: string; workoutExerciseId: string; workoutId: string; exerciseId: string; position: number;
  loadGrams: number | null; completedAt: number; restSeconds: number; source: 'manual' | 'quick-log';
};
type Rest = { workoutId: string; exerciseName: string; deadline: number; seconds: number };
type DeviceState = { id: 'rest'; rest: Rest } | { id: 'quick-log'; draft: string };
type QuickGroup = { exercise: Exercise; sets: SetInput[] };
export type WorkoutDetails = { workout: Workout; exercises: (WorkoutExercise & { sets: WorkoutSet[] })[] };

export class LiftLogDB extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  workouts!: EntityTable<Workout, 'id'>;
  workoutExercises!: EntityTable<WorkoutExercise, 'id'>;
  sets!: EntityTable<WorkoutSet, 'id'>;
  customExercises!: EntityTable<Exercise, 'id'>;
  favourites!: EntityTable<{ id: string }, 'id'>;
  deviceState!: Table<DeviceState, DeviceState['id']>;
  foodLogs!: EntityTable<FoodLog, 'id'>;
  nutritionGoals!: EntityTable<NutritionGoals, 'id'>;
  customFoods!: EntityTable<Food, 'id'>;
  cloudBaseline!: EntityTable<CloudBaseline, 'key'>;
  cloudState!: Table<CloudState, CloudState['key']>;

  constructor(name = 'liftlog-guest') {
    super(name);
    this.version(1).stores({
      profiles: 'id', workouts: 'id, [status+startedAt], localDate, finishedAt',
      workoutExercises: 'id, workoutId, [workoutId+position]',
      sets: 'id, workoutId, [workoutExerciseId+position], [exerciseId+completedAt]',
      customExercises: 'id, name', favourites: 'id', deviceState: 'id',
    });
    this.version(2).stores({ foodLogs: 'id, date, [date+meal]', nutritionGoals: 'id', customFoods: 'id' });
    this.version(3).stores({ cloudBaseline: 'key', cloudState: 'key' });
  }

  async getActive() {
    return this.workouts.where('[status+startedAt]').between(['active', Dexie.minKey], ['active', Dexie.maxKey], true, true).last();
  }

  async startWorkout() {
    return this.transaction('rw', this.workouts, () => this.getOrStartWorkout());
  }

  private async getOrStartWorkout() {
    const active = await this.getActive();
    if (active) return active;
    const now = Date.now();
    const workout: Workout = {
      id: crypto.randomUUID(), title: 'Workout', status: 'active',
      startedAt: now, updatedAt: now, localDate: localDate(now), notes: '',
    };
    await this.workouts.add(workout);
    return workout;
  }

  async getWorkout(id: string): Promise<WorkoutDetails | undefined> {
    return this.transaction('r', [this.workouts, this.workoutExercises, this.sets], async () => {
      const workout = await this.workouts.get(id);
      if (!workout) return undefined;
      const [exercises, sets] = await Promise.all([
        this.workoutExercises.where('workoutId').equals(id).sortBy('position'),
        this.sets.where('workoutId').equals(id).sortBy('position'),
      ]);
      const byExercise = new Map<string, WorkoutSet[]>();
      for (const set of sets) {
        const group = byExercise.get(set.workoutExerciseId);
        if (group) group.push(set);
        else byExercise.set(set.workoutExerciseId, [set]);
      }
      return { workout, exercises: exercises.map((exercise) => ({ ...exercise, sets: byExercise.get(exercise.id) ?? [] })) };
    });
  }

  async addExercise(workoutId: string, exercise: Exercise) {
    return this.transaction('rw', [this.workouts, this.workoutExercises], async () => {
      const workout = await this.workouts.get(workoutId);
      if (!workout || workout.status !== 'active') throw new Error('This workout has already been closed.');
      return this.getOrAddExercise(workoutId, exercise);
    });
  }

  private async getOrAddExercise(workoutId: string, exercise: Exercise) {
    const rows = await this.workoutExercises.where('workoutId').equals(workoutId).sortBy('position');
    const existing = rows.find((row) => row.exerciseId === exercise.id);
    if (existing) return existing;
    const row: WorkoutExercise = {
      id: crypto.randomUUID(), workoutId, exerciseId: exercise.id, name: exercise.name, muscle: exercise.muscle,
      position: (rows.at(-1)?.position ?? -1) + 1, restSeconds: 90, notes: '',
    };
    await this.workoutExercises.add(row);
    return row;
  }

  private async writeSets(exercise: WorkoutExercise, sets: SetInput[], source: WorkoutSet['source']) {
    const last = await this.sets.where('[workoutExerciseId+position]')
      .between([exercise.id, Dexie.minKey], [exercise.id, Dexie.maxKey], true, true).last();
    const start = (last?.position ?? 0) + 1;
    const now = Date.now();
    const rows = sets.map((set, index): WorkoutSet => ({
      ...set, id: crypto.randomUUID(), workoutExerciseId: exercise.id, workoutId: exercise.workoutId,
      exerciseId: exercise.exerciseId, position: start + index, completedAt: now, restSeconds: exercise.restSeconds,
      loadGrams: set.weight === null ? null : toGrams(set.weight, set.unit), source,
    }));
    await this.sets.bulkAdd(rows);
  }

  async logSet(exerciseId: string, value: SetInput) {
    const set = setInputSchema.parse(value);
    await this.transaction('rw', [this.workouts, this.workoutExercises, this.sets, this.deviceState], async () => {
      const exercise = await this.workoutExercises.get(exerciseId);
      const workout = exercise && await this.workouts.get(exercise.workoutId);
      if (!exercise || !workout || workout.status !== 'active') throw new Error('Open the workout to log a set.');
      await this.writeSets(exercise, [set], 'manual');
      await this.workouts.update(workout.id, { updatedAt: Date.now() });
      if (exercise.restSeconds > 0) {
        await this.deviceState.put({ id: 'rest', rest: {
          workoutId: workout.id, exerciseName: exercise.name, seconds: exercise.restSeconds,
          deadline: Date.now() + exercise.restSeconds * 1000,
        } });
      }
    });
  }

  async lastSessionSets(exercise: WorkoutExercise) {
    const latest = await this.sets.where('[exerciseId+completedAt]')
      .between([exercise.exerciseId, Dexie.minKey], [exercise.exerciseId, Dexie.maxKey], true, true)
      .reverse().filter((set) => set.workoutId !== exercise.workoutId).first();
    if (!latest) return [];
    return this.sets.where('[workoutExerciseId+position]')
      .between([latest.workoutExerciseId, Dexie.minKey], [latest.workoutExerciseId, Dexie.maxKey], true, true).toArray();
  }

  async editSet(id: string, value: SetInput) {
    const set = setInputSchema.parse(value);
    const updated = await this.sets.update(id, { ...set, loadGrams: set.weight === null ? null : toGrams(set.weight, set.unit) });
    if (!updated) throw new Error('This set was already removed from the workout.');
  }

  async saveQuickLog(groups: QuickGroup[], notes: string[]) {
    const valid = groups.map((group) => ({ ...group, sets: setInputSchema.array().min(1).parse(group.sets) }));
    if (!valid.length && !notes.length) throw new Error('Add a set or a note first.');
    return this.transaction('rw', [this.workouts, this.workoutExercises, this.sets, this.deviceState, this.customExercises], async () => {
      const workout = await this.getOrStartWorkout();
      for (const group of valid) {
        if (group.exercise.custom) await this.customExercises.put(group.exercise);
        const exercise = await this.getOrAddExercise(workout.id, group.exercise);
        await this.writeSets(exercise, group.sets, 'quick-log');
      }
      await this.workouts.update(workout.id, {
        notes: notes.length ? [workout.notes, notes.join('\n')].filter(Boolean).join('\n') : workout.notes,
        updatedAt: Date.now(),
      });
      await this.deviceState.delete('quick-log');
      return workout.id;
    });
  }

  async finishWorkout(id: string) {
    await this.transaction('rw', [this.workouts, this.sets, this.deviceState], async () => {
      const workout = await this.workouts.get(id);
      if (!workout || workout.status === 'finished') return;
      const count = await this.sets.where('workoutId').equals(id).count();
      if (!count && !workout.notes.trim()) throw new Error('Log a set or save a workout note before finishing.');
      const now = Date.now();
      await this.workouts.update(id, { status: 'finished', finishedAt: now, updatedAt: now });
      const state = await this.deviceState.get('rest');
      if (state?.id === 'rest' && state.rest.workoutId === id) await this.deviceState.delete('rest');
    });
  }

  async clearWorkspace() {
    await this.transaction('rw', this.tables, () => Promise.all(this.tables.map((table) => table.clear())));
  }
}

export const db = new LiftLogDB();

export const workoutVolume = (sets: WorkoutSet[]) => sets.reduce((total, set) => total + (set.loadGrams ?? 0) * set.reps, 0);
