import { z } from 'zod';

export const units = ['kg', 'lb'] as const;
export type Unit = (typeof units)[number];
export const setTypes = ['Working', 'Warm-up', 'Drop', 'Failure', 'Superset'] as const;
export type SetType = (typeof setTypes)[number];

export const exerciseSchema = z.object({
  id: z.string(), name: z.string(), aliases: z.array(z.string()), muscle: z.string(),
  secondary: z.array(z.string()), equipment: z.string(), level: z.string(),
  movement: z.string(), cues: z.array(z.string()), images: z.array(z.string()),
  custom: z.boolean().optional(),
  targetAreas: z.array(z.string()).optional(),
});
export type Exercise = z.infer<typeof exerciseSchema>;

export function createCustomExercise(name: string, muscle = 'other', equipment = 'body only', cue = '', targetAreas: string[] = []): Exercise {
  return {
    id: crypto.randomUUID(), name: name.trim(), aliases: [], muscle, equipment, secondary: [],
    level: 'custom', movement: 'strength', cues: cue.trim() ? [cue.trim()] : [], images: [], custom: true, targetAreas,
  };
}

export const maxSetWeight = 2500;
export const setInputSchema = z.object({
  weight: z.number().min(0).max(maxSetWeight).nullable(),
  unit: z.enum(units),
  reps: z.number().int().min(1).max(999),
  type: z.enum(setTypes),
  effort: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('RPE'), value: z.number().min(1).max(10) }),
    z.object({ kind: z.literal('RIR'), value: z.number().int().min(0).max(20) }),
  ]).nullable(),
});
export type SetInput = z.infer<typeof setInputSchema>;

export function toGrams(weight: number, unit: Unit) {
  return Math.round(weight * (unit === 'kg' ? 1000 : 453.59237));
}

export function fromGrams(grams: number, unit: Unit) {
  return grams / (unit === 'kg' ? 1000 : 453.59237);
}

export function weightLabel(grams: number, unit: Unit, decimals = 1) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(fromGrams(grams, unit));
}

export function clockLabel(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
