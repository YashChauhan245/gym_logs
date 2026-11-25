'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, Dumbbell, Plus, Search, Star } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useDatabase } from '@/db/workspace';
import { normalizeName } from '@/domain/quick-log';
import { createCustomExercise, type Exercise } from '@/domain/workout';
import { exerciseAreas, matchesExerciseFocus, muscleGroupFor, muscleGroups } from '@/domain/exercise-focus';
import collections from './collections.json';
import { ExerciseMediaCredits, ExerciseVideo, mediaFor, movementImages } from './exercise-media';
import { useCatalog } from './use-catalog';

const equipmentLabel = (value: string) => value === 'body only' ? 'Bodyweight' : value;
const muscleLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const collectionOptions = [
  { id: 'all', label: 'All' },
  { id: 'essentials', label: 'Essentials' },
  { id: 'popular', label: 'Popular' },
] as const;
const collectionMembers = {
  essentials: new Set(collections.essentials.map((id) => `catalog:${id}`)),
  popular: new Set(collections.popular.map((id) => `catalog:${id}`)),
};

function ExercisePhoto({ src, alt = '', thumbnail = false }: { src?: string; alt?: string; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);

  return <div className={thumbnail ? 'catalog-photo' : 'movement-photo'}>
    {src && !failed ? (
      // Serve the bundled URL directly so it can be reused by the offline cache.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} loading={thumbnail ? 'lazy' : 'eager'} decoding="async" onError={() => setFailed(true)} />
    ) : <span className="exercise-photo-fallback"><Dumbbell size={thumbnail ? 23 : 28} aria-hidden="true" />{!thumbnail && 'Photo unavailable'}</span>}
  </div>;
}

export function ExerciseLibrary({ open, onOpenChange, onPick }: {
  open: boolean; onOpenChange: (open: boolean) => void; onPick?: (exercise: Exercise) => Promise<void>;
}) {
  const db = useDatabase();
  const catalog = useCatalog();
  const favourites = useLiveQuery(() => db.favourites.toArray()) ?? [];
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState<(typeof collectionOptions)[number]['id']>('all');
  const [muscle, setMuscle] = useState('');
  const [area, setArea] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [customMuscle, setCustomMuscle] = useState('other');
  const [customArea, setCustomArea] = useState('');
  const [includeSecondary, setIncludeSecondary] = useState(false);
  const [equipment, setEquipment] = useState('');
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [onlyVideos, setOnlyVideos] = useState(false);
  const [visible, setVisible] = useState(30);
  const [selected, setSelected] = useState<Exercise>();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const guide = useRef<HTMLDivElement>(null);
  const mainMuscles = [...new Set(catalog.exercises.map((item) => item.muscle))].sort();
  const equipmentTypes = [...new Set(catalog.exercises.map((item) => item.equipment))].sort();
  const favIds = new Set(favourites.map((item) => item.id));
  const normalized = normalizeName(query);
  const filtered = catalog.exercises.filter((item) =>
    (collection === 'all' || collectionMembers[collection].has(item.id)) &&
    matchesExerciseFocus(item, muscle, area, includeSecondary) &&
    (!difficulty || item.level === difficulty) &&
    (!equipment || item.equipment === equipment) &&
    (!onlyFavourites || favIds.has(item.id)) && (!onlyVideos || mediaFor(item)?.video) &&
    [item.name, ...item.aliases].some((name) => normalizeName(name).includes(normalized)));
  if (!normalized) {
    const mediaPriority = (item: Exercise) => item.custom || mediaFor(item)?.video ? 2 : movementImages(item).length ? 1 : 0;
    filtered.sort((first, second) => mediaPriority(second) - mediaPriority(first));
  }

  useEffect(() => {
    if (!selected) return;
    guide.current?.closest('.library-dialog')?.scrollTo(0, 0);
    guide.current?.focus({ preventScroll: true });
  }, [selected]);

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
    const exercise = createCustomExercise(name, String(data.get('muscle')), String(data.get('equipment')), String(data.get('cue')), customArea ? [customArea] : []);
    setBusy(true);
    setError('');
    try {
      await db.customExercises.add(exercise);
      setCreating(false);
      setSelected(exercise);
    } catch { setError('Could not save the custom exercise.'); }
    finally { setBusy(false); }
  }

  function showDetails(exercise: Exercise) {
    setSelected(exercise);
    setError('');
  }

  const suggestions = selected && catalog.exercises.filter((exercise) => exercise.id !== selected.id && exercise.muscle === selected.muscle && exercise.equipment !== selected.equipment).slice(0, 3);
  const images = selected ? movementImages(selected) : [];

  return <Modal open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()} className="library-dialog"
    title={creating ? 'New exercise' : selected?.name ?? 'Exercise library'}
    description={!creating && !selected ? 'Browse form guides, movement images, and demonstration videos.' : undefined}>
    {error && <p role="alert" className="error-text">{error}</p>}
    {creating ? <form onSubmit={addCustom} className="stack-form">
      <label>Exercise name<input name="name" required maxLength={80} defaultValue={query} /></label>
      <div className="two-fields">
        <label>Muscle group<select name="muscle" value={customMuscle} onChange={(event) => { setCustomMuscle(event.target.value); setCustomArea(''); }}><option value="other">Other</option>{mainMuscles.filter((item) => item !== 'other').map((item) => <option key={item} value={item}>{muscleLabel(item)}</option>)}</select></label>
        <label>Equipment<select name="equipment" defaultValue="body only"><option value="body only">Bodyweight</option>{equipmentTypes.filter((item) => item !== 'body only').map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {muscleGroupFor(customMuscle) && <label>Target area<select value={customArea} onChange={(event) => setCustomArea(event.target.value)}><option value="">General / whole group</option>{muscleGroupFor(customMuscle)!.areas.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
      <label>Form cue<textarea name="cue" maxLength={600} rows={3} /></label>
      <div className="row-actions"><Button variant="secondary" onClick={() => { setCreating(false); setError(''); }}>Back to library</Button><Button type="submit" disabled={busy}>Save exercise</Button></div>
    </form> : selected ? <div className="exercise-details" ref={guide} tabIndex={-1}>
      <button className="back-link" onClick={() => setSelected(undefined)}><ChevronLeft size={18} /> Back to library</button>
      <div className="tags"><span>{selected.muscle}</span><span>{equipmentLabel(selected.equipment)}</span><span>{selected.level}</span><span>{selected.movement}</span></div>
      <div className="tags" aria-label="Training emphasis">{muscleGroups.flatMap((group) => exerciseAreas(selected, group.id).map((area) => <span key={`${group.id}:${area}`}>{group.label} · {group.areas.find(([id]) => id === area)?.[1]}</span>))}</div>
      {images.length > 0 && <section className="movement-guide" aria-label="Movement images">
        <h3>Movement images</h3>
        <div className="movement-positions">{images.map((src, index) => <figure key={src}>
          <ExercisePhoto src={src} alt={`${selected.name}, position ${index + 1}`} />
          <figcaption>Position {index + 1}</figcaption>
        </figure>)}</div>
      </section>}
      {mediaFor(selected)?.video && <ExerciseVideo key={selected.id} exercise={selected} />}
      {selected.cues.length > 0 && <section className="form-guide" aria-label="Step-by-step form"><h3>Step-by-step form</h3><ol>{selected.cues.map((cue, index) => <li key={index}>{cue}</li>)}</ol></section>}
      {!mediaFor(selected)?.video && <ExerciseVideo key={selected.id} exercise={selected} />}
      <ExerciseMediaCredits exercise={selected} />
      {suggestions && suggestions.length > 0 && <section><h3>Try with other equipment</h3><div className="suggestion-list">{suggestions.map((item) => <Button key={item.id} size="compact" variant="secondary" onClick={() => showDetails(item)}>{item.name}</Button>)}</div></section>}
      <div className="row-actions"><Button variant="secondary" aria-pressed={favIds.has(selected.id)} onClick={() => toggleFavourite(selected)}><Star size={17} fill={favIds.has(selected.id) ? 'currentColor' : 'none'} /> Favourite</Button>{onPick && <Button disabled={busy} onClick={() => choose(selected)}><Plus size={18} /> Add to workout</Button>}</div>
    </div> : <>
      <label className="search-field"><Search size={18} /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(30); }} placeholder="Search exercises" aria-label="Search exercises" /></label>
      <div className="library-collections" role="group" aria-label="Exercise collection">
        {collectionOptions.map(({ id, label }) => <Button key={id} size="compact" variant="secondary" aria-pressed={collection === id}
          onClick={() => { setCollection(id); setVisible(30); }}>{label}</Button>)}
      </div>
      <div className="muscle-groups" role="group" aria-label="Muscle group"><Button size="compact" variant="secondary" aria-pressed={!muscle} onClick={() => { setMuscle(''); setArea(''); setVisible(30); }}>All muscles</Button>{muscleGroups.map((group) => <Button key={group.id} size="compact" variant="secondary" aria-pressed={muscle === group.id} onClick={() => { setMuscle(group.id); setArea(''); setVisible(30); }}>{group.label}</Button>)}</div>
      <div className="library-filters library-focus-filters">
        <label>Target area<select value={area} disabled={!muscle} onChange={(event) => { setArea(event.target.value); setVisible(30); }}><option value="">{muscle ? 'All target areas' : 'Choose a muscle group first'}</option>{muscleGroups.find((group) => group.id === muscle)?.areas.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Equipment<select value={equipment} onChange={(event) => { setEquipment(event.target.value); setVisible(30); }}><option value="">All equipment</option>{equipmentTypes.map((item) => <option key={item} value={item}>{equipmentLabel(item)}</option>)}</select></label>
        <label>Difficulty<select value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setVisible(30); }}><option value="">All levels</option>{[...new Set(catalog.exercises.map((item) => item.level))].sort().map((level) => <option key={level} value={level}>{muscleLabel(level)}</option>)}</select></label>
        <Button size="icon" variant="secondary" aria-label="Show favourites" aria-pressed={onlyFavourites} onClick={() => { setOnlyFavourites(!onlyFavourites); setVisible(30); }}><Star size={18} fill={onlyFavourites ? 'currentColor' : 'none'} /></Button>
      </div>
      <div className="library-refine">{muscle && <label className="check-label library-secondary"><input type="checkbox" checked={includeSecondary} onChange={(event) => { setIncludeSecondary(event.target.checked); setVisible(30); }} /> Include secondary muscles</label>}<label className="check-label library-secondary"><input type="checkbox" checked={onlyVideos} onChange={(event) => { setOnlyVideos(event.target.checked); setVisible(30); }} /> With demo video</label><Button size="compact" variant="ghost" onClick={() => { setMuscle(''); setArea(''); setEquipment(''); setDifficulty(''); setQuery(''); setOnlyFavourites(false); setOnlyVideos(false); setIncludeSecondary(false); setCollection('all'); setVisible(30); }}>Reset filters</Button></div>
      {muscle && <p className="muted focus-explanation">{muscle === 'biceps' ? 'Biceps has two heads. Brachialis is a separate elbow flexor. ' : ''}Areas show training emphasis. An exercise can work several areas.</p>}
      {catalog.loading && <p role="status" className="muted">Loading exercises…</p>}
      {catalog.error && <p className="muted">Catalog unavailable. <button className="text-action" onClick={catalog.retry}>Retry</button></p>}
      {!catalog.loading && !catalog.error && <p role="status" className="muted catalog-count">{filtered.length ? `${filtered.length} ${filtered.length === 1 ? 'exercise' : 'exercises'}` : 'No exercises match your filters.'}</p>}
      <ul className="catalog-list" aria-label="Matching exercises">{filtered.slice(0, visible).map((exercise) => {
        const thumbnail = movementImages(exercise)[0];
        return <li key={exercise.id}>
          <button className={thumbnail ? 'catalog-result' : 'catalog-result catalog-result-text'} onClick={() => showDetails(exercise)}>
            {thumbnail && <ExercisePhoto src={thumbnail} thumbnail />}
            <span className="catalog-result-description"><strong>{exercise.name}</strong><small>{muscleLabel(exercise.muscle)} · {equipmentLabel(exercise.equipment)}{mediaFor(exercise)?.video && ' · Video'}</small></span>
          </button>
          {onPick && <Button className="catalog-add" size="compact" variant="ghost" aria-label={`Add ${exercise.name}`} onClick={() => choose(exercise)} disabled={busy}><Plus size={17} /> Add</Button>}
        </li>;
      })}</ul>
      <div className="row-actions"><Button size="compact" variant="secondary" onClick={() => { setCreating(true); setError(''); }}><Plus size={17} /> Custom exercise</Button>{filtered.length > visible && <Button size="compact" variant="ghost" onClick={() => setVisible(visible + 30)}>Show more</Button>}</div>
    </>}
  </Modal>;
}
