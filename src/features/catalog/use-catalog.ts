import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDatabase } from '@/db/workspace';
import { exerciseSchema, type Exercise } from '@/domain/workout';

let catalogRequest: Promise<Exercise[]> | undefined;
function loadCatalog() {
  catalogRequest ??= fetch('/data/exercises.json').then(async (response) => {
    if (!response.ok) throw new Error('Exercise catalog unavailable.');
    return exerciseSchema.array().parse(await response.json());
  }).catch((error: unknown) => {
    catalogRequest = undefined;
    throw error;
  });
  return catalogRequest;
}

export function useCatalog() {
  const db = useDatabase();
  const custom = useLiveQuery(() => db.customExercises.toArray());
  const [catalog, setCatalog] = useState<Exercise[]>();
  const [error, setError] = useState(false);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    let active = true;
    loadCatalog().then((data) => {
      if (active) setCatalog(data);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [request]);

  return {
    exercises: [...(custom ?? []), ...(catalog ?? [])], loading: !catalog && !error, error,
    retry: () => { setError(false); setRequest((previous) => previous + 1); },
  };
}
