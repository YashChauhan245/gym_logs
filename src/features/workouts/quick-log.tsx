'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, FileText, Mic, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useDatabase } from '@/db/workspace';
import { matchExercise, normalizeName, parseQuickLog } from '@/domain/quick-log';
import { setInputSchema, type Exercise, type SetInput, type Unit } from '@/domain/workout';
import { createExercise } from '@/features/catalog/exercise-library';
import { useCatalog } from '@/features/catalog/use-catalog';

type SpeechResult = Event & { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognizer = EventTarget & { lang: string; processLocally?: boolean; start: () => void; abort: () => void };
type SpeechFactory = { new (): Recognizer; available?: (options: { langs: string[]; processLocally: true }) => Promise<string> };

function speechFactory() {
  const browser = window as Window & { SpeechRecognition?: SpeechFactory; webkitSpeechRecognition?: SpeechFactory };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

const spoken = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function normalizeSpeech(value: string) {
  const numbers = value.trim().replace(/[.!?]$/, '')
    .replace(new RegExp(`\\b(${tens.join('|')})(?:[ -](${spoken.slice(1, 10).join('|')}))?\\b`, 'gi'), (_, ten: string, one?: string) =>
      String((tens.indexOf(ten.toLowerCase()) + 2) * 10 + (one ? spoken.indexOf(one.toLowerCase()) : 0)))
    .replace(new RegExp(`\\b(${spoken.join('|')})\\b`, 'gi'), (word) => String(spoken.indexOf(word.toLowerCase())));
  return numbers.replace(/(kilos?|kilograms?|pounds?|kgs?|lbs?)\s+(\d+)\s+reps?$/i, '$1 x $2');
}

type SetEdit = { weight: string; reps: string };

export function QuickLog({ initialDraft, unit, onClose, onSaved }: {
  initialDraft: string; unit: Unit; onClose: () => void; onSaved: (message: string) => void;
}) {
  const db = useDatabase();
  const [draft, setDraft] = useState(initialDraft);
  const [choices, setChoices] = useState<Record<string, Exercise>>({});
  const [edits, setEdits] = useState<Record<string, SetEdit>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voice, setVoice] = useState('');
  const [listening, setListening] = useState(false);
  const recognizer = useRef<Recognizer | null>(null);
  const currentDraft = useRef(initialDraft);
  const catalog = useCatalog();
  const lines = useMemo(() => parseQuickLog(draft, unit), [draft, unit]);
  const matches = new Map<string, ReturnType<typeof matchExercise>>();
  for (const line of lines) {
    if (line.kind === 'sets' && !matches.has(line.name)) matches.set(line.name, matchExercise(line.name, catalog.exercises));
  }

  useEffect(() => () => recognizer.current?.abort(), []);

  function changeText(text: string) {
    currentDraft.current = text;
    setDraft(text);
    setEdits({});
    setError('');
    void db.deviceState.put({ id: 'quick-log', draft: text }).catch(() => setError('Draft could not be saved on this device.'));
  }

  async function dictate() {
    const Speech = speechFactory();
    if (!Speech) { setVoice('Voice input is unavailable here. Type or paste a workout instead.'); return; }
    try {
      const recognition = new Speech();
      if (!('processLocally' in recognition) || !Speech.available || await Speech.available({ langs: ['en-US'], processLocally: true }) !== 'available') {
        setVoice('On-device English dictation is unavailable. You can type or paste a workout.');
        return;
      }
      recognition.lang = 'en-US';
      recognition.processLocally = true;
      recognition.addEventListener('result', (event) => {
        const text = normalizeSpeech((event as SpeechResult).results[0][0].transcript);
        changeText([currentDraft.current.trimEnd(), text].filter(Boolean).join('\n').slice(0, 6000));
      });
      recognition.addEventListener('end', () => { recognizer.current = null; setListening(false); });
      recognition.addEventListener('error', () => setVoice('Dictation stopped. You can still type or paste your workout.'));
      recognizer.current = recognition;
      recognition.start();
      setListening(true);
      setVoice('Listening for a workout line…');
    } catch { setVoice('Could not start dictation. Type or paste your workout.'); }
  }

  function resolve(name: string) {
    return choices[normalizeName(name)] ?? matches.get(name)?.exact;
  }

  function currentEdit(index: number, setIndex: number, set: SetInput) {
    return edits[`${index}:${setIndex}`] ?? { weight: set.weight === null ? '' : String(set.weight), reps: String(set.reps) };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const notes: string[] = [];
    const groups: { exercise: Exercise; sets: SetInput[] }[] = [];
    for (const line of lines) {
      if (line.kind === 'note') { notes.push(line.raw); continue; }
      const exercise = resolve(line.name);
      if (!exercise) { setError(`Choose an exercise for “${line.name}” or keep that line as a note.`); return; }
      if (exercise.id === 'note') { notes.push(line.raw); continue; }
      const sets = line.sets.map((set, index) => {
        const edit = currentEdit(line.index, index, set);
        return { ...set, weight: edit.weight.trim() ? Number(edit.weight) : null, reps: edit.reps.trim() ? Number(edit.reps) : NaN };
      });
      if (!setInputSchema.array().safeParse(sets).success) { setError(`Check the weight and reps for ${exercise.name}.`); return; }
      groups.push({ exercise, sets });
    }
    setBusy(true);
    setError('');
    try {
      await db.saveQuickLog(groups, notes);
      const count = groups.reduce((value, group) => value + group.sets.length, 0);
      onSaved(count ? `${count} ${count === 1 ? 'set' : 'sets'} saved to your workout.` : 'Workout note saved.');
    } catch { setError('Could not save this workout. Your draft is still here.'); }
    finally { setBusy(false); }
  }

  return <Modal open onOpenChange={(next) => { if (!next && !busy) onClose(); }} title="Quick Log"
    description="Type or paste a workout, then review the sets before saving." className="quick-dialog">
    <form className="stack-form" onSubmit={save}>
      <label>Workout text<textarea rows={5} maxLength={6000} value={draft} onChange={(event) => changeText(event.target.value)} placeholder={'Bench press 60kg x 8, 8, 6\nSquat 5x5 @ 100\nPush-ups 3 sets of 15'} /></label>
      <div className="quick-toolbar"><span className="muted">Default unit {unit.toUpperCase()}</span><Button size="compact" variant="secondary" onClick={dictate} disabled={listening}><Mic size={16} /> {listening ? 'Listening…' : 'Dictate'}</Button></div>
      {voice && <p role="status" className="muted">{voice}</p>}
      {catalog.loading && draft && <p role="status" className="muted">Matching exercises…</p>}
      {catalog.error && <p className="muted">The standard library is unavailable. <button type="button" className="text-action" onClick={catalog.retry}>Retry</button></p>}
      {lines.length > 0 && <section className="quick-preview" aria-label="Quick Log preview">
        <h3>Review before saving</h3>
        {lines.map((line) => {
          const exercise = line.kind === 'sets' ? resolve(line.name) : undefined;
          if (line.kind === 'note' || exercise?.id === 'note') return <div className="preview-note" key={line.index}>
            <FileText size={17} /><div><strong>Workout note</strong><p>{line.raw}</p>{line.kind === 'sets' && <button type="button" className="text-action" onClick={() => setChoices(({ [normalizeName(line.name)]: discarded, ...rest }) => { void discarded; return rest; })}>Match exercise instead</button>}</div>
          </div>;
          const select = (item: Exercise) => setChoices({ ...choices, [normalizeName(line.name)]: item });
          return <div className="preview-line" key={line.index}>
            <div className="preview-title"><strong>{exercise?.name ?? line.name}</strong><span className="tag">{line.sets.length} {line.sets.length === 1 ? 'set' : 'sets'}</span></div>
            {!exercise && <div className="suggestion-list">
              {matches.get(line.name)?.suggestions.map((item) => <Button key={item.id} size="compact" variant="secondary" onClick={() => select(item)}>{item.name}</Button>)}
              <Button size="compact" variant="secondary" onClick={() => select(createExercise(line.name))}><Plus size={16} /> Create custom</Button>
              <Button size="compact" variant="ghost" onClick={() => select({ ...createExercise(line.name), id: 'note' })}>Keep as note</Button>
            </div>}
            {line.sets.map((set, index) => {
              const edit = currentEdit(line.index, index, set);
              return <div className="preview-set" key={index}>
                <span>Set {index + 1}</span>
                <label><span className="sr-only">{line.name} set {index + 1} weight ({set.unit})</span><input type="number" inputMode="decimal" min="0" max="2500" step="any" placeholder="Bodyweight" value={edit.weight} onChange={(event) => setEdits({ ...edits, [`${line.index}:${index}`]: { ...edit, weight: event.target.value } })} /></label><span>{set.unit}</span>
                <label><span className="sr-only">{line.name} set {index + 1} reps</span><input type="number" inputMode="numeric" min="1" max="999" required value={edit.reps} onChange={(event) => setEdits({ ...edits, [`${line.index}:${index}`]: { ...edit, reps: event.target.value } })} /></label><span>reps</span>
              </div>;
            })}
          </div>;
        })}
      </section>}
      {error && <p role="alert" className="error-text">{error}</p>}
      <Button type="submit" disabled={busy || listening || lines.length === 0} className="dialog-action"><Check size={18} /> Save to workout</Button>
    </form>
  </Modal>;
}
