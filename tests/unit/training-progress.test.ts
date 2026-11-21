import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutSet } from '@/db/liftlog';
import { firstProgressWeek, summarizeTraining } from '@/domain/training-progress';

const workout = (id: string, localDate: string, status: Workout['status'] = 'finished'): Workout => ({
  id, localDate, status, title: id, startedAt: 0, finishedAt: status === 'finished' ? 30 * 60_000 : undefined, updatedAt: 0, notes: '',
});
const set = (id: string, workoutId: string, loadGrams: number | null, reps: number): WorkoutSet => ({
  id, workoutId, workoutExerciseId: `${workoutId}-press`, exerciseId: 'press', position: 1, loadGrams, reps,
  weight: loadGrams === null ? null : loadGrams / 1000, unit: 'kg', type: 'Working', effort: null,
  completedAt: 0, restSeconds: 0, source: 'manual',
});

describe('training progress', () => {
  it('starts a date range on Monday across a year boundary', () => {
    expect(firstProgressWeek('2027-01-02', 4)).toBe('2026-12-07');
  });

  it('groups completed workouts by week and counts only their recorded sets', () => {
    const data = summarizeTraining([
      workout('previous', '2026-11-15'), workout('current', '2026-11-16'),
      workout('active', '2026-11-16', 'active'), workout('older', '2026-10-01'), workout('future', '2026-11-22'),
    ], [
      set('less-weight', 'previous', 40_000, 8), set('best', 'current', 50_000, 6),
      set('bodyweight', 'current', null, 12), set('unfinished', 'active', 60_000, 5),
    ], '2026-11-21', 4);

    expect(data.workouts.map(({ id }) => id)).toEqual(['previous', 'current']);
    expect(data).toMatchObject({ minutes: 60, volume: 620_000, setCount: 3 });
    expect(data.weeks.slice(-2)).toMatchObject([{ sessions: 1, sets: 1, volume: 320_000 }, { sessions: 1, sets: 2, volume: 300_000 }]);
    expect(data.bestSets.map(({ id }) => id)).toEqual(['best']);
  });
});
