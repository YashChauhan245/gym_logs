'use client';

import { useEffect, useState } from 'react';

export function createCatalogLoader<T>(path: string, decode: (value: unknown) => T[]) {
  let request: Promise<T[]> | undefined;

  return function load() {
    request ??= fetch(path).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load ${path}.`);
      return decode(await response.json());
    }).catch((error: unknown) => {
      request = undefined;
      throw error;
    });
    return request;
  };
}

export function useBundledCatalog<T>(load: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    load().then((data) => { if (active) setItems(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [load, attempt]);

  function retry() {
    setError(false);
    setAttempt((previous) => previous + 1);
  }

  return { items, loading: !items && !error, error, retry };
}
