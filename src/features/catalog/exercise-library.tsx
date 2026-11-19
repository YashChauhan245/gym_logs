'use client';

import { useState, type FormEvent } from 'react';
import { Dumbbell, Plus, Search, Star } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { db } from '@/db/liftlog';
import { normalizeName } from '@/domain/quick-log';
import type { Exercise } from '@/domain/workout';
import { useCatalog } from './use-catalog';

const equipmentLabel = (value: string) => value === 'body only' ? 'Bodyweight' : value;

export function createExercise(name: string, muscle = 'other', equipment = 'body only', cue = ''): Exercise {
  return {
    id: crypto.randomUUID(), name: name.trim(), aliases: [], muscle, equipment, secondary: [],
    level: 'custom', movement: 'strength', cues: cue.trim() ? [cue.trim()] : [], images: [], custom: true,
  };
}

export function ExerciseLibrary({ open, onOpenChange, onPick }: {
  open: boolean; onOpenChange: (open: boolean) => void; onPick?: (exercise: Exercise) => Promise<void>;
}) {
  const catalog = useCatalog();
  const favourites = useLiveQuery(() => db.favourites.toArray()) ?? [];
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [visible, setVisible] = useState(30);
  const [selected, setSelected] = useState<Exercise>();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mediaFailed, setMediaFailed] = useState(false);
  const mainMuscles = [...new Set(catalog.exercises.map((item) => item.muscle))].sort();
  const equipmentTypes = [...new Set(catalog.exercises.map((item) => item.equipment))].sort();
  const favIds = new Set(favourites.map((item) => item.id));
  const normalized = normalizeName(query);
  const filtered = catalog.exercises.filter((item) =>
    (!muscle || item.muscle === muscle || item.secondary.includes(muscle)) && (!equipment || item.equipment === equipment) &&
    (!onlyFavourites || favIds.has(item.id)) && [item.name, ...item.aliases].some((name) => normalizeName(name).includes(normalized)));

  function close() {
    setSelected(undefined);
    setCreating(false);
    setError('');
    onOpenChange(false);
  }

  async function choose(exercise: Exercise) {
    setBusy(true);
    setError('');
    try {
      await onPick?.(exercise);
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add that exercise.');
    } finally { setBusy(false); }
  }

  async function toggleFavourite(exercise: Exercise) {
    try {
      if (favIds.has(exercise.id)) await db.favourites.delete(exercise.id);
      else await db.favourites.put({ id: exercise.id });
    } catch { setError('Could not update favourites.'); }
  }

  async function addCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim();
    if (!name) { setError('Enter an exercise name.'); return; }
    if (catalog.exercises.some((item) => normalizeName(item.name) === normalizeName(name))) {
      setError('An exercise with this name already exists.'); return;
    }
    const exercise = createExercise(name, String(data.get('muscle')), String(data.get('equipment')), String(data.get('cue')));
    setBusy(true);
    setError('');
    try {
      await db.customExercises.add(exercise);
      setCreating(false);
      setSelected(exercise);
      setMediaFailed(false);
    } catch { setError('Could not save the custom exercise.'); }
    finally { setBusy(false); }
  }

  function showDetails(exercise: Exercise) {
    setSelected(exercise);
    setMediaFailed(false);
    setError('');
  }

  const suggestions = selected && catalog.exercises.filter((exercise) => exercise.id !== selected.id && exercise.muscle === selected.muscle && exercise.equipment !== selected.equipment).slice(0, 3);

  return <Modal open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()} className="library-dialog"
    title={creating ? 'New exercise' : selected?.name ?? 'Exercise library'}
    description={!creating && !selected ? `${catalog.exercises.length || 'Browse'}${catalog.exercises.length ? ' exercises to choose from' : ' exercises by muscle or equipment'}` : undefined}>
    {error && <p role="alert" className="error-text">{error}</p>}
    {creating ? <form onSubmit={addCustom} className="stack-form">
      <label>Exercise name<input name="name" required maxLength={80} defaultValue={query} /></label>
      <div className="two-fields">
        <label>Muscle group<select name="muscle" defaultValue="other"><option value="other">Other</option>{mainMuscles.filter((item) => item !== 'other').map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Equipment<select name="equipment" defaultValue="body only"><option value="body only">Bodyweight</option>{equipmentTypes.filter((item) => item !== 'body only').map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <label>Form cue<textarea name="cue" maxLength={600} rows={3} /></label>
      <div className="row-actions"><Button variant="secondary" onClick={() => { setCreating(false); setError(''); }}>Back to library</Button><Button type="submit" disabled={busy}>Save exercise</Button></div>
    </form> : selected ? <div className="exercise-details">
      {selected.images[0] && !mediaFailed && /* eslint-disable-next-line @next/next/no-img-element */
        <img src={selected.images[0]} alt={`${selected.name} demonstration`} onError={() => setMediaFailed(true)} />}
      {mediaFailed && <p className="muted">Image unavailable offline. Form instructions are available below.</p>}
      <div className="tags"><span>{selected.muscle}</span><span>{equipmentLabel(selected.equipment)}</span><span>{selected.level}</span><span>{selected.movement}</span></div>
      {selected.cues.length > 0 && <section><h3>How to do it</h3><ol>{selected.cues.map((cue, index) => <li key={index}>{cue}</li>)}</ol></section>}
      {suggestions && suggestions.length > 0 && <section><h3>Try with other equipment</h3><div className="suggestion-list">{suggestions.map((item) => <Button key={item.id} size="compact" variant="secondary" onClick={() => showDetails(item)}>{item.name}</Button>)}</div></section>}
      <div className="row-actions"><Button variant="secondary" onClick={() => setSelected(undefined)}>Back to library</Button><Button variant="secondary" aria-pressed={favIds.has(selected.id)} onClick={() => toggleFavourite(selected)}><Star size={17} fill={favIds.has(selected.id) ? 'currentColor' : 'none'} /> Favourite</Button>{onPick && <Button disabled={busy} onClick={() => choose(selected)}><Plus size={18} /> Add to workout</Button>}</div>
    </div> : <>
      <label className="search-field"><Search size={18} /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(30); }} placeholder="Search exercises" aria-label="Search exercises" /></label>
      <div className="library-filters">
        <select aria-label="Filter by muscle" value={muscle} onChange={(event) => { setMuscle(event.target.value); setVisible(30); }}><option value="">All muscles</option>{mainMuscles.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filter by equipment" value={equipment} onChange={(event) => { setEquipment(event.target.value); setVisible(30); }}><option value="">All equipment</option>{equipmentTypes.map((item) => <option key={item} value={item}>{equipmentLabel(item)}</option>)}</select>
        <Button size="icon" variant="secondary" aria-label="Show favourites" aria-pressed={onlyFavourites} onClick={() => { setOnlyFavourites(!onlyFavourites); setVisible(30); }}><Star size={18} fill={onlyFavourites ? 'currentColor' : 'none'} /></Button>
      </div>
      {catalog.loading && <p role="status" className="muted">Loading exercises…</p>}
      {catalog.error && <p className="muted">Catalog unavailable. <button className="text-action" onClick={catalog.retry}>Retry</button></p>}
      {!catalog.loading && filtered.length === 0 && <p className="muted">No exercises match your search.</p>}
      <ul className="catalog-list">{filtered.slice(0, visible).map((exercise) => <li key={exercise.id}>
        <button className="catalog-result" onClick={() => showDetails(exercise)}>
          <span className="glyph-box"><Dumbbell size={17} /></span><span><strong>{exercise.name}</strong><small>{exercise.muscle} · {equipmentLabel(exercise.equipment)}</small></span>
        </button>
        {onPick && <Button size="icon" variant="ghost" aria-label={`Add ${exercise.name}`} onClick={() => choose(exercise)} disabled={busy}><Plus size={20} /></Button>}
      </li>)}</ul>
      <div className="row-actions"><Button size="compact" variant="secondary" onClick={() => { setCreating(true); setError(''); }}><Plus size={17} /> Custom exercise</Button>{filtered.length > visible && <Button size="compact" variant="ghost" onClick={() => setVisible(visible + 30)}>Show more</Button>}</div>
    </>}
  </Modal>;
}
