import { setInputSchema, type Exercise, type SetInput, type Unit } from '@/domain/workout';

const number = String.raw`\d+(?:[.,]\d+)?|[.,]\d+`;
const unit = String.raw`(kg|kgs|kilos?|kilograms?|lb|lbs|pounds?)?`;
const exercise = String.raw`(.+?)(?:\s*[:–—]\s*|\s+)`;
const times = String.raw`\s*[x×*]\s*`;
const setsAtWeight = new RegExp(`^${exercise}(\\d+)${times}(\\d+)\\s*@\\s*(${number})\\s*${unit}$`, 'i');
const bodyweight = new RegExp(`^${exercise}(\\d+)\\s+sets?\\s+of\\s+(\\d+)(?:\\s+reps?)?$`, 'i');
const weightAndReps = new RegExp(`^${exercise}(${number})\\s*${unit}${times}(\\d+(?:\\s*[,/]\\s*\\d+)*)(?:\\s+reps?)?$`, 'i');
const weightedCount = new RegExp(`^${exercise}(\\d+)\\s+sets?\\s+of\\s+(\\d+)\\s*@\\s*(${number})\\s*${unit}$`, 'i');

export type QuickLine = { index: number; raw: string } & (
  | { kind: 'note' }
  | { kind: 'sets'; name: string; sets: SetInput[] }
);

function inputUnit(value: string | undefined, fallback: Unit): Unit {
  if (!value) return fallback;
  return /^(lb|pound)/i.test(value) ? 'lb' : 'kg';
}

export function parseQuickLog(text: string, defaultUnit: Unit): QuickLine[] {
  return text.split(/\r\n|\n|\r/).flatMap((raw, index): QuickLine[] => {
    const line = raw.trim().replace(/^[-•]\s+/, '');
    if (!line) return [];

    let name = '';
    let reps: number[] = [];
    let weight: number | null = null;
    let parsedUnit = defaultUnit;
    const counted = setsAtWeight.exec(line) ?? weightedCount.exec(line) ?? bodyweight.exec(line);
    const repeated = weightAndReps.exec(line);

    if (counted) {
      name = counted[1];
      const count = Number(counted[2]);
      if (count > 0 && count <= 50) reps = Array<number>(count).fill(Number(counted[3]));
      if (counted[4] !== undefined) weight = Number(counted[4].replace(',', '.'));
      parsedUnit = inputUnit(counted[5], defaultUnit);
    } else if (repeated) {
      name = repeated[1];
      weight = Number(repeated[2].replace(',', '.'));
      parsedUnit = inputUnit(repeated[3], defaultUnit);
      reps = repeated[4].split(/[,/]/).map(Number);
    }

    const sets = reps.map((rep): SetInput => ({ weight, reps: rep, unit: parsedUnit, type: 'Working', effort: null }));
    if (!name.trim() || !sets.length || sets.length > 50 || !sets.every((set) => setInputSchema.safeParse(set).success)) {
      return [{ kind: 'note', index, raw }];
    }
    return [{ kind: 'sets', index, raw, name: name.trim().replace(/[:–—]\s*$/, ''), sets }];
  });
}

export function normalizeName(text: string) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function distance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, position) => position);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + Number(left[row - 1] !== right[column - 1]));
    }
    previous = current;
  }
  return previous[right.length];
}

export function matchExercise(name: string, catalog: Exercise[]) {
  const query = normalizeName(name);
  if (!query || query.length > 100) return { exact: undefined, suggestions: [] };
  const exact: Exercise[] = [];
  const similar: { exercise: Exercise; score: number }[] = [];
  const threshold = query.length < 4 ? 0 : query.length < 9 ? 1 : 2;

  for (const exercise of catalog) {
    const names = [exercise.name, ...exercise.aliases].map(normalizeName);
    if (names.includes(query)) {
      exact.push(exercise);
      continue;
    }
    const score = Math.min(...names.map((candidate) => {
      if (candidate.includes(query) && query.length >= 3) return 3 + (candidate.length - query.length) / 100;
      if (Math.abs(candidate.length - query.length) > threshold) return Infinity;
      const edits = distance(candidate, query);
      return edits <= threshold ? edits : Infinity;
    }));
    if (Number.isFinite(score)) similar.push({ exercise, score });
  }
  similar.sort((a, b) => a.score - b.score || a.exercise.name.localeCompare(b.exercise.name));
  return { exact: exact.length === 1 ? exact[0] : undefined, suggestions: [...exact, ...similar.map((item) => item.exercise)].slice(0, 5) };
}
