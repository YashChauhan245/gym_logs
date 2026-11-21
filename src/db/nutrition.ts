import { shiftLocalDate } from '@/domain/date';
import { nutritionLogSchema, portionGrams, type FoodLog, type LogInput } from '@/domain/nutrition';
import type { LiftLogDB } from './liftlog';

export async function getRecentFoods(db: LiftLogDB, today: string) {
  const start = shiftLocalDate(today, -13);
  const entries = await db.foodLogs.where('date').between(start, today, true, true).sortBy('createdAt');
  const distinct = new Map<string, FoodLog>();

  for (const entry of entries.reverse()) {
    if (distinct.has(entry.food.id) || portionGrams(entry.food, entry.amount, entry.unit) === null) continue;
    distinct.set(entry.food.id, entry);
    if (distinct.size === 4) break;
  }
  return [...distinct.values()];
}

export async function saveFoodLogs(db: LiftLogDB, inputs: LogInput[], existingId?: string) {
  if (!inputs.length || (existingId && inputs.length !== 1)) throw new Error('Review the foods before saving.');
  const rows = nutritionLogSchema.array().parse(inputs);
  if (rows.some((row) => portionGrams(row.food, row.amount, row.unit) === null)) throw new Error('Check the food portions.');

  await db.transaction('rw', db.foodLogs, async () => {
    if (existingId) {
      const updated = await db.foodLogs.update(existingId, rows[0]);
      if (!updated) throw new Error('This food was already removed from the diary.');
      return;
    }
    const now = Date.now();
    await db.foodLogs.bulkAdd(rows.map((row): FoodLog => ({ ...row, id: crypto.randomUUID(), createdAt: now })));
  });
}
