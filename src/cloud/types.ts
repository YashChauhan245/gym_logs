import { z } from 'zod';
import { exerciseSchema, setInputSchema, units } from '@/domain/workout';
import { foodSchema, goalSchema, nutritionLogSchema } from '@/domain/nutrition';

const id = z.string().min(1).max(160);
const clock = z.number().int().nonnegative();
const base = z.object({ id });
const schemas = {
  profiles: base.extend({ id: z.literal('guest'), goal: z.enum(['Strength', 'Build muscle', 'Lose fat', 'Stay active']), experience: z.enum(['Beginner', 'Intermediate', 'Advanced']), days: z.number().int().min(1).max(7), unit: z.enum(units), theme: z.enum(['dark', 'light', 'system']), onboarded: z.boolean() }),
  workouts: base.extend({ title: z.string(), status: z.enum(['active', 'finished']), startedAt: clock, finishedAt: clock.optional(), updatedAt: clock, localDate: z.iso.date(), notes: z.string() }),
  workoutExercises: base.extend({ workoutId: id, exerciseId: id, name: z.string(), muscle: z.string(), position: clock, restSeconds: clock, notes: z.string() }),
  sets: setInputSchema.extend({ id, workoutExerciseId: id, workoutId: id, exerciseId: id, position: clock, loadGrams: clock.nullable(), completedAt: clock, restSeconds: clock, source: z.enum(['manual', 'quick-log']) }),
  customExercises: exerciseSchema,
  favourites: base,
  foodLogs: nutritionLogSchema.extend({ id, createdAt: clock }),
  nutritionGoals: goalSchema.extend({ id: z.literal('daily') }),
  customFoods: foodSchema,
};

export const syncedStores = ['profiles', 'workouts', 'workoutExercises', 'sets', 'customExercises', 'favourites', 'foodLogs', 'nutritionGoals', 'customFoods'] as const;
export type SyncedStore = (typeof syncedStores)[number];
export type RecordData = { id: string } & Record<string, unknown>;
const row = z.object({ kind: z.enum(syncedStores), record_id: id, revision: clock, payload: z.record(z.string(), z.unknown()).nullable() });
export type CloudRow = z.infer<typeof row>;
export type CloudBaseline = CloudRow & { key: string };
export type Change = Omit<CloudRow, 'revision'> & { seen_revision: number };
export type CloudBatch = { key: 'outbox'; batchId: string; changes: Change[] };
export type CloudState = CloudBatch | { key: 'cursor'; revision: number };

export interface SyncTransport {
  push(batch: CloudBatch): Promise<CloudRow[]>;
  pull(cursor: number): Promise<CloudRow[]>;
}

export function parseCloudRows(input: unknown): CloudRow[] {
  return row.array().parse(input).map((change) => {
    if (change.payload === null) return change;
    const payload = schemas[change.kind].parse(change.payload);
    if (payload.id !== change.record_id) throw new Error('Cloud record identity is invalid.');
    return { ...change, payload };
  });
}
