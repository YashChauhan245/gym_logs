'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDatabase } from '@/db/workspace';
import { foodSchema } from '@/domain/nutrition';
import { createCatalogLoader, useBundledCatalog } from '@/hooks/use-bundled-catalog';

const schema = foodSchema.array();
const loadFoods = createCatalogLoader('/data/foods.json', (data) => schema.parse(data));

export function useFoods() {
  const db = useDatabase();
  const custom = useLiveQuery(() => db.customFoods.toArray(), [db]);
  const { items, ...status } = useBundledCatalog(loadFoods);
  const foods = useMemo(() => [...(custom ?? []), ...(items ?? [])], [custom, items]);
  return { foods, ...status };
}
