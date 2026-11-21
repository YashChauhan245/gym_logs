'use client';

import { useState, type FormEvent } from 'react';
import { ChevronLeft, Plus, Search, Trash2, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useDatabase } from '@/db/workspace';
import { foodSchema, foodTotals, meals, normalizeFood, type Food, type FoodLog, type FoodUnit, type Meal } from '@/domain/nutrition';
import { FoodPortionFields, gramLabel, kcalLabel, MacroLine, portionLabel } from './nutrition-controls';
import { saveFoodLogs } from './nutrition-data';

export function FoodEntry({ date, meal: initialMeal, entry, foods, recents, loading, catalogError, retryCatalog, onClose, onSaved, onRecipe }: {
  date: string; meal?: Meal; entry?: FoodLog; foods: Food[]; recents: FoodLog[]; loading: boolean; catalogError: boolean;
  retryCatalog: () => void; onClose: () => void; onSaved: (message: string) => void; onRecipe: (food: Food, meal: Meal) => void;
}) {
  const db = useDatabase();
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? initialMeal ?? 'Lunch');
  const [food, setFood] = useState(entry?.food);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [unit, setUnit] = useState<FoodUnit | ''>(entry?.unit ?? '');
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const needle = normalizeFood(query);
  const shownRecents = needle ? [] : recents;
  const recentIds = new Set(shownRecents.map(({ food }) => food.id));
  const filtered = foods.filter((item) => !recentIds.has(item.id) && [item.name, ...item.aliases].some((name) => normalizeFood(name).includes(needle)));
  const current = food && unit ? foodTotals(food, Number(amount), unit) : null;
  const mealSelect = <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as Meal)}>{meals.map((item) => <option key={item}>{item}</option>)}</select></label>;

  function openFood(selected: Food, lastPortion?: Pick<FoodLog, 'amount' | 'unit'>) {
    setFood(selected);
    setUnit(lastPortion?.unit ?? selected.portions[0]?.unit ?? 'g');
    setAmount(String(lastPortion?.amount ?? (selected.portions.length ? 1 : 100)));
    setError('');
  }

  async function addCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = foodSchema.safeParse({
      id: crypto.randomUUID(), name: String(form.get('name') ?? '').trim(), aliases: [], portions: [],
      source: { kind: 'Your food', reference: 'Nutrition values entered per 100 g' },
      per100g: { kcal: Number(form.get('kcal')), protein: Number(form.get('protein')), carbs: Number(form.get('carbs')), fat: Number(form.get('fat')) },
    });
    if (!value.success || !value.data.name) { setError('Enter a food name and valid amounts per 100 g.'); return; }
    setBusy(true);
    setError('');
    try {
      await db.customFoods.add(value.data);
      setCreating(false);
      openFood(value.data);
    } catch { setError('Could not save your food on this device.'); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!food || !unit || !current) { setError('Choose a valid portion.'); return; }
    setBusy(true);
    setError('');
    try {
      await saveFoodLogs(db, [{ date, meal, food, unit, amount: Number(amount) }], entry?.id);
      onSaved(entry ? 'Food updated.' : `Added to ${meal.toLowerCase()}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this food.'); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!entry) return;
    setBusy(true);
    setError('');
    try { await db.foodLogs.delete(entry.id); onSaved('Food removed.'); }
    catch { setError('Could not remove this food.'); }
    finally { setBusy(false); }
  }

  const title = creating ? 'Add your own food' : food?.name ?? (initialMeal ? `Add food to ${meal.toLowerCase()}` : 'Log food');

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title={title} className="nutrition-dialog">
    {creating ? <form className="stack-form" onSubmit={addCustom}>
      <p className="muted">Use the label values per 100 g.</p>
      <label>Food name<input name="name" required maxLength={80} defaultValue={query} /></label>
      <div className="two-fields">{[['kcal', 'Calories (kcal)', 1000], ['protein', 'Protein (g)', 100], ['carbs', 'Carbs (g)', 100], ['fat', 'Fat (g)', 100]].map(([key, label, max]) =>
        <label key={key}>{label}<input name={String(key)} type="number" inputMode="decimal" min="0" max={max} step="any" required /></label>)}</div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="row-actions"><Button variant="secondary" onClick={() => { setCreating(false); setError(''); }}>Back</Button><Button type="submit" disabled={busy}>Save food</Button></div>
    </form> : food ? <form className="stack-form" onSubmit={save}>
      <button className="back-link" onClick={() => { setFood(undefined); setError(''); }} type="button"><ChevronLeft size={17} /> Choose another food</button>
      {mealSelect}
      <FoodPortionFields food={food} amount={amount} unit={unit} onAmount={setAmount} onUnit={setUnit} />
      <p className="muted food-source">
        {food.source.url ? <a href={food.source.url} target="_blank" rel="noreferrer">{food.source.kind} reference</a> : food.source.kind}
        {food.source.reference && <span> · {food.source.reference}</span>}
      </p>
      {unit !== 'g' && unit && <p className="muted">Household portions are estimates. Use grams for a weighed serving.</p>}
      {current && <div className="food-preview"><strong>{kcalLabel(current.kcal)} kcal</strong><MacroLine totals={current} /></div>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {deleting ? <div className="row-actions"><span>Remove this entry?</span><Button variant="secondary" onClick={() => setDeleting(false)}>Keep</Button><Button variant="danger" disabled={busy} onClick={remove}>Remove</Button></div> : <div className="row-actions">
        {entry && <Button variant="ghost" aria-label="Remove food" onClick={() => setDeleting(true)}><Trash2 size={17} /></Button>}
        {food.recipe && <Button variant="secondary" onClick={() => onRecipe(food, meal)}>Adjust recipe</Button>}
        <Button type="submit" disabled={busy || !current}>{entry ? 'Save changes' : 'Log food'}</Button>
      </div>}
    </form> : <>
      <div className={`food-picker-controls${initialMeal ? '' : ' with-meal'}`}>
        <label className="search-field"><Search size={18} /><input type="search" aria-label="Search foods" placeholder="Search roti, dal, rice, paneer…" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(20); }} /></label>
        {!initialMeal && mealSelect}
      </div>
      {shownRecents.length > 0 && <section className="food-recents" aria-labelledby="recent-foods-title">
        <h3 id="recent-foods-title">Recent foods</h3>
        <ul className="food-picker-results">{shownRecents.map((item) => <li key={item.food.id}>
          <button type="button" className="food-picker-row" onClick={() => openFood(item.food, item)}>
            <span className="glyph-box"><Utensils size={17} /></span>
            <span className="food-picker-name"><strong>{item.food.name}</strong><small>Last portion · {portionLabel(item)}</small></span>
            <strong className="food-picker-energy">{kcalLabel(foodTotals(item.food, item.amount, item.unit)?.kcal ?? 0)} <small>kcal</small></strong>
          </button>
        </li>)}</ul>
      </section>}
      {loading && <p className="muted" role="status">Loading foods…</p>}
      {catalogError && <p className="muted">Food catalog unavailable. <button type="button" className="text-action" onClick={retryCatalog}>Retry</button></p>}
      {!loading && needle && !filtered.length && <p className="muted">No foods match your search.</p>}
      {shownRecents.length > 0 && filtered.length > 0 && <h3 className="food-catalog-heading">Food catalog</h3>}
      <ul className="food-picker-results" aria-label="Food search results">{filtered.slice(0, limit).map((item) => {
        const serving = item.portions[0];
        const kcal = foodTotals(item, serving ? 1 : 100, serving?.unit ?? 'g')?.kcal ?? 0;
        return <li key={item.id}><button className="food-picker-row" onClick={() => openFood(item)}>
          <span className="glyph-box"><Utensils size={17} /></span>
          <span className="food-picker-name"><strong>{item.name}</strong><small>{serving ? `1 ${serving.label} (${gramLabel(serving.grams)} g)` : '100 g'} · {item.source.kind}</small></span>
          <strong className="food-picker-energy">{kcalLabel(kcal)} <small>kcal</small></strong>
        </button></li>;
      })}</ul>
      <div className="row-actions">{filtered.length > limit && <Button variant="ghost" onClick={() => setLimit(limit + 20)}>Show more</Button>}<Button variant="secondary" onClick={() => setCreating(true)}><Plus size={17} /> Add your own food</Button></div>
    </>}
  </Modal>;
}
