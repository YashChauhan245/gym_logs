import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchExercise, parseQuickLog } from '@/domain/quick-log';
import { exerciseSchema, type Unit } from '@/domain/workout';

type Example = [string, string, number | null, Unit, number[]];
const examples: Example[] = [
  ['Bench press 60kg x 8, 8, 6', 'Bench press', 60, 'kg', [8, 8, 6]],
  ['Squat 5x5 @ 100', 'Squat', 100, 'kg', [5, 5, 5, 5, 5]],
  ['Lat pulldown 40 x 12, 10, 10', 'Lat pulldown', 40, 'kg', [12, 10, 10]],
  ['Push-ups 3 sets of 15', 'Push-ups', null, 'kg', [15, 15, 15]],
  ['Bench 62.5kg X 8', 'Bench', 62.5, 'kg', [8]],
  ['  BENCH PRESS    60KG   x  8  ', 'BENCH PRESS', 60, 'kg', [8]],
  ['• Bench 60 kg × 8,7', 'Bench', 60, 'kg', [8, 7]],
  ['- Deadlift 100kg x 5', 'Deadlift', 100, 'kg', [5]],
  ['Squat: 3 x 4 @ 95kg', 'Squat', 95, 'kg', [4, 4, 4]],
  ['Bench — 45 x 10', 'Bench', 45, 'kg', [10]],
  ['Lat Pulldown 40kg x 12/10/8', 'Lat Pulldown', 40, 'kg', [12, 10, 8]],
  ['Row 50 x 10 reps', 'Row', 50, 'kg', [10]],
  ['DB Row 22,5 kg x 10', 'DB Row', 22.5, 'kg', [10]],
  ['Cable fly .5 kg x 8', 'Cable fly', 0.5, 'kg', [8]],
  ['Lateral raises 4.25kg x 12', 'Lateral raises', 4.25, 'kg', [12]],
  ['Squat 2 × 5 @ 62.5 kg', 'Squat', 62.5, 'kg', [5, 5]],
  ['Curl 15*12', 'Curl', 15, 'kg', [12]],
  ['Pullup 1 set of 6 reps', 'Pullup', null, 'kg', [6]],
  ['Pull ups 2 sets of 8 @ 5 kg', 'Pull ups', 5, 'kg', [8, 8]],
  ['Push-up 0kg x 4', 'Push-up', 0, 'kg', [4]],
  ['Bench press 135lb x 5', 'Bench press', 135, 'lb', [5]],
  ['Bench press 135 lbs x 5, 4', 'Bench press', 135, 'lb', [5, 4]],
  ['Deadlift 225 LB X 4', 'Deadlift', 225, 'lb', [4]],
  ['Deadlift 2x3 @ 225lb', 'Deadlift', 225, 'lb', [3, 3]],
  ['Cable fly 22.25 pounds x 8', 'Cable fly', 22.25, 'lb', [8]],
  ['Chest press 65 pound x 10', 'Chest press', 65, 'lb', [10]],
  ['Squat 2 sets of 3 @ 100 lbs', 'Squat', 100, 'lb', [3, 3]],
  ['Lunge 12 kilograms x 8', 'Lunge', 12, 'kg', [8]],
  ['Leg press 130 kgs x 15', 'Leg press', 130, 'kg', [15]],
  ['Bench press 60 kilos x 8 reps', 'Bench press', 60, 'kg', [8]],
  ['Incline DB Press\t20kg x 6 , 5 , 5', 'Incline DB Press', 20, 'kg', [6, 5, 5]],
  ['Bench prss 60kg x 8', 'Bench prss', 60, 'kg', [8]],
  ['sqaUt 5 x 5 @ 100', 'sqaUt', 100, 'kg', [5, 5, 5, 5, 5]],
  ['Barbell 21s 20kg x 21', 'Barbell 21s', 20, 'kg', [21]],
  ['1-arm cable row 25 kg x 15', '1-arm cable row', 25, 'kg', [15]],
  ['Pendlay Row 70kg x 1', 'Pendlay Row', 70, 'kg', [1]],
  ['Squat 1 x 1 @ 0', 'Squat', 0, 'kg', [1]],
  ['Seated calf raise 30kg x 20,20,20,20', 'Seated calf raise', 30, 'kg', [20, 20, 20, 20]],
  ['Dip 1 set of 1', 'Dip', null, 'kg', [1]],
  ['Dumbbell bench press 12.5x12', 'Dumbbell bench press', 12.5, 'kg', [12]],
  ['DB Seated Press 15 x 8 reps', 'DB Seated Press', 15, 'kg', [8]],
  ['Crunches 2 sets of 25', 'Crunches', null, 'kg', [25, 25]],
];

describe('Quick Log text parsing', () => {
  it.each(examples)('parses %s', (text, name, weight, unit, reps) => {
    expect(parseQuickLog(text, 'kg')).toEqual([{ index: 0, raw: text, kind: 'sets', name, sets: reps.map((rep) => ({ weight, unit, reps: rep, type: 'Working', effort: null })) }]);
  });

  it.each(['  Felt strong today.  ', 'Bench 0x5 @ 100', 'Squat 51x5 @ 100', 'Bench -10kg x 8', 'Bench 20kg x 0', 'Bench 60kg x 1000', 'Bench 2700kg x 8', 'Squat 3 sets of five reps', 'Press x 8', 'I deadlifted today'])('preserves %s as a note', (raw) => {
    expect(parseQuickLog(raw, 'kg')).toEqual([{ index: 0, raw, kind: 'note' }]);
  });

  it('uses the selected unit and keeps original line positions for pasted text', () => {
    const lines = parseQuickLog('Bench 125 x 8\r\n\r\n  Shoulder felt fine  \r\nSquat 5x5 @ 99kg', 'lb');
    expect(lines.map((line) => line.index)).toEqual([0, 2, 3]);
    expect(lines[0]).toMatchObject({ sets: [{ weight: 125, unit: 'lb' }] });
    expect(lines[1]).toMatchObject({ kind: 'note', raw: '  Shoulder felt fine  ' });
    expect(lines[2]).toMatchObject({ sets: Array(5).fill(expect.objectContaining({ weight: 99, unit: 'kg' })) });
  });
});

describe('matching to the bundled catalog', () => {
  const catalog = exerciseSchema.array().parse(JSON.parse(readFileSync('public/data/exercises.json', 'utf8')));

  it.each([['Bench press', 'Barbell Bench Press'], ['Squat', 'Barbell Back Squat'], ['Lat pulldown', 'Lat Pulldown'], ['Push-ups', 'Push-up']])('resolves %s to %s', (input, name) => {
    expect(matchExercise(input, catalog).exact?.name).toBe(name);
  });

  it('suggests typos for confirmation', () => {
    const match = matchExercise('bnch press', catalog);
    expect(match.exact).toBeUndefined();
    expect(match.suggestions[0]?.name).toBe('Barbell Bench Press');
  });

  it('leaves unknown movements open for custom entry', () => {
    expect(matchExercise('Moonlift Reverse Spin', catalog)).toEqual({ exact: undefined, suggestions: [] });
  });
});
