import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDatabase } from '@/db/workspace';
import { exerciseSchema } from '@/domain/workout';
import { createCatalogLoader, useBundledCatalog } from '@/hooks/use-bundled-catalog';

const schema = exerciseSchema.array();
const loadCatalog = createCatalogLoader('/data/exercises.json', (data) => schema.parse(data));

export function useCatalog() {
  const db = useDatabase();
  const custom = useLiveQuery(() => db.customExercises.toArray(), [db]);
  const { items, ...status } = useBundledCatalog(loadCatalog);
  const exercises = useMemo(() => [...(custom ?? []), ...(items ?? [])], [custom, items]);
  return { exercises, ...status };
}
