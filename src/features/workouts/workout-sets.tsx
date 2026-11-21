'use client';

import { useState, type FormEvent } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { WorkoutSet } from '@/db/liftlog';
import { useDatabase } from '@/db/workspace';
import { fromGrams, maxSetWeight, weightLabel, type SetInput, type Unit } from '@/domain/workout';
import { readSet, SetFields } from './set-fields';

export function setWeightLabel(set: WorkoutSet, unit: Unit) {
  return set.loadGrams === null ? 'Bodyweight' : `${weightLabel(set.loadGrams, unit)} ${unit}`;
}

export function setInUnit({ weight, unit, reps, type, effort, loadGrams }: WorkoutSet, preferredUnit: Unit): SetInput {
  if (preferredUnit === unit || loadGrams === null) return { weight, unit: preferredUnit, reps, type, effort };
  const converted = Number(fromGrams(loadGrams, preferredUnit).toFixed(2));
  return converted <= maxSetWeight
    ? { weight: converted, unit: preferredUnit, reps, type, effort }
    : { weight, unit, reps, type, effort };
}

export function WorkoutSetList({ name, sets, unit, active = false, onEdit }: {
  name: string; sets: WorkoutSet[]; unit: Unit; active?: boolean; onEdit: (set: WorkoutSet) => void;
}) {
  if (sets.length === 0) return null;
  return <ul className="set-list">
    {sets.map((set, index) => <li key={set.id}>
      <span className="set-index">{active && <Check size={15} />} {index + 1}</span>
      <strong>{setWeightLabel(set, unit)} × {set.reps}</strong>
      <span className="muted">{set.type}{active && set.effort && ` · ${set.effort.kind} ${set.effort.value}`}</span>
      <Button size="icon" variant="ghost" aria-label={`Edit set ${index + 1} for ${name}`} onClick={() => onEdit(set)}><Pencil size={16} /></Button>
    </li>)}
  </ul>;
}

export function EditSetDialog({ set, exerciseName, unit, onClose, notify }: {
  set: WorkoutSet; exerciseName: string; unit: Unit; onClose: () => void; notify: (message: string) => void;
}) {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const initial = setInUnit(set, unit);

  async function commit(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      notify(message);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the set change.');
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = readSet(new FormData(event.currentTarget), initial.unit);
    if (!parsed.success) {
      setError('Check the weight, reps, and effort values.');
      return;
    }
    // A rep-only edit preserves the original weight instead of storing a rounded conversion.
    const next = parsed.data.weight === initial.weight ? { ...parsed.data, weight: set.weight, unit: set.unit } : parsed.data;
    void commit(() => db.editSet(set.id, next), 'Set updated.');
  }

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title={`Edit ${exerciseName} set`}>
    <form className="stack-form" onSubmit={save}>
      <SetFields initial={initial} />
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="row-actions">
        <Button variant="danger" disabled={busy} onClick={() => commit(() => db.sets.delete(set.id), 'Set deleted.')}><Trash2 size={16} /> Delete set</Button>
        <Button type="submit" disabled={busy}>Save changes</Button>
      </div>
    </form>
  </Modal>;
}
