'use client';

import { useState } from 'react';
import { maxSetWeight, setInputSchema, setTypes, type SetInput, type Unit } from '@/domain/workout';

export function readSet(form: FormData, unit: Unit) {
  const weight = String(form.get('weight') ?? '').trim();
  const reps = String(form.get('reps') ?? '').trim();
  const effortKind = form.get('effortKind');
  const effort = String(form.get('effort') ?? '').trim();
  return setInputSchema.safeParse({
    weight: weight ? Number(weight) : null, unit, reps: reps ? Number(reps) : NaN, type: form.get('type'),
    effort: effortKind ? { kind: effortKind, value: effort ? Number(effort) : NaN } : null,
  });
}

export function SetFields({ initial }: { initial: SetInput }) {
  const [effortKind, setEffortKind] = useState<string>(initial.effort?.kind ?? '');
  return <>
    <div className="set-fields">
      <label>Weight ({initial.unit})<input name="weight" type="number" inputMode="decimal" min="0" max={maxSetWeight} step="any" placeholder="Bodyweight" defaultValue={initial.weight ?? ''} /></label>
      <label>Reps<input name="reps" type="number" inputMode="numeric" min="1" max="999" required defaultValue={initial.reps} /></label>
    </div>
    <details className="set-options" open={initial.type !== 'Working' || Boolean(initial.effort) || undefined}>
      <summary>Set type &amp; effort</summary>
      <div className="two-fields">
        <label>Set type<select name="type" defaultValue={initial.type}>{setTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Effort<select name="effortKind" value={effortKind} onChange={(event) => setEffortKind(event.target.value)}><option value="">None</option><option>RPE</option><option>RIR</option></select></label>
      </div>
      {effortKind && <label>{effortKind} value<input name="effort" key={effortKind} type="number" inputMode={effortKind === 'RPE' ? 'decimal' : 'numeric'} required min={effortKind === 'RPE' ? 1 : 0} max={effortKind === 'RPE' ? 10 : 20} step={effortKind === 'RPE' ? 'any' : 1} defaultValue={initial.effort?.kind === effortKind ? initial.effort.value : ''} /></label>}
    </details>
  </>;
}
