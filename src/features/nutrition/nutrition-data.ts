'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LiftLogDB } from '@/db/liftlog';
import { useDatabase } from '@/db/workspace';
import { foodSchema, nutritionLogSchema, portionGrams, type Food, type FoodLog, type LogInput } from '@/domain/nutrition';

let catalogRequest: Promise<Food[]> | undefined;
function fetchCatalog() {
  catalogRequest ??= fetch('/data/foods.json').then(async (response) => {
    if (!response.ok) throw new Error('Food catalog unavailable.');
    return foodSchema.array().parse(await response.json());
  }).catch((reason: unknown) => {
    catalogRequest = undefined;
    throw reason;
  });
  return catalogRequest;
}

export function useFoods() {
  const db = useDatabase();
  const custom = useLiveQuery(() => db.customFoods.toArray()) ?? [];
  const [seed, setSeed] = useState<Food[]>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    fetchCatalog().then((records) => { if (current) setSeed(records); })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [attempt]);

  return {
    foods: [...custom, ...(seed ?? [])], loading: !seed && !error, error,
    retry: () => { setError(false); setAttempt((value) => value + 1); },
  };
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
