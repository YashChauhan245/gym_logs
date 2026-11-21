import type { Workout, WorkoutSet } from '@/db/liftlog';
import { localDate, localDateAtNoon, shiftLocalDate, weekDays } from './date';

export const progressRanges = [4, 8, 12] as const;
export type ProgressRange = (typeof progressRanges)[number];

export function firstProgressWeek(today: string, range: ProgressRange) {
  const week = weekDays(localDateAtNoon(today));
  return shiftLocalDate(localDate(week[0]), -7 * (range - 1));
}

export function summarizeTraining(workouts: Workout[], sets: WorkoutSet[], today: string, range: ProgressRange) {
  const first = firstProgressWeek(today, range);
  const weeks = Array.from({ length: range }, (_, index) => ({
    start: shiftLocalDate(first, index * 7), end: shiftLocalDate(first, index * 7 + 6),
    sessions: 0, sets: 0, volume: 0,
  }));
  const weekByWorkout = new Map<string, (typeof weeks)[number]>();
  const recentWorkouts = workouts.filter((workout) => workout.status === 'finished' && workout.localDate >= first && workout.localDate <= today);
  let volume = 0;
  let setCount = 0;
  let elapsedMs = 0;
  const best = new Map<string, WorkoutSet>();

  for (const workout of recentWorkouts) {
    const week = weeks.find(({ end }) => workout.localDate <= end)!;
    week.sessions++;
    weekByWorkout.set(workout.id, week);
    elapsedMs += Math.max(0, (workout.finishedAt ?? workout.startedAt) - workout.startedAt);
  }

  for (const set of sets) {
    const week = weekByWorkout.get(set.workoutId);
    if (!week) continue;
    const setVolume = (set.loadGrams ?? 0) * set.reps;
    volume += setVolume;
    setCount++;
    week.volume += setVolume;
    week.sets++;

    if (!set.loadGrams) continue;
    const previous = best.get(set.exerciseId);
    const previousLoad = previous?.loadGrams ?? 0;
    if (!previous || set.loadGrams > previousLoad || (set.loadGrams === previousLoad && set.reps > previous.reps)) {
      best.set(set.exerciseId, set);
    }
  }

  return { weeks, workouts: recentWorkouts, minutes: Math.round(elapsedMs / 60_000), volume, setCount, bestSets: [...best.values()].sort((a, b) => b.completedAt - a.completedAt) };
}
